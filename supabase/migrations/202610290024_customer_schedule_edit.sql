-- V2.1.1: independent customer edits never regenerate unchanged service schedules.
create or replace function public.schedule_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.property_id,new.technician_id,new.days_of_week,new.start_on,new.end_on,new.active) is not distinct from (old.property_id,old.technician_id,old.days_of_week,old.start_on,old.end_on,old.active) then return new;end if;
 if tg_op='UPDATE' and exists(select 1 from public.route_stops s join public.properties p on p.id=s.property_id where s.schedule_id=new.id and s.status='in_progress' and s.service_date>=(now() at time zone p.service_timezone)::date and (not new.active or s.property_id<>new.property_id or s.technician_id<>new.technician_id or s.service_date<new.start_on or (new.end_on is not null and s.service_date>new.end_on) or not(extract(dow from s.service_date)::integer=any(new.days_of_week)))) then raise exception 'ALYS_SCHEDULE_CONFLICT' using errcode='22023',detail='ALYS_FIELD:'||case when new.technician_id<>old.technician_id then 'technician_id' when new.active is distinct from old.active then 'active' when new.start_on<>old.start_on then 'start_on' when new.end_on is distinct from old.end_on then 'end_on' else 'days_of_week' end;end if;
 perform public.reconcile_schedule(new.id);return new;
end $$;
create or replace function public.save_service_schedule(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid;sid uuid;tech uuid;days integer[];prior public.recurring_schedules;first_day date;last_day date;enabled boolean;notes text;begin
 select organization_id into org from public.properties where id=(p_payload->>'property_id')::uuid;
 if org is null or not public.is_manager(org) then raise exception 'Manager required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||':schedule',0));
 sid:=nullif(p_payload->>'id','')::uuid;
 if sid is not null then select * into prior from public.recurring_schedules where id=sid and organization_id=org and property_id=(p_payload->>'property_id')::uuid for update;if not found then raise exception 'Schedule access denied' using errcode='42501';end if;end if;
 if jsonb_typeof(p_payload->'days_of_week') is distinct from 'array' then raise exception 'ALYS_WEEKDAYS' using errcode='22023';end if;
 select array_agg(value::integer order by value::integer) into days from jsonb_array_elements_text(p_payload->'days_of_week');
 if cardinality(days) is null or cardinality(days) not between 1 and 7 or exists(select 1 from unnest(days) d where d is null or d not between 0 and 6) or (select count(distinct d) from unnest(days) d)<>cardinality(days) then raise exception 'ALYS_WEEKDAYS' using errcode='22023';end if;
 if coalesce(p_payload->>'start_on','') !~ '^\d{4}-\d{2}-\d{2}$' or (coalesce(p_payload->>'end_on','')<>'' and p_payload->>'end_on' !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'ALYS_DATES' using errcode='22023';end if;
 first_day:=(p_payload->>'start_on')::date;last_day:=nullif(p_payload->>'end_on','')::date;
 if last_day<first_day or jsonb_typeof(p_payload->'active') is distinct from 'boolean' then raise exception 'ALYS_DATES' using errcode='22023';end if;
 tech:=(p_payload->>'technician_id')::uuid;enabled:=(p_payload->>'active')::boolean;notes:=coalesce(p_payload->>'service_notes','');
 if length(notes)>2000 then raise exception 'Service notes too long' using errcode='22023';end if;
 if sid is not null and (prior.technician_id,(select array_agg(d order by d) from unnest(prior.days_of_week) d),prior.start_on,prior.end_on,prior.active) is not distinct from (tech,days,first_day,last_day,enabled) then
 if coalesce(prior.service_notes,'') is distinct from notes then update public.recurring_schedules set service_notes=notes where id=sid;end if;
 return sid;
 end if;
 if not exists(select 1 from public.profiles where id=tech and organization_id=org and role in ('owner','admin','technician') and access_state='active') then raise exception 'ALYS_TECHNICIAN' using errcode='42501';end if;
 if sid is null then
 insert into public.recurring_schedules(organization_id,property_id,technician_id,days_of_week,start_on,end_on,active,service_notes) values(org,(p_payload->>'property_id')::uuid,tech,days,first_day,last_day,enabled,notes) returning id into sid;
 else update public.recurring_schedules set technician_id=tech,days_of_week=days,start_on=first_day,end_on=last_day,active=enabled,service_notes=notes where id=sid;end if;
 perform public.generate_schedule_window(sid);return sid;
end $$;

create or replace function public.save_customer_bundle(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles;cid uuid;pid uuid;poid uuid;contract_id uuid;req uuid; prior public.customer_onboarding_requests;
 error_detail text;sc_index integer:=0;prop_index integer:=0;before_properties uuid[]:='{}';prop jsonb;pool jsonb;c jsonb;first_prop jsonb;sc jsonb;range_item jsonb;begin
 select * into actor from public.profiles where id=auth.uid();
 if not found or not public.is_manager(actor.organization_id) then raise exception 'Manager required' using errcode='42501';end if;
 if p_payload is null or octet_length(p_payload::text)>180000 or jsonb_typeof(p_payload->'properties') is distinct from 'array' or jsonb_array_length(p_payload->'properties') not between 1 and 10 then raise exception 'Invalid onboarding payload' using errcode='22023';end if;
 req:=(p_payload->>'request_id')::uuid;if req is null then raise exception 'Request ID required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor.organization_id::text||req::text,0));
 select * into prior from public.customer_onboarding_requests where organization_id=actor.organization_id and request_id=req;
 if found then
 if prior.payload is distinct from p_payload then raise exception 'ALYS_REQUEST_REUSED' using errcode='22023';end if;return prior.customer_id;
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
 insert into public.properties(organization_id,customer_id,address,name,gate_notes,latitude,longitude,service_timezone,location_confirmed,country_code,unit_system)
 values(actor.organization_id,cid,prop->>'address',coalesce(prop->>'name',''),coalesce(prop->>'gate_notes',''),(prop->>'latitude')::double precision,(prop->>'longitude')::double precision,coalesce(prop->>'service_timezone','America/New_York'),coalesce((prop->>'location_confirmed')::boolean,false),coalesce(prop->>'country_code','US'),coalesce(prop->>'unit_system','inherit')) returning id into pid;
 else
 update public.properties set address=prop->>'address',name=coalesce(prop->>'name',''),gate_notes=coalesce(prop->>'gate_notes',''),latitude=(prop->>'latitude')::double precision,longitude=(prop->>'longitude')::double precision,service_timezone=coalesce(prop->>'service_timezone','America/New_York'),location_confirmed=coalesce((prop->>'location_confirmed')::boolean,false),country_code=coalesce(prop->>'country_code',country_code),unit_system=coalesce(prop->>'unit_system',unit_system) where id=pid and customer_id=cid and organization_id=actor.organization_id;
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
 values(coalesce(poid,gen_random_uuid()),actor.organization_id,pid,pool->>'name',(pool->>'gallons')::numeric,pool->>'water_type',pool->>'type',coalesce(pool->>'status','active'),array(select jsonb_array_elements_text(pool->'checklist')),array(select jsonb_array_elements_text(pool->'required_readings')),coalesce((pool->>'photo_required')::boolean,false),coalesce((pool->>'photo_scope_required')::boolean,false),coalesce(pool->>'equipment_notes',''),coalesce(pool->'reference_ranges','{}'))
 on conflict(id) do update set name=excluded.name,gallons=excluded.gallons,water_type=excluded.water_type,type=excluded.type,status=excluded.status,checklist=excluded.checklist,required_readings=excluded.required_readings,photo_required=excluded.photo_required,photo_scope_required=excluded.photo_scope_required,equipment_notes=excluded.equipment_notes,reference_ranges=excluded.reference_ranges;
 end loop;
 sc_index:=0;
 for sc in select value from jsonb_array_elements(coalesce(prop->'schedules','[]')) loop
 begin perform public.save_service_schedule(sc||jsonb_build_object('property_id',pid));
 exception when others then get stacked diagnostics error_detail=pg_exception_detail;raise exception using message=sqlerrm,errcode=sqlstate,detail='ALYS_FIELD:properties.'||(prop_index-1)||'.schedules.'||sc_index||case sqlerrm when 'ALYS_WEEKDAYS' then '.days_of_week' when 'ALYS_TECHNICIAN' then '.technician_id' when 'ALYS_DATES' then '.end_on' when 'ALYS_SCHEDULE_CONFLICT' then '.'||coalesce(nullif(replace(error_detail,'ALYS_FIELD:',''),''),'days_of_week') else '' end;
 end;sc_index:=sc_index+1;end loop;
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
-- Date-scoped route context for technicians. Retain the stricter general-purpose
-- property RLS window; this reader authorizes only stops assigned on this date.
create function public.assigned_route_context(p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;props uuid[];begin
 select * into actor from public.profiles where id=auth.uid();if not public.is_active_operator() then raise exception 'Active operator required' using errcode='42501';end if;
 select array_agg(distinct p.id) into props from public.route_stops s join public.properties p on p.id=s.property_id join public.customers c on c.id=p.customer_id where s.organization_id=actor.organization_id and s.service_date=p_date and (actor.role in ('owner','admin') or s.technician_id=actor.id) and c.status='active' and c.archived_at is null;
 return jsonb_build_object('properties',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'customer_id',p.customer_id,'name',p.name,'address',p.address,'gate_notes',p.gate_notes,'latitude',p.latitude,'longitude',p.longitude,'service_timezone',p.service_timezone,'unit_system',p.unit_system,'location_confirmed',p.location_confirmed,'country_code',p.country_code)) from public.properties p where p.id=any(props)),'[]'::jsonb),
 'pools',coalesce((select jsonb_agg(jsonb_build_object('id',po.id,'property_id',po.property_id,'name',po.name,'gallons',po.gallons,'checklist',po.checklist,'required_readings',po.required_readings,'photo_required',po.photo_required,'photo_scope_required',po.photo_scope_required,'reference_ranges',po.reference_ranges)) from public.pools po where po.property_id=any(props) and po.status='active'),'[]'::jsonb),
 'customers',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name)) from public.customers c where exists(select 1 from public.properties p where p.customer_id=c.id and p.id=any(props))),'[]'::jsonb));
end $$;
revoke all on function public.assigned_route_context(date) from public,anon;
grant execute on function public.assigned_route_context(date) to authenticated;

create or replace function public.system_health_metadata() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid;observed jsonb;begin
 select organization_id into org from public.profiles where id=auth.uid() and role='owner' and access_state='active';if org is null then raise exception 'Owner required' using errcode='42501';end if;
 select jsonb_build_object('started_at',started_at,'finished_at',finished_at,'outcome',outcome) into observed from public.worker_observations where key='schedule';
 return jsonb_build_object('schema_version',24,'worker',observed,'queue',(select jsonb_build_object('queued',count(*) filter(where status='pending' and (locked_until is null or locked_until<=now())),'sending',count(*) filter(where status='pending' and locked_until>now()),'accepted',count(*) filter(where status='sent' and delivery_outcome is null),'delivered',count(*) filter(where delivered_at is not null and delivery_outcome='delivered'),'failed',count(*) filter(where status='failed' or delivery_outcome in ('bounced','complained','failed'))) from public.email_delivery_logs where organization_id=org),'last_confirmed_delivery',(select max(delivered_at) from public.email_delivery_logs where organization_id=org));
end $$;
