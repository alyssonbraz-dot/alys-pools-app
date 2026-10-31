begin;
insert into public.organizations(id,name) values ('24000000-0000-4000-8000-000000000001','Synthetic finance tenant'),('24000000-0000-4000-8000-000000000002','Other finance tenant');
insert into auth.users(id,email) values ('24000000-0000-4000-8000-000000000011','finance-owner@example.test'),('24000000-0000-4000-8000-000000000012','finance-tech@example.test'),('24000000-0000-4000-8000-000000000013','finance-other@example.test');
insert into public.profiles(id,organization_id,role,display_name) values ('24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000001','owner','Fictional Owner'),('24000000-0000-4000-8000-000000000012','24000000-0000-4000-8000-000000000001','technician','Fictional Technician'),('24000000-0000-4000-8000-000000000013','24000000-0000-4000-8000-000000000002','owner','Other Owner');
insert into public.customers(id,organization_id,name) values('24000000-0000-4000-8000-000000000041','24000000-0000-4000-8000-000000000001','Fictional Client');
insert into public.properties(id,organization_id,customer_id,address) values('24000000-0000-4000-8000-000000000042','24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000041','Fictional service address');
insert into public.route_stops(id,organization_id,property_id,technician_id,service_date,status) values('24000000-0000-4000-8000-000000000043','24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000042','24000000-0000-4000-8000-000000000012',current_date,'completed');
insert into public.visits(id,organization_id,route_stop_id,technician_id,snapshot) values('24000000-0000-4000-8000-000000000044','24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000043','24000000-0000-4000-8000-000000000012','{}');
set local role service_role;
select public.write_finance('24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000021','config',date_trunc('month',now())::date,'{"terms":[{"scope":"default","target":"","model":"per_visit","rate_cents":2500}]}',null);
-- An identical retry must not append another version.
select public.write_finance('24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000021','config',date_trunc('month',now())::date,'{"terms":[{"scope":"default","target":"","model":"per_visit","rate_cents":2500}]}',null);
do $$ begin
 if (select count(*) from public.finance_config_versions where organization_id='24000000-0000-4000-8000-000000000001')<>1 then raise exception 'Retry duplicated finance config';end if;
 begin perform public.write_finance('24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000012',gen_random_uuid(),'open',current_date,'{}',null);raise exception 'Technician impersonation allowed';exception when insufficient_privilege then null;end;
 begin perform public.write_finance('24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000011',gen_random_uuid(),'config',date_trunc('month',now())::date,'{}',null);raise exception 'Stale version accepted';exception when serialization_failure then null;end;
 begin perform public.write_finance('24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000011',gen_random_uuid(),'config',(date_trunc('month',now())-interval '1 month')::date,'{}',null);raise exception 'Backdated config accepted';exception when invalid_parameter_value then null;end;
end $$;
select public.write_finance('24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000022','config',date_trunc('month',now())::date,'{"terms":[{"scope":"default","target":"","model":"per_visit","rate_cents":2700}]}','24000000-0000-4000-8000-000000000021');
do $$ begin if (select (payload->>'rate_cents')::int from public.finance_visit_terms where visit_id='24000000-0000-4000-8000-000000000044')<>2500 then raise exception 'Rate change repriced existing visit';end if;end $$;
select public.write_finance('24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000011',gen_random_uuid(),'open',date_trunc('month',now())::date,'{}',null);
select public.write_finance('24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000011',gen_random_uuid(),'open',date_trunc('month',now())::date,'{"recaptured":true}',null);
do $$ begin if (select jsonb_array_length(history) from public.finance_period_sources where organization_id='24000000-0000-4000-8000-000000000001')<>1 then raise exception 'Recapture lost source history';end if;end $$;
select public.write_finance('24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000031','records',date_trunc('month',now())::date,'{}',null);
select public.write_finance('24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000031','records',date_trunc('month',now())::date,'{}',null);
select public.write_finance('24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000011',gen_random_uuid(),'close',date_trunc('month',now())::date,'{"config_id":"24000000-0000-4000-8000-000000000022","report":{"forecast":{"profit":4000}}}','24000000-0000-4000-8000-000000000031');
do $$ begin
 if (select count(*) from public.finance_record_versions where organization_id='24000000-0000-4000-8000-000000000001')<>1 then raise exception 'Record retry duplicated';end if;
 begin perform public.write_finance('24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000011',gen_random_uuid(),'records',date_trunc('month',now())::date,'{"changed":true}','24000000-0000-4000-8000-000000000031');raise exception 'Closed period mutated';exception when invalid_parameter_value then null;end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000012',true);
do $$ declare t text;n integer;begin
 foreach t in array array['finance_config_versions','finance_period_sources','finance_record_versions','finance_closed_periods','finance_visit_terms'] loop execute format('select count(*) from public.%I',t) into n;if n<>0 then raise exception 'Technician finance leak';end if;end loop;
 begin perform public.write_finance('24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000011',gen_random_uuid(),'open',current_date,'{}',null);raise exception 'Client invoked service-only RPC';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000013',true);
do $$ begin if exists(select 1 from public.finance_config_versions) or exists(select 1 from public.finance_closed_periods) then raise exception 'Other tenant finance leak';end if;end $$;
select set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000011',true);
do $$ begin
 if (select count(*) from public.finance_config_versions)<>2 or (select count(*) from public.finance_closed_periods)<>1 then raise exception 'Owner cannot read finance';end if;
 begin update public.finance_config_versions set payload='{}';raise exception 'Version history mutable';exception when insufficient_privilege then null;end;
 begin update public.finance_visit_terms set payload='{}';raise exception 'Captured rates mutable';exception when insufficient_privilege then null;end;
 begin delete from public.finance_closed_periods;raise exception 'Closure mutable';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'Finance isolation, owner access, immutable versions, closed periods and idempotent writes passed';
