-- Fast Route: immutable completed service records and tenant-safe field access.
-- Auth users are provisioned through the trusted administrative channel (not signup metadata).
create function public.valid_checklist(items text[]) returns boolean language sql immutable set search_path='' as $$
 select cardinality(items) between 1 and 30 and not exists(select 1 from unnest(items) task where task is null or length(trim(task)) not between 1 and 150)
 and (select count(distinct task) from unnest(items) task)=cardinality(items);
$$;
revoke all on function public.valid_checklist(text[]) from public;
grant execute on function public.valid_checklist(text[]) to authenticated,service_role;
alter table public.customers add column email_reports_enabled boolean not null default false;
alter table public.properties add column name text not null default '' check(length(name)<=120), add column gate_notes text not null default '' check(length(gate_notes)<=2000);
alter table public.pools
 add column checklist text[] not null default array['Skim Surface','Brush Pool','Vacuum Pool','Empty Skimmer Basket','Empty Pump Basket','Check Equipment','Test Water','Add Chemicals'],
 add column required_readings text[] not null default array['fc','ph'],
 add column photo_required boolean not null default false,
 add constraint valid_required_readings check(required_readings <@ array['fc','ph','ta','cya','ch','salt','cc']::text[]),
 add constraint checklist_size check(public.valid_checklist(checklist));

create table public.recurring_schedules (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 property_id uuid not null, technician_id uuid not null,
 days_of_week integer[] not null check(cardinality(days_of_week) between 1 and 7 and days_of_week <@ array[0,1,2,3,4,5,6] and array_position(days_of_week,null) is null),
 start_on date not null default ((now() at time zone 'America/New_York')::date), end_on date,
 active boolean not null default true, created_at timestamptz not null default now(),
 unique(organization_id,id), check(end_on is null or end_on>=start_on),
 foreign key(organization_id,property_id) references public.properties(organization_id,id),
 foreign key(organization_id,technician_id) references public.profiles(organization_id,id)
);
create unique index one_active_schedule on public.recurring_schedules(property_id,technician_id) where active;
create table public.route_stops (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 property_id uuid not null, technician_id uuid not null, service_date date not null,
 position integer not null default 0 check(position>=0),
 status text not null default 'pending' check(status in ('pending','in_progress','completed','skipped')),
 schedule_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(property_id,technician_id,service_date),
 foreign key(organization_id,property_id) references public.properties(organization_id,id),
 foreign key(organization_id,technician_id) references public.profiles(organization_id,id),
 foreign key(organization_id,schedule_id) references public.recurring_schedules(organization_id,id)
);
create index route_daily on public.route_stops(organization_id,service_date,technician_id,position);
create table public.visits (
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 route_stop_id uuid not null unique, technician_id uuid not null,
 completed_at timestamptz not null default now(), received_at timestamptz not null default now(), started_at timestamptz,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 unique(organization_id,id),
 foreign key(organization_id,route_stop_id) references public.route_stops(organization_id,id),
 foreign key(organization_id,technician_id) references public.profiles(organization_id,id)
);
create index visit_history on public.visits(organization_id,completed_at desc);
create table public.visit_checklist_items (
 id bigint generated always as identity primary key, organization_id uuid not null,
 visit_id uuid not null, pool_id uuid not null, task text not null check(length(task) between 1 and 150),
 unique(visit_id,pool_id,task),
 foreign key(organization_id,visit_id) references public.visits(organization_id,id),
 foreign key(organization_id,pool_id) references public.pools(organization_id,id)
);
create table public.chemical_readings (
 id bigint generated always as identity primary key, organization_id uuid not null, visit_id uuid not null, pool_id uuid not null,
 fc numeric check(fc between 0 and 30), ph numeric check(ph between 0 and 14), ta numeric check(ta between 0 and 500),
 cya numeric check(cya between 0 and 1000), ch numeric check(ch between 0 and 5000), salt numeric check(salt between 0 and 10000), cc numeric check(cc between 0 and 30),
 unique(visit_id,pool_id),
 foreign key(organization_id,visit_id) references public.visits(organization_id,id),
 foreign key(organization_id,pool_id) references public.pools(organization_id,id)
);
create table public.chemical_dosages (
 id bigint generated always as identity primary key, organization_id uuid not null, visit_id uuid not null, pool_id uuid not null,
 product text not null check(length(trim(product)) between 1 and 100), quantity numeric not null check(quantity>0 and quantity<=10000),
 unit text not null check(length(trim(unit)) between 1 and 20),
 foreign key(organization_id,visit_id) references public.visits(organization_id,id),
 foreign key(organization_id,pool_id) references public.pools(organization_id,id)
);
create table public.visit_photos (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, visit_id uuid not null,
 storage_path text not null unique, created_at timestamptz not null default now(),
 foreign key(organization_id,visit_id) references public.visits(organization_id,id)
);
create table public.email_delivery_logs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, visit_id uuid not null unique,
 recipient text not null, status text not null default 'pending' check(status in ('pending','sent','failed')),
 attempts integer not null default 0 check(attempts>=0), first_attempt_at timestamptz, claim_token uuid, request_payload jsonb, provider_id text, error text,
 sent_at timestamptz, next_attempt_at timestamptz not null default now(), locked_until timestamptz,
 idempotency_key text not null unique, created_at timestamptz not null default now(),
 foreign key(organization_id,visit_id) references public.visits(organization_id,id),
 check((status='sent' and sent_at is not null and provider_id is not null) or status<>'sent')
);

-- Definer predicates avoid RLS recursion. They only answer authorization for auth.uid().
create or replace function public.is_manager(org uuid) returns boolean language sql stable security definer
set search_path='' as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=org and p.role in ('owner','admin')); $$;
create function public.can_access_stop(stop_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.route_stops s join public.profiles p on p.id=auth.uid() and p.organization_id=s.organization_id
 where s.id=stop_id and (p.role in ('owner','admin') or (p.role='technician' and s.technician_id=p.id)));
$$;
create function public.can_access_property(property uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.properties pr join public.profiles p on p.id=auth.uid() and p.organization_id=pr.organization_id
 where pr.id=property and (p.role in ('owner','admin') or (p.role='technician' and exists(select 1 from public.route_stops s where s.property_id=pr.id and s.technician_id=p.id))));
$$;
create function public.can_access_visit(visit uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.visits v where v.id=visit and public.can_access_stop(v.route_stop_id));
$$;
revoke all on function public.is_manager(uuid),public.can_access_stop(uuid),public.can_access_property(uuid),public.can_access_visit(uuid) from public;
grant execute on function public.is_manager(uuid),public.can_access_stop(uuid),public.can_access_property(uuid),public.can_access_visit(uuid) to authenticated;
create policy manager_profiles on public.profiles for select to authenticated using(public.is_manager(organization_id));
-- A technician sees only customers/properties/pools associated with assigned stops, never writes the portfolio.
create policy assigned_customer on public.customers for select to authenticated using(exists(select 1 from public.properties p where p.customer_id=customers.id and public.can_access_property(p.id)));
create policy assigned_property on public.properties for select to authenticated using(public.can_access_property(id));
create policy assigned_pool on public.pools for select to authenticated using(public.can_access_property(property_id));

do $$ declare t text; begin
 foreach t in array array['recurring_schedules','route_stops','visits','visit_checklist_items','chemical_readings','chemical_dosages','visit_photos','email_delivery_logs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy schedules_read on public.recurring_schedules for select to authenticated using(public.is_manager(organization_id) or (technician_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='technician')));
create policy schedules_insert on public.recurring_schedules for insert to authenticated with check(public.is_manager(organization_id) and exists(select 1 from public.profiles p where p.id=technician_id and p.organization_id=recurring_schedules.organization_id and p.role in ('owner','admin','technician')));
create policy schedules_update on public.recurring_schedules for update to authenticated using(public.is_manager(organization_id)) with check(public.is_manager(organization_id) and exists(select 1 from public.profiles p where p.id=technician_id and p.organization_id=recurring_schedules.organization_id and p.role in ('owner','admin','technician')));
grant insert,update on public.recurring_schedules to authenticated;
create policy stops_read on public.route_stops for select to authenticated using(public.can_access_stop(id));
create policy visits_read on public.visits for select to authenticated using(public.can_access_visit(id));
create policy checklist_read on public.visit_checklist_items for select to authenticated using(public.can_access_visit(visit_id));
create policy readings_read on public.chemical_readings for select to authenticated using(public.can_access_visit(visit_id));
create policy dosages_read on public.chemical_dosages for select to authenticated using(public.can_access_visit(visit_id));
create policy photos_read on public.visit_photos for select to authenticated using(public.can_access_visit(visit_id));
create policy email_read on public.email_delivery_logs for select to authenticated using(public.can_access_visit(visit_id));

-- Immutability is enforced even if an unexpected grant is later added.
create function public.reject_service_change() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Completed service records are immutable; append an audited correction instead' using errcode='42501'; end $$;
revoke all on function public.reject_service_change() from public;
do $$ declare t text; begin
 foreach t in array array['visits','visit_checklist_items','chemical_readings','chemical_dosages','visit_photos'] loop
  execute format('create trigger immutable_service before update or delete on public.%I for each row execute function public.reject_service_change()',t);
 end loop;
end $$;
create trigger audit_visit after insert on public.visits for each row execute function public.audit_change();
create trigger audit_stop after insert or update on public.route_stops for each row execute function public.audit_change();

create function public.generate_route(p_date date) returns integer language plpgsql security definer set search_path='' as $$
declare actor public.profiles; added integer; begin
 select * into actor from public.profiles where id=auth.uid();
 if not found or actor.role not in ('owner','admin','technician') then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_date is null or p_date < current_date-365 or p_date>current_date+366 then raise exception 'Invalid route date' using errcode='22023'; end if;
 -- A transaction lock prevents concurrent generators from assigning the same positions.
 perform pg_advisory_xact_lock(hashtextextended(actor.organization_id::text||p_date::text,0));
 insert into public.route_stops(organization_id,property_id,technician_id,service_date,position,schedule_id)
 select sc.organization_id,sc.property_id,sc.technician_id,p_date,
  coalesce((select max(s.position) from public.route_stops s where s.organization_id=sc.organization_id and s.service_date=p_date and s.technician_id=sc.technician_id),0)+row_number() over(partition by sc.technician_id order by sc.created_at,sc.id)::integer,
  sc.id
 from public.recurring_schedules sc join public.properties pr on pr.id=sc.property_id join public.customers c on c.id=pr.customer_id
 where sc.organization_id=actor.organization_id and sc.active and sc.start_on<=p_date and (sc.end_on is null or sc.end_on>=p_date)
 and extract(dow from p_date)::integer=any(sc.days_of_week) and c.status='active'
 and (actor.role in ('owner','admin') or sc.technician_id=actor.id)
 and exists(select 1 from public.pools po where po.property_id=pr.id and po.status='active')
 on conflict(property_id,technician_id,service_date) do nothing;
 get diagnostics added=row_count; return added;
end $$;

create function public.add_route_stop(p_property_id uuid,p_technician_id uuid,p_date date) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; result uuid; begin
 select organization_id into org from public.properties where id=p_property_id;
 if not public.is_manager(org) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_date is null or p_date<current_date-365 or p_date>current_date+366 then raise exception 'Invalid date' using errcode='22023'; end if;
 if not exists(select 1 from public.profiles p where p.id=p_technician_id and p.organization_id=org and p.role in ('owner','admin','technician')) then raise exception 'Invalid technician' using errcode='22023'; end if;
 if not exists(select 1 from public.pools po join public.properties pr on pr.id=po.property_id join public.customers c on c.id=pr.customer_id where pr.id=p_property_id and po.status='active' and c.status='active') then raise exception 'An active customer and pool are required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||p_date::text,0));
 insert into public.route_stops(organization_id,property_id,technician_id,service_date,position)
 values(org,p_property_id,p_technician_id,p_date,coalesce((select max(position)+1 from public.route_stops where organization_id=org and service_date=p_date and technician_id=p_technician_id),1))
 on conflict(property_id,technician_id,service_date) do update set position=route_stops.position
 returning id into result;
 return result;
end $$;

create function public.set_stop_status(p_stop_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare s public.route_stops; begin
 select * into s from public.route_stops where id=p_stop_id for update;
 if not found or not public.can_access_stop(p_stop_id) then raise exception 'Not authorized' using errcode='42501'; end if;
 if s.status='completed' then raise exception 'Completed stop is immutable' using errcode='22023'; end if;
 if p_status not in ('pending','in_progress','skipped') then raise exception 'Invalid status' using errcode='22023'; end if;
 update public.route_stops set status=p_status,updated_at=now() where id=p_stop_id;
end $$;

create function public.reorder_route(p_stop_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare first_stop public.route_stops; item uuid; n integer:=0; begin
 if coalesce(cardinality(p_stop_ids),0)=0 or cardinality(p_stop_ids)>500 then raise exception 'Invalid route' using errcode='22023';end if;
 if (select count(distinct id) from unnest(p_stop_ids) id)<>cardinality(p_stop_ids) then raise exception 'Duplicate stops' using errcode='22023';end if;
 select * into first_stop from public.route_stops where id=p_stop_ids[1];
 if not found or not public.can_access_stop(first_stop.id) then raise exception 'Not authorized' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(first_stop.organization_id::text||first_stop.service_date::text,0));
 foreach item in array p_stop_ids loop
  if not exists(select 1 from public.route_stops s where s.id=item and s.organization_id=first_stop.organization_id and s.service_date=first_stop.service_date and s.technician_id=first_stop.technician_id and public.can_access_stop(s.id)) then raise exception 'Stops must belong to the same route' using errcode='42501';end if;
 end loop;
 if (select count(*) from public.route_stops where organization_id=first_stop.organization_id and service_date=first_stop.service_date and technician_id=first_stop.technician_id)<>cardinality(p_stop_ids) then raise exception 'Supply the complete route' using errcode='22023';end if;
 foreach item in array p_stop_ids loop n:=n+1; update public.route_stops set position=n,updated_at=now() where id=item; end loop;
end $$;

-- Uploads are scoped to a specific assigned stop, never publicly readable.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('visit-photos','visit-photos',false,2097152,array['image/jpeg']) on conflict(id) do nothing;
create function public.can_upload_visit_photo(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.route_stops s where path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.]jpg$'
 and split_part(path,'/',1)=s.organization_id::text and split_part(path,'/',2)=s.id::text and s.status in ('pending','in_progress') and public.can_access_stop(s.id));
$$;
create function public.can_read_visit_photo(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.route_stops s where split_part(path,'/',1)=s.organization_id::text and split_part(path,'/',2)=s.id::text and public.can_access_stop(s.id));
$$;
revoke all on function public.can_upload_visit_photo(text),public.can_read_visit_photo(text) from public;
grant execute on function public.can_upload_visit_photo(text),public.can_read_visit_photo(text) to authenticated;
-- No authenticated INSERT policy. The trusted server validates JPEG bytes, then uploads
-- with server-only service_role after verifying session stop permissions.
create policy assigned_photo_read on storage.objects for select to authenticated using(bucket_id='visit-photos' and public.can_read_visit_photo(name));
-- No authenticated INSERT/UPDATE/DELETE policies: clients cannot bypass JPEG decoding or replace completed photos.

create function public.complete_visit(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
   if reading_key not in ('fc','ph','ta','cya','ch','salt','cc') or jsonb_typeof(readings->reading_key)<>'number' then raise exception 'Invalid reading' using errcode='22023';end if;
   reading_value:=(readings->>reading_key)::numeric;
   reading_max:=case reading_key when 'ph' then 14 when 'fc' then 30 when 'cc' then 30 when 'ch' then 5000 when 'salt' then 10000 when 'ta' then 500 else 1000 end;
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
  insert into public.chemical_readings(organization_id,visit_id,pool_id,fc,ph,ta,cya,ch,salt,cc)
  values(s.organization_id,visit_id,(payload_pool->>'pool_id')::uuid,(readings->>'fc')::numeric,(readings->>'ph')::numeric,(readings->>'ta')::numeric,(readings->>'cya')::numeric,(readings->>'ch')::numeric,(readings->>'salt')::numeric,(readings->>'cc')::numeric);
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

revoke all on function public.generate_route(date),public.add_route_stop(uuid,uuid,date),public.set_stop_status(uuid,text),public.reorder_route(uuid[]),public.complete_visit(jsonb) from public;
grant execute on function public.generate_route(date),public.add_route_stop(uuid,uuid,date),public.set_stop_status(uuid,text),public.reorder_route(uuid[]),public.complete_visit(jsonb) to authenticated;
