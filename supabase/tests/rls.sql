-- Runs in disposable Postgres using a minimal auth.uid() harness, not a Supabase Auth integration.
begin;
insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004');
insert into public.organizations(id,name) values ('10000000-0000-4000-8000-000000000001','Org A'),('10000000-0000-4000-8000-000000000002','Org B');
insert into public.profiles values
 ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner','Owner A'),
 ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','admin','Admin B'),
 ('00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','technician','Tech A');
insert into public.customers(id,organization_id,name) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Customer A'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Customer B');
insert into public.properties(id,organization_id,customer_id,address) values ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Fictional address A'),('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Fictional address B');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select count(*) from public.customers)<>1 then raise exception 'Cross-tenant read';end if;
 if (select count(*) from public.profiles)<>1 then raise exception 'Profile disclosure';end if;
 update public.customers set name='Updated A' where id='20000000-0000-4000-8000-000000000001';
 if not found then raise exception 'Own update failed'; end if;
 update public.customers set name='Hacked B' where id='20000000-0000-4000-8000-000000000002';
 if found then raise exception 'Cross-tenant update';end if;
 begin
  insert into public.customers(organization_id,name) values ('10000000-0000-4000-8000-000000000002','Intruder');
  raise exception 'Cross-tenant insert allowed';
 exception when insufficient_privilege then null;end;
 begin
  update public.customers set organization_id='10000000-0000-4000-8000-000000000002' where id='20000000-0000-4000-8000-000000000001';
  raise exception 'Tenant reassignment allowed';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.pools(organization_id,property_id,name,gallons,water_type,type) values ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','Invalid pool',15000,'salt','spa');
  raise exception 'Cross-tenant relationship allowed';
 exception when foreign_key_violation then null;end;
 begin
  update public.profiles set role='admin';raise exception 'Role escalation';
 exception when insufficient_privilege then null;end;
 begin
  delete from public.customers;raise exception 'Physical deletion allowed';
 exception when insufficient_privilege then null;end;
 insert into public.pools(id,organization_id,property_id,name,gallons,water_type,type) values ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Pool A',15000,'chlorine','residential');
 update public.pools set status='inactive' where id='40000000-0000-4000-8000-000000000001';
 if (select status from public.pools where id='40000000-0000-4000-8000-000000000001')<>'inactive' then raise exception 'Pool update failed';end if;
 if (select count(*) from public.audit_log where entity='pools')<>2 then raise exception 'Audit missing';end if;
 begin
  insert into public.audit_log(organization_id,entity,record_id,operation) values ('10000000-0000-4000-8000-000000000001','fake','40000000-0000-4000-8000-000000000001','INSERT');
  raise exception 'Audit tampering';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
 if (select count(*) from public.customers)<>1 then raise exception 'Admin B scope';end if;
 if exists(select 1 from public.pools) then raise exception 'Admin B pool leak';end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.customers) then raise exception 'Technician access';end if;
 begin
  insert into public.customers(organization_id,name) values ('10000000-0000-4000-8000-000000000001','Tech denied');
  raise exception 'Technician write';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
do $$ begin
 if exists(select 1 from public.customers) then raise exception 'Unprovisioned access';end if;
end $$;
set local role anon;
do $$ begin
 begin perform * from public.customers;raise exception 'Anonymous access';
 exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'RLS permission and CRUD assertions passed' as result;
