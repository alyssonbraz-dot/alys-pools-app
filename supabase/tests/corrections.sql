begin;
insert into auth.users(id) values('a1000000-0000-4000-8000-000000000001'),('a1000000-0000-4000-8000-000000000002');
insert into public.organizations(id,name) values('a2000000-0000-4000-8000-000000000001','Correction fixture');
insert into public.profiles(id,organization_id,role,display_name) values
 ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','owner','Fictional manager'),
 ('a1000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001','technician','Fictional technician');
insert into public.customers(id,organization_id,name) values('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Fictional client');
insert into public.properties(id,organization_id,customer_id,address) values('a4000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','Fictional address');
insert into public.route_stops(id,organization_id,property_id,technician_id,service_date) values('a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002',current_date);
insert into public.visits(id,organization_id,route_stop_id,technician_id,snapshot) values('a6000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','{"pools":[]}');
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform public.add_visit_correction('a6000000-0000-4000-8000-000000000001','Technician not permitted');raise exception 'Technician correction bypass';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
do $$ declare correction uuid; begin
 begin perform public.add_visit_correction('a6000000-0000-4000-8000-000000000001',' ');raise exception 'Blank correction';exception when invalid_parameter_value then null;end;
 correction:=public.add_visit_correction('a6000000-0000-4000-8000-000000000001','FC recorded as 2.5 ppm; original retained.');
 if not exists(select 1 from public.visit_corrections where id=correction and actor_id=auth.uid()) then raise exception 'Correction missing actor';end if;
 if (select snapshot from public.visits where id='a6000000-0000-4000-8000-000000000001')<>'{"pools":[]}'::jsonb then raise exception 'Correction rewrote snapshot';end if;
 if exists(select 1 from public.email_delivery_logs) then raise exception 'Correction auto-sent email';end if;
 if not exists(select 1 from public.audit_log where entity='visit_corrections' and record_id=correction) then raise exception 'Correction missing audit';end if;
 begin update public.visit_corrections set note='Rewrite';raise exception 'Correction mutable';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'Append-only audited correction assertions passed' as result;
