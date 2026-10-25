alter table public.chemical_readings add column tc numeric check(tc between 0 and 30),add column temperature_f numeric check(temperature_f between 0 and 140);
alter table public.pools drop constraint valid_required_readings;
alter table public.pools add constraint valid_required_readings check(required_readings <@ array['fc','ph','ta','cya','ch','salt','cc','tc','temperature_f']::text[]);
create or replace function public.complete_visit(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s public.route_stops; prior public.visits; actor public.profiles; pr public.properties; customer public.customers;
 visit_id uuid; payload_pool jsonb; pool public.pools; readings jsonb; dosage jsonb; task jsonb; photo jsonb;
 reading_key text; reading_value numeric; reading_max numeric; quantity numeric; photo_path text;
 snapshots jsonb:='[]'; snapshot jsonb; seen_pools uuid[]:='{}'; tasks text[]; clean_tasks jsonb; clean_dosages jsonb;
 all_photo_paths text[]:='{}'; v_started timestamptz; v_completed timestamptz:=now(); public_notes text;
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>262144 then raise exception 'Invalid completion payload' using errcode='22023';end if;
 visit_id:=(p_payload->>'id')::uuid;
 if visit_id is null then raise exception 'Visit ID required' using errcode='22023';end if;
 select * into s from public.route_stops where id=(p_payload->>'stop_id')::uuid for update;
 if not found or not public.can_access_stop(s.id) then raise exception 'Not authorized' using errcode='42501';end if;
 select * into actor from public.profiles where id=auth.uid();
 select * into prior from public.visits where id=visit_id or route_stop_id=s.id;
 if found then
  if prior.id=visit_id and prior.route_stop_id=s.id then return jsonb_build_object('visit_id',prior.id,'already_completed',true);end if;
  raise exception 'This stop is already completed, or the visit ID was reused' using errcode='23505';
 end if;
 if s.status not in ('pending','in_progress') then raise exception 'Stop cannot be completed' using errcode='22023';end if;
 if jsonb_typeof(p_payload->'pools') is distinct from 'array' or jsonb_array_length(p_payload->'pools') not between 1 and 30 then raise exception 'Pool records required' using errcode='22023';end if;
 if p_payload ? 'photo_paths' and jsonb_typeof(p_payload->'photo_paths')<>'array' then raise exception 'Invalid photos' using errcode='22023';end if;
 if jsonb_array_length(coalesce(p_payload->'photo_paths','[]'))>3 then raise exception 'Maximum three photos' using errcode='22023';end if;
 for photo in select value from jsonb_array_elements(coalesce(p_payload->'photo_paths','[]')) loop
  if jsonb_typeof(photo)<>'string' then raise exception 'Invalid photo path' using errcode='22023';end if;
  photo_path:=photo#>>'{}';
  if photo_path=any(all_photo_paths) or split_part(photo_path,'/',1)<>s.organization_id::text or split_part(photo_path,'/',2)<>s.id::text or photo_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.]jpg$' then raise exception 'Invalid photo ownership' using errcode='22023';end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='visit-photos' and o.name=photo_path and (o.metadata->>'mimetype')='image/jpeg' and coalesce((o.metadata->>'size')::bigint,0)>0 and coalesce((o.metadata->>'size')::bigint,0)<=2097152) then raise exception 'Photo upload missing or invalid' using errcode='22023';end if;
  all_photo_paths:=array_append(all_photo_paths,photo_path);
 end loop;
 select * into pr from public.properties where id=s.property_id;
 select * into customer from public.customers where id=pr.customer_id;
 for payload_pool in select value from jsonb_array_elements(p_payload->'pools') loop
  if jsonb_typeof(payload_pool)<>'object' then raise exception 'Invalid pool record' using errcode='22023';end if;
  select * into pool from public.pools where id=(payload_pool->>'pool_id')::uuid and property_id=s.property_id and status='active';
  if not found or pool.id=any(seen_pools) then raise exception 'Invalid or duplicate pool' using errcode='22023';end if;
  seen_pools:=array_append(seen_pools,pool.id);
  if pool.photo_required and cardinality(all_photo_paths)=0 then raise exception 'Photo required' using errcode='22023';end if;
  if jsonb_typeof(payload_pool->'tasks') is distinct from 'array' or jsonb_array_length(payload_pool->'tasks')>30 then raise exception 'Invalid checklist' using errcode='22023';end if;
  tasks:='{}';clean_tasks:='[]';
  for task in select value from jsonb_array_elements(payload_pool->'tasks') loop
   if jsonb_typeof(task)<>'string' or not ((task#>>'{}')=any(pool.checklist)) or (task#>>'{}')=any(tasks) or length(task#>>'{}')>150 then raise exception 'Invalid checklist task' using errcode='22023';end if;
   tasks:=array_append(tasks,task#>>'{}');clean_tasks:=clean_tasks||jsonb_build_array(task#>>'{}');
  end loop;
  readings:=coalesce(payload_pool->'readings','{}');
  if jsonb_typeof(readings)<>'object' then raise exception 'Invalid readings' using errcode='22023';end if;
  foreach reading_key in array pool.required_readings loop
   if not readings ? reading_key or readings->reading_key='null'::jsonb then raise exception 'Required reading missing: %',reading_key using errcode='22023';end if;
  end loop;
  for reading_key in select jsonb_object_keys(readings) loop
   if reading_key not in ('fc','ph','ta','cya','ch','salt','cc','tc','temperature_f') or jsonb_typeof(readings->reading_key)<>'number' then raise exception 'Invalid reading' using errcode='22023';end if;
   reading_value:=(readings->>reading_key)::numeric;
   reading_max:=case reading_key when 'temperature_f' then 140 when 'tc' then 30 when 'ph' then 14 when 'fc' then 30 when 'cc' then 30 when 'ch' then 5000 when 'salt' then 10000 when 'ta' then 500 else 1000 end;
   if reading_value<0 or reading_value>reading_max then raise exception 'Reading outside supported range: %',reading_key using errcode='22023';end if;
  end loop;
  if jsonb_typeof(payload_pool->'dosages') is distinct from 'array' or jsonb_array_length(payload_pool->'dosages')>30 then raise exception 'Invalid dosages' using errcode='22023';end if;
  clean_dosages:='[]';
  for dosage in select value from jsonb_array_elements(payload_pool->'dosages') loop
   if jsonb_typeof(dosage)<>'object' or jsonb_typeof(dosage->'quantity')<>'number' or jsonb_typeof(dosage->'product')<>'string' or jsonb_typeof(dosage->'unit')<>'string' or length(trim(dosage->>'product')) not between 1 and 100 or length(trim(dosage->>'unit')) not between 1 and 20 then raise exception 'Invalid chemical dosage' using errcode='22023';end if;
   quantity:=(dosage->>'quantity')::numeric;
   if quantity<=0 or quantity>10000 then raise exception 'Invalid chemical quantity' using errcode='22023';end if;
   clean_dosages:=clean_dosages||jsonb_build_array(jsonb_build_object('product',trim(dosage->>'product'),'quantity',quantity,'unit',trim(dosage->>'unit')));
  end loop;
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('pool_id',pool.id,'pool_name',pool.name,'tasks',clean_tasks,'readings',readings,'dosages',clean_dosages));
 end loop;
 if (select count(*) from public.pools where property_id=s.property_id and status='active')<>cardinality(seen_pools) then raise exception 'Record every active pool at this property' using errcode='22023';end if;
 public_notes:=coalesce(p_payload->>'notes','');
 if length(public_notes)>2000 then raise exception 'Service note too long' using errcode='22023';end if;
 -- Device service time is distinct from durable server receipt time during delayed offline sync.
 if p_payload->>'completed_at' is not null then v_completed:=(p_payload->>'completed_at')::timestamptz;end if;
 if not isfinite(v_completed) or v_completed>now()+interval '5 minutes' or v_completed<now()-interval '365 days' then raise exception 'Invalid completion time' using errcode='22023';end if;
 if p_payload->>'started_at' is not null then
  v_started:=(p_payload->>'started_at')::timestamptz;
  if not isfinite(v_started) or v_started>v_completed or v_started<now()-interval '365 days' then raise exception 'Invalid start time' using errcode='22023';end if;
 end if;
 snapshot:=jsonb_build_object('property_name',coalesce(nullif(pr.name,''),pr.address),'customer_name',customer.name,'notes',public_notes,'pools',snapshots);
 insert into public.visits(id,organization_id,route_stop_id,technician_id,started_at,completed_at,snapshot)
 values(visit_id,s.organization_id,s.id,actor.id,v_started,v_completed,snapshot);
 for payload_pool in select value from jsonb_array_elements(snapshots) loop
  insert into public.visit_checklist_items(organization_id,visit_id,pool_id,task)
   select s.organization_id,visit_id,(payload_pool->>'pool_id')::uuid,value#>>'{}' from jsonb_array_elements(payload_pool->'tasks');
  readings:=payload_pool->'readings';
  insert into public.chemical_readings(organization_id,visit_id,pool_id,fc,ph,ta,cya,ch,salt,cc,tc,temperature_f)
  values(s.organization_id,visit_id,(payload_pool->>'pool_id')::uuid,(readings->>'fc')::numeric,(readings->>'ph')::numeric,(readings->>'ta')::numeric,(readings->>'cya')::numeric,(readings->>'ch')::numeric,(readings->>'salt')::numeric,(readings->>'cc')::numeric,(readings->>'tc')::numeric,(readings->>'temperature_f')::numeric);
  insert into public.chemical_dosages(organization_id,visit_id,pool_id,product,quantity,unit)
   select s.organization_id,visit_id,(payload_pool->>'pool_id')::uuid,value->>'product',(value->>'quantity')::numeric,value->>'unit' from jsonb_array_elements(payload_pool->'dosages');
 end loop;
 insert into public.visit_photos(organization_id,visit_id,storage_path) select s.organization_id,visit_id,path from unnest(all_photo_paths) path;
 update public.route_stops set status='completed',updated_at=now() where id=s.id;
 if customer.email_reports_enabled and customer.email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
  insert into public.email_delivery_logs(organization_id,visit_id,recipient,idempotency_key) values(s.organization_id,visit_id,customer.email,visit_id::text);
 end if;
 return jsonb_build_object('visit_id',visit_id,'already_completed',false);
end $$;

create or replace function public.route_chemistry_history(p_property_ids uuid[],p_from date,p_through date)
returns table(visit_id uuid,pool_id uuid,completed_at timestamptz,readings jsonb,dosages jsonb)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Not authorized' using errcode='42501';end if;
 if p_from is null or p_through is null or p_through<p_from or p_through-p_from>30 or cardinality(p_property_ids)>300 then
  raise exception 'Invalid history window' using errcode='22023';
 end if;
 return query
 select v.id,r.pool_id,v.completed_at,
 jsonb_strip_nulls(jsonb_build_object('fc',r.fc,'ph',r.ph,'ta',r.ta,'cya',r.cya,'ch',r.ch,'salt',r.salt,'cc',r.cc,'tc',r.tc,'temperature_f',r.temperature_f)),
 coalesce((select jsonb_agg(jsonb_build_object('product',d.product,'quantity',d.quantity,'unit',d.unit) order by d.id)
           from public.chemical_dosages d where d.visit_id=v.id and d.pool_id=r.pool_id),'[]'::jsonb)
 from public.visits v join public.route_stops s on s.id=v.route_stop_id
 join public.chemical_readings r on r.visit_id=v.id
 where s.property_id=any(p_property_ids) and public.can_access_property(s.property_id)
 and v.completed_at >= (p_from::timestamp at time zone 'America/New_York')
 and v.completed_at < ((p_through+1)::timestamp at time zone 'America/New_York')
 order by v.completed_at desc,v.id,r.pool_id;
end $$;
