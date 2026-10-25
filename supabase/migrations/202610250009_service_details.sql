create table public.visit_service_details(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,visit_id uuid not null unique,
 technician_notes text not null default '' check(length(technician_notes)<=2000),equipment_problems text not null default '' check(length(equipment_problems)<=2000),filter_cleaning text not null default '' check(length(filter_cleaning)<=2000),repairs_performed text not null default '' check(length(repairs_performed)<=2000),
 foreign key(organization_id,visit_id) references public.visits(organization_id,id)
);
alter table public.visit_service_details enable row level security;
revoke all on public.visit_service_details from anon,authenticated;
grant select on public.visit_service_details to authenticated;
create policy assigned_service_details on public.visit_service_details for select to authenticated using(public.can_access_visit(visit_id));
create trigger immutable_service_details before update or delete on public.visit_service_details for each row execute function public.reject_service_change();
create trigger audit_service_details after insert on public.visit_service_details for each row execute function public.audit_change();
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
 if p_payload ? 'service_details' then
  if jsonb_typeof(p_payload->'service_details')<>'object' or exists(select 1 from jsonb_object_keys(p_payload->'service_details') k where k not in ('technician_notes','equipment_problems','filter_cleaning','repairs_performed')) then raise exception 'Invalid internal service details' using errcode='22023';end if;
  foreach reading_key in array array['technician_notes','equipment_problems','filter_cleaning','repairs_performed'] loop
   if p_payload->'service_details' ? reading_key and (jsonb_typeof(p_payload->'service_details'->reading_key)<>'string' or length(p_payload->'service_details'->>reading_key)>2000) then raise exception 'Invalid internal service note' using errcode='22023';end if;
  end loop;
  insert into public.visit_service_details(organization_id,visit_id,technician_notes,equipment_problems,filter_cleaning,repairs_performed)
  values(s.organization_id,visit_id,coalesce(p_payload->'service_details'->>'technician_notes',''),coalesce(p_payload->'service_details'->>'equipment_problems',''),coalesce(p_payload->'service_details'->>'filter_cleaning',''),coalesce(p_payload->'service_details'->>'repairs_performed',''));
 end if;
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
