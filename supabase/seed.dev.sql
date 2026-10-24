-- MANUAL LOCAL DEVELOPMENT ONLY. Requires a local Auth user created via Studio.
-- Replace UUID below with that local user's ID. No passwords or users are seeded.
-- Run only against localhost:54322. Never apply to a hosted project.
begin;
do $$ begin
 if not exists(select 1 from auth.users where id='00000000-0000-4000-8000-000000000001') then
  raise exception 'Replace local user UUID in seed.dev.sql before running';
 end if;
end $$;
insert into public.organizations(id,name) values('10000000-0000-4000-8000-000000000001','Empresa de demonstração fictícia');
insert into public.profiles(id,organization_id,role,display_name) values('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner','Administrador fictício');
insert into public.customers(id,organization_id,name) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Residência fictícia 01');
insert into public.properties(id,organization_id,customer_id,address) values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Endereço fictício — Flórida');
insert into public.pools(organization_id,property_id,name,gallons,water_type,type) values('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Piscina fictícia',15000,'chlorine','residential');
insert into public.contracts(organization_id,customer_id,source,billing_model,price_cents) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','own','monthly',14000);
commit;
