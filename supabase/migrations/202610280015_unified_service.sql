-- Additive onboarding. Existing customers, visits, photos and schedules are untouched.
alter table public.pools add column photo_scope_required boolean not null default false,
 add column equipment_notes text not null default '' check(length(equipment_notes)<=2000),
 add column reference_ranges jsonb not null default '{}' check(jsonb_typeof(reference_ranges)='object');
alter table public.pools drop constraint pools_water_type_check;
alter table public.pools add constraint pools_water_type_check check(water_type in ('chlorine','salt','bromine','other'));
alter table public.properties add column service_timezone text not null default 'America/New_York',
 add column location_confirmed boolean not null default false;
alter table public.recurring_schedules add column service_notes text not null default '' check(length(service_notes)<=2000);
create table public.customer_onboarding_requests(
 organization_id uuid not null references public.organizations(id),request_id uuid not null,
 customer_id uuid not null,payload jsonb not null,created_at timestamptz not null default now(),
 primary key(organization_id,request_id),foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
alter table public.customer_onboarding_requests enable row level security;
revoke all on public.customer_onboarding_requests from public,anon,authenticated;

create function public.generate_schedule_window(p_schedule uuid) returns integer language plpgsql security definer set search_path='' as $$
declare sc public.recurring_schedules; first_day date; added integer;begin
 select * into sc from public.recurring_schedules where id=p_schedule;
 if not found or not sc.active then return 0;end if;
 perform pg_advisory_xact_lock(hashtextextended(sc.organization_id::text||':schedule',0));
 select (now() at time zone p.service_timezone)::date into first_day from public.properties p where p.id=sc.property_id;
 insert into public.route_stops(organization_id,property_id,technician_id,service_date,position,schedule_id)
 select sc.organization_id,sc.property_id,sc.technician_id,first_day+n,
 coalesce((select max(s.position) from public.route_stops s where s.organization_id=sc.organization_id and s.service_date=first_day+n and s.technician_id=sc.technician_id),0)+1,sc.id
 from generate_series(0,27) n join public.properties p on p.id=sc.property_id join public.customers c on c.id=p.customer_id
 where c.status='active' and c.archived_at is null and sc.start_on<=first_day+n and (sc.end_on is null or sc.end_on>=first_day+n)
 and extract(dow from first_day+n)::integer=any(sc.days_of_week)
 and exists(select 1 from public.pools po where po.property_id=p.id and po.status='active')
 and not exists(select 1 from public.route_stops s where s.schedule_id=sc.id and s.service_date=first_day+n)
 on conflict(property_id,technician_id,service_date) do nothing;
 get diagnostics added=row_count;return added;
end $$;
revoke all on function public.generate_schedule_window(uuid) from public,anon,authenticated;
create function public.save_service_schedule(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid;sid uuid;tech uuid;days integer[];begin
 select organization_id into org from public.properties where id=(p_payload->>'property_id')::uuid;
 if not public.is_manager(org) then raise exception 'Manager required' using errcode='42501';end if;
 tech:=(p_payload->>'technician_id')::uuid;
 if not exists(select 1 from public.profiles where id=tech and organization_id=org and role in ('owner','admin','technician')) then raise exception 'Invalid technician' using errcode='42501';end if;
 if jsonb_typeof(p_payload->'days_of_week') is distinct from 'array' then raise exception 'Weekdays required' using errcode='22023';end if;
 select array_agg(value::integer) into days from jsonb_array_elements_text(p_payload->'days_of_week');
 if cardinality(days) is null or cardinality(days) not between 1 and 7 or (select count(distinct d) from unnest(days) d)<>cardinality(days) then raise exception 'Invalid frequency' using errcode='22023';end if;
 sid:=nullif(p_payload->>'id','')::uuid;
 if sid is null then
 insert into public.recurring_schedules(organization_id,property_id,technician_id,days_of_week,start_on,end_on,active,service_notes)
 values(org,(p_payload->>'property_id')::uuid,tech,days,(p_payload->>'start_on')::date,nullif(p_payload->>'end_on','')::date,(p_payload->>'active')::boolean,coalesce(p_payload->>'service_notes','')) returning id into sid;
 else
 update public.recurring_schedules set technician_id=tech,days_of_week=days,start_on=(p_payload->>'start_on')::date,end_on=nullif(p_payload->>'end_on','')::date,active=(p_payload->>'active')::boolean,service_notes=coalesce(p_payload->>'service_notes','') where id=sid and organization_id=org and property_id=(p_payload->>'property_id')::uuid;
 if not found then raise exception 'Invalid schedule' using errcode='42501';end if;
 end if;perform public.generate_schedule_window(sid);return sid;
end $$;
revoke all on function public.save_service_schedule(jsonb) from public,anon;
grant execute on function public.save_service_schedule(jsonb) to authenticated;

create function public.save_customer_bundle(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles;cid uuid;pid uuid;poid uuid;contract_id uuid;req uuid; prior public.customer_onboarding_requests;
 prop_index integer:=0;before_properties uuid[]:='{}';prop jsonb;pool jsonb;c jsonb;first_prop jsonb;sc jsonb;range_item jsonb;begin
 select * into actor from public.profiles where id=auth.uid();
 if not found or not public.is_manager(actor.organization_id) then raise exception 'Manager required' using errcode='42501';end if;
 if p_payload is null or octet_length(p_payload::text)>180000 or jsonb_typeof(p_payload->'properties') is distinct from 'array' or jsonb_array_length(p_payload->'properties') not between 1 and 10 then raise exception 'Invalid onboarding payload' using errcode='22023';end if;
 req:=(p_payload->>'request_id')::uuid;if req is null then raise exception 'Request ID required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor.organization_id::text||req::text,0));
 select * into prior from public.customer_onboarding_requests where organization_id=actor.organization_id and request_id=req;
 if found then
 if prior.payload is distinct from p_payload then raise exception 'Request ID already used with different data' using errcode='22023';end if;return prior.customer_id;
 end if;
 c:=p_payload->'customer';first_prop:=p_payload->'properties'->0;
 select coalesce(array_agg(id),'{}') into before_properties from public.properties where customer_id=nullif(c->>'id','')::uuid;
 cid:=public.save_customer_profile(c||jsonb_build_object('property_id',first_prop->'id','service_address',first_prop->>'address','property_name',first_prop->>'name','latitude',first_prop->'latitude','longitude',first_prop->'longitude'));
 for prop in select value from jsonb_array_elements(p_payload->'properties') loop
 prop_index:=prop_index+1;
 pid:=nullif(prop->>'id','')::uuid;
 if pid is null and prop_index=1 then select id into pid from public.properties where customer_id=cid and not(id=any(before_properties)) order by created_at,id limit 1;end if;
 if not exists(select 1 from pg_timezone_names where name=coalesce(prop->>'service_timezone','America/New_York')) then raise exception 'Invalid timezone' using errcode='22023';end if;
 if pid is null then
 insert into public.properties(organization_id,customer_id,address,name,gate_notes,latitude,longitude,service_timezone,location_confirmed)
 values(actor.organization_id,cid,prop->>'address',coalesce(prop->>'name',''),coalesce(prop->>'gate_notes',''),(prop->>'latitude')::double precision,(prop->>'longitude')::double precision,coalesce(prop->>'service_timezone','America/New_York'),coalesce((prop->>'location_confirmed')::boolean,false)) returning id into pid;
 else
 update public.properties set address=prop->>'address',name=coalesce(prop->>'name',''),gate_notes=coalesce(prop->>'gate_notes',''),latitude=(prop->>'latitude')::double precision,longitude=(prop->>'longitude')::double precision,service_timezone=coalesce(prop->>'service_timezone','America/New_York'),location_confirmed=coalesce((prop->>'location_confirmed')::boolean,false) where id=pid and customer_id=cid and organization_id=actor.organization_id;
 if not found then raise exception 'Property access denied' using errcode='42501';end if;
 end if;
 if jsonb_typeof(prop->'pools') is distinct from 'array' or jsonb_array_length(prop->'pools') not between 1 and 30 then raise exception 'Pools required' using errcode='22023';end if;
 for pool in select value from jsonb_array_elements(prop->'pools') loop
 if jsonb_typeof(coalesce(pool->'reference_ranges','{}'))<>'object' then raise exception 'Invalid ranges' using errcode='22023';end if;
 for range_item in select value from jsonb_each(coalesce(pool->'reference_ranges','{}')) loop
 if jsonb_typeof(range_item)<>'object' or jsonb_typeof(range_item->'min') is distinct from 'number' or jsonb_typeof(range_item->'max') is distinct from 'number' or (range_item->>'min')::numeric>(range_item->>'max')::numeric then raise exception 'Invalid reference range' using errcode='22023';end if;
 end loop;
 poid:=nullif(pool->>'id','')::uuid;
 if poid is not null and not exists(select 1 from public.pools where id=poid and property_id=pid and organization_id=actor.organization_id) then raise exception 'Pool access denied' using errcode='42501';end if;
 insert into public.pools(id,organization_id,property_id,name,gallons,water_type,type,status,checklist,required_readings,photo_required,photo_scope_required,equipment_notes,reference_ranges)
 values(coalesce(poid,gen_random_uuid()),actor.organization_id,pid,pool->>'name',(pool->>'gallons')::integer,pool->>'water_type',pool->>'type',coalesce(pool->>'status','active'),array(select jsonb_array_elements_text(pool->'checklist')),array(select jsonb_array_elements_text(pool->'required_readings')),coalesce((pool->>'photo_required')::boolean,false),coalesce((pool->>'photo_scope_required')::boolean,false),coalesce(pool->>'equipment_notes',''),coalesce(pool->'reference_ranges','{}'))
 on conflict(id) do update set name=excluded.name,gallons=excluded.gallons,water_type=excluded.water_type,type=excluded.type,status=excluded.status,checklist=excluded.checklist,required_readings=excluded.required_readings,photo_required=excluded.photo_required,photo_scope_required=excluded.photo_scope_required,equipment_notes=excluded.equipment_notes,reference_ranges=excluded.reference_ranges;
 end loop;
 for sc in select value from jsonb_array_elements(coalesce(prop->'schedules','[]')) loop perform public.save_service_schedule(sc||jsonb_build_object('property_id',pid));end loop;
 end loop;
 if p_payload ? 'agreement' then
 contract_id:=nullif(p_payload->'agreement'->>'id','')::uuid;
 if contract_id is not null and not exists(select 1 from public.contracts where id=contract_id and customer_id=cid and organization_id=actor.organization_id) then raise exception 'Agreement access denied' using errcode='42501';end if;
 insert into public.contracts(id,organization_id,customer_id,source,billing_model,price_cents,status)
 values(coalesce(contract_id,gen_random_uuid()),actor.organization_id,cid,p_payload->'agreement'->>'source',p_payload->'agreement'->>'billing_model',(p_payload->'agreement'->>'price_cents')::bigint,p_payload->'agreement'->>'status')
 on conflict(id) do update set source=excluded.source,billing_model=excluded.billing_model,price_cents=excluded.price_cents,status=excluded.status;
 end if;
 insert into public.customer_onboarding_requests values(actor.organization_id,req,cid,p_payload,now());return cid;
end $$;
revoke all on function public.save_customer_bundle(jsonb) from public,anon;
grant execute on function public.save_customer_bundle(jsonb) to authenticated;
