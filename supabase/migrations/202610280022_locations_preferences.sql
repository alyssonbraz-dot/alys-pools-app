-- Widen volume precision; existing integer values keep exactly the same numeric value.
alter table public.pools alter column gallons type numeric(14,6) using gallons::numeric;
alter table public.properties add column country_code text not null default 'US' check(country_code in ('US','BR')),
 add column unit_system text not null default 'inherit' check(unit_system in ('inherit','imperial','metric'));
alter table public.organizations drop constraint organizations_timezone_check;
create function public.validate_service_timezone() returns trigger language plpgsql set search_path='' as $$
begin if not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'Invalid timezone' using errcode='22023';end if;return new;end $$;
revoke all on function public.validate_service_timezone() from public;
create trigger valid_timezone before insert or update of timezone on public.organizations for each row execute function public.validate_service_timezone();
create function public.operator_preferences() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;org public.organizations;tz text;begin
 select * into actor from public.profiles where id=auth.uid();if not public.is_active_operator() then raise exception 'Active operator required' using errcode='42501';end if;
 select * into org from public.organizations where id=actor.organization_id;
 if actor.role='technician' then select min(p.service_timezone) into tz from public.recurring_schedules sc join public.properties p on p.id=sc.property_id where sc.technician_id=actor.id and sc.active having count(distinct p.service_timezone)=1;end if;
 return jsonb_build_object('timeZone',coalesce(tz,org.timezone),'unitSystem',coalesce(org.settings->'service_defaults'->>'unit_system','imperial'),'demo',coalesce((org.settings->>'demo')::boolean,false));
end $$;
create function public.property_preferences(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.properties;u text;begin
 select * into p from public.properties where id=p_id;if not found or not public.can_access_property(p_id) then raise exception 'Property access denied' using errcode='42501';end if;
 select case when p.unit_system='inherit' then coalesce(settings->'service_defaults'->>'unit_system','imperial') else p.unit_system end into u from public.organizations where id=p.organization_id;
 return jsonb_build_object('timeZone',p.service_timezone,'unitSystem',u,'country_code',p.country_code);
end $$;
create function public.confirm_property_location(p_id uuid,p_lat double precision,p_lng double precision,p_expected timestamptz,p_country text,p_timezone text) returns void language plpgsql security definer set search_path='' as $$
declare p public.properties;begin
 select * into p from public.properties where id=p_id for update;
 if not found or not public.is_owner(p.organization_id) then raise exception 'Owner required' using errcode='42501';end if;
 if p.updated_at is distinct from p_expected then raise exception 'Property changed. Reload before saving.' using errcode='40001';end if;
 if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Valid confirmed coordinates required' using errcode='22023';end if;
 update public.properties set latitude=p_lat,longitude=p_lng,location_confirmed=true,country_code=p_country,service_timezone=p_timezone where id=p_id;
end $$;
create or replace function public.can_access_property_assigned(property uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.properties pr join public.profiles p on p.id=auth.uid() and p.organization_id=pr.organization_id where pr.id=property and (p.role in ('owner','admin') or (p.role='technician' and exists(select 1 from public.route_stops s join public.customers c on c.id=pr.customer_id where s.property_id=pr.id and s.technician_id=p.id and (s.status in ('pending','in_progress') or ((s.status='completed' or (s.status='skipped' and s.cancellation_reason is null)) and s.service_date=(now() at time zone pr.service_timezone)::date)) and s.service_date between (now() at time zone pr.service_timezone)::date-1 and (now() at time zone pr.service_timezone)::date+7 and c.status='active' and c.archived_at is null))));
$$;
create function public.generate_current_routes() returns integer language plpgsql security definer set search_path='' as $$
declare actor public.profiles;d date;n integer:=0;begin
 select * into actor from public.profiles where id=auth.uid();if not public.is_active_operator() then raise exception 'Active operator required' using errcode='42501';end if;
 for d in select distinct (now() at time zone p.service_timezone)::date from public.recurring_schedules sc join public.properties p on p.id=sc.property_id where sc.organization_id=actor.organization_id and sc.active and (actor.role in ('owner','admin') or sc.technician_id=actor.id) loop n:=n+public.generate_route(d);end loop;return n;
end $$;
create or replace function public.route_chemistry_history_v2(p_property_ids uuid[],p_from date,p_through date)
returns table(visit_id uuid,pool_id uuid,completed_at timestamptz,readings jsonb,dosages jsonb,technician_name text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_active_operator() then raise exception 'Active operator required' using errcode='42501';end if;
 if p_from is null or p_through is null or p_through<p_from or p_through-p_from>30 or cardinality(p_property_ids)>300 then raise exception 'Invalid history window' using errcode='22023';end if;
 return query select v.id,r.pool_id,v.completed_at,jsonb_strip_nulls(jsonb_build_object('fc',r.fc,'tc',r.tc,'cc',r.cc,'ph',r.ph,'ta',r.ta,'cya',r.cya,'ch',r.ch,'salt',r.salt,'temperature_f',r.temperature_f)),coalesce((select jsonb_agg(jsonb_build_object('product',d.product,'quantity',d.quantity,'unit',d.unit) order by d.id) from public.chemical_dosages d where d.visit_id=v.id and d.pool_id=r.pool_id),'[]'::jsonb),coalesce(v.snapshot->>'technician_name',person.display_name)
 from public.visits v join public.route_stops s on s.id=v.route_stop_id join public.properties pr on pr.id=s.property_id join public.chemical_readings r on r.visit_id=v.id join public.profiles person on person.id=v.technician_id
 where pr.id=any(p_property_ids) and public.can_access_property(pr.id) and v.completed_at >= (p_from::timestamp at time zone pr.service_timezone) and v.completed_at<((p_through+1)::timestamp at time zone pr.service_timezone) order by v.completed_at desc,v.id,r.pool_id;
end $$;
create or replace function public.save_company_settings(p_name text,p_settings jsonb) returns void language plpgsql security definer set search_path='' as $$
declare org uuid;begin
 select organization_id into org from public.profiles where id=auth.uid() and role='owner' and access_state='active';if org is null then raise exception 'Owner required' using errcode='42501';end if;
 if length(trim(p_name)) not between 2 and 100 or jsonb_typeof(p_settings)<>'object' or octet_length(p_settings::text)>16000 then raise exception 'Invalid settings' using errcode='22023';end if;
 update public.organizations set name=trim(p_name),settings=settings||p_settings,timezone=coalesce(p_settings->'service_defaults'->>'timeZone',timezone) where id=org;
end $$;
create or replace function public.stamp_visit_technician() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.properties;u text;begin
 select pr.* into p from public.properties pr join public.route_stops s on s.property_id=pr.id where s.id=new.route_stop_id;
 select case when p.unit_system='inherit' then coalesce(settings->'service_defaults'->>'unit_system','imperial') else p.unit_system end into u from public.organizations where id=p.organization_id;
 new.snapshot:=new.snapshot||jsonb_build_object('technician_name',(select display_name from public.profiles where id=new.technician_id),'service_timezone',p.service_timezone,'unit_system',u,'report_language',(select coalesce(settings->'service_defaults'->>'report_language','en') from public.organizations where id=p.organization_id));return new;
end $$;
revoke all on function public.operator_preferences(),public.property_preferences(uuid),public.confirm_property_location(uuid,double precision,double precision,timestamptz,text,text),public.generate_current_routes() from public,anon;
grant execute on function public.operator_preferences(),public.property_preferences(uuid),public.confirm_property_location(uuid,double precision,double precision,timestamptz,text,text),public.generate_current_routes() to authenticated;
-- No historical snapshot is updated. Normalize new recognized metric doses once.
alter function public.complete_visit(jsonb) rename to complete_visit_v20;
revoke all on function public.complete_visit_v20(jsonb) from public,anon,authenticated;
create function public.complete_visit(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pools jsonb:='[]';p jsonb;d jsonb;doses jsonb;q numeric;u text;begin
 for p in select value from jsonb_array_elements(p_payload->'pools') loop
 doses:='[]';for d in select value from jsonb_array_elements(p->'dosages') loop
 q:=(d->>'quantity')::numeric;u:=lower(trim(d->>'unit'));
 if u='ml' then d:=d||jsonb_build_object('quantity',q/29.5735295625,'unit','fl oz');elsif u='l' then d:=d||jsonb_build_object('quantity',q/3.785411784,'unit','gal');elsif u='kg' then d:=d||jsonb_build_object('quantity',q/0.45359237,'unit','lb');end if;doses:=doses||jsonb_build_array(d);
 end loop;pools:=pools||jsonb_build_array(p||jsonb_build_object('dosages',doses));end loop;
 return public.complete_visit_v20(p_payload||jsonb_build_object('pools',pools));
end $$;
revoke all on function public.complete_visit(jsonb) from public,anon;
grant execute on function public.complete_visit(jsonb) to authenticated;

create or replace function public.save_customer_bundle(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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

create or replace function public.owner_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid;today date:=(now() at time zone 'America/New_York')::date;begin
 select organization_id into org from public.profiles where id=auth.uid() and role='owner' and access_state='active';
 if org is null then raise exception 'Owner required' using errcode='42501';end if;
 return jsonb_build_object(
 'scheduled',(select count(*) from public.route_stops s join public.properties pr on pr.id=s.property_id where s.organization_id=org and s.service_date=(now() at time zone pr.service_timezone)::date and not(s.status='skipped' and s.cancellation_reason is not null)),
 'completed',(select count(*) from public.route_stops s join public.properties pr on pr.id=s.property_id where s.organization_id=org and s.service_date=(now() at time zone pr.service_timezone)::date and s.status='completed'),
 'remaining',(select count(*) from public.route_stops s join public.properties pr on pr.id=s.property_id where s.organization_id=org and s.service_date=(now() at time zone pr.service_timezone)::date and s.status in ('pending','in_progress')),
 'technicians',(select count(*) from public.profiles where organization_id=org and role='technician' and access_state='active'),
 'customers',(select count(*) from public.customers where organization_id=org and status='active' and archived_at is null),
 'properties',(select count(*) from public.properties p join public.customers c on c.id=p.customer_id where p.organization_id=org and c.status='active' and c.archived_at is null),
 'pools',(select count(*) from public.pools p join public.properties pr on pr.id=p.property_id join public.customers c on c.id=pr.customer_id where p.organization_id=org and p.status='active' and c.status='active' and c.archived_at is null),
 'mrr_cents',(select coalesce(sum(a.price_cents),0) from public.contracts a join public.customers c on c.id=a.customer_id where a.organization_id=org and a.source='own' and a.billing_model='monthly' and a.status='active' and c.status='active' and c.archived_at is null and exists(select 1 from public.properties p join public.recurring_schedules sc on sc.property_id=p.id where p.customer_id=c.id and sc.active and sc.start_on<=(now() at time zone p.service_timezone)::date and (sc.end_on is null or sc.end_on>=(now() at time zone p.service_timezone)::date))),
 'new_customers',(select count(*) from public.customers where organization_id=org and created_at>=now()-interval '30 days' and archived_at is null),
 'pending_reports',(select count(*) from public.email_delivery_logs where organization_id=org and status='pending'),
 'failed_reports',(select count(*) from public.email_delivery_logs where organization_id=org and status='failed'),
 'missing_coordinates',(select count(*) from public.properties where organization_id=org and (latitude is null or not location_confirmed)),
 'issues',(select count(*) from public.visit_issue_flags f join public.visits v on v.id=f.visit_id where f.organization_id=org and v.completed_at>=now()-interval '7 days' and cardinality(f.flags)>0),
 'overdue',(select count(*) from public.route_stops s join public.properties pr on pr.id=s.property_id where s.organization_id=org and s.service_date<(now() at time zone pr.service_timezone)::date and s.status in ('pending','in_progress')));
end $$;
revoke all on function public.owner_overview() from public,anon;
grant execute on function public.owner_overview() to authenticated;
