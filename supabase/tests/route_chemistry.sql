begin;
insert into auth.users(id) values ('c1000000-0000-4000-8000-000000000001'),('c1000000-0000-4000-8000-000000000002'),('c1000000-0000-4000-8000-000000000003');
insert into public.organizations(id,name) values('c2000000-0000-4000-8000-000000000001','History tenant A'),('c2000000-0000-4000-8000-000000000002','History tenant B');
insert into public.profiles(id,organization_id,role,display_name) values
('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','owner','Previous technician'),
('c1000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001','technician','Current technician'),
('c1000000-0000-4000-8000-000000000003','c2000000-0000-4000-8000-000000000002','technician','Other tenant');
insert into public.customers(id,organization_id,name) values('c3000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Fictional client');
insert into public.properties(id,organization_id,customer_id,address) values('c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','Fictional address');
insert into public.pools(id,organization_id,property_id,name,gallons,water_type,type) values('c5000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','Main pool',15000,'chlorine','residential');
insert into public.route_stops(id,organization_id,property_id,technician_id,service_date) values
('c6000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',current_date-10),
('c6000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002',current_date);
insert into public.visits(id,organization_id,route_stop_id,technician_id,completed_at,snapshot) values('c7000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',now()-interval '10 days','{"notes":"Private data not returned by chemistry RPC","pools":[]}');
insert into public.chemical_readings(organization_id,visit_id,pool_id,fc,ph) values('c2000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001',0,7.3);
insert into public.chemical_dosages(organization_id,visit_id,pool_id,product,quantity,unit) values('c2000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','Liquid Chlorine',1,'gal');
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
do $$ declare row record;begin
 if exists(select 1 from public.visits) then raise exception 'Current tech can read another technician full snapshot';end if;
 select * into row from public.route_chemistry_history(array['c4000000-0000-4000-8000-000000000001'::uuid],current_date-29,current_date);
 if not found or row.readings->>'fc'<>'0' or row.dosages->0->>'unit'<>'gal' then raise exception 'Assigned pool chemistry missing';end if;
 if to_jsonb(row)::text like '%Private data%' then raise exception 'Notes leaked';end if;
 if exists(select 1 from public.route_chemistry_history(array['c4000000-0000-4000-8000-000000000001'::uuid],current_date-5,current_date)) then raise exception 'Old chemistry not filtered';end if;
 begin perform * from public.route_chemistry_history(array['c4000000-0000-4000-8000-000000000001'::uuid],current_date-31,current_date);raise exception 'Unbounded date window';exception when invalid_parameter_value then null;end;
end $$;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.route_chemistry_history(array['c4000000-0000-4000-8000-000000000001'::uuid],current_date-29,current_date)) then raise exception 'Cross-tenant chemistry leak';end if;
end $$;
set local role anon;
do $$ begin
 begin perform * from public.route_chemistry_history(array['c4000000-0000-4000-8000-000000000001'::uuid],current_date-29,current_date);raise exception 'Anonymous chemistry access';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'Scoped 30-day route chemical history assertions passed' as result;
