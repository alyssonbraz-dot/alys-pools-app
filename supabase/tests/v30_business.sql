begin;
-- Both 026 histories must leave the new private rate storage and all prior records intact.
do $$ begin
 if to_regclass('public.finance_visit_terms') is null or to_regclass('public.finance_config_versions') is null then raise exception 'V3 rate schema bridge missing';end if;
end $$;
do $$ declare amount integer;begin if to_regclass('public.customer_profit_costs') is not null then
 execute $query$select technician_cost_per_visit_cents+chemicals_per_visit_cents+monthly_overhead_cents from public.customer_profit_costs where customer_id='37000000-0000-4000-8000-000000000002'$query$ into amount;
 if amount is distinct from 3712 then raise exception 'Bridge changed or discarded pre-existing V1 settings';end if;
end if;end $$;
insert into public.organizations(id,name) values('30000000-0000-4000-8000-000000000001','V3 fictional company');
insert into auth.users(id,email) values('30000000-0000-4000-8000-000000000011','v3-owner@example.test'),('30000000-0000-4000-8000-000000000012','v3-tech@example.test');
insert into public.profiles(id,organization_id,role,display_name) values('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000001','owner','V3 owner'),('30000000-0000-4000-8000-000000000012','30000000-0000-4000-8000-000000000001','technician','V3 tech');
insert into public.customers(id,organization_id,name) values('30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000001','V3 client');
do $$ begin if to_regclass('public.customer_profit_costs') is not null then
 execute $q$insert into public.customer_profit_costs(customer_id,organization_id,technician_cost_per_visit_cents,chemicals_per_visit_cents,monthly_overhead_cents) values('30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000001',2800,123,789)$q$;
end if;end $$;
set local role service_role;
select public.write_finance('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000031','config',date_trunc('month',now())::date,'{"terms":[{"scope":"technician","target":"30000000-0000-4000-8000-000000000012","model":"per_visit","rate_cents":2500}]}',null);
reset role;
do $$ declare legacy integer;begin if to_regclass('public.customer_profit_costs') is not null then
 execute 'select chemicals_per_visit_cents+monthly_overhead_cents from public.customer_profit_costs where customer_id=''30000000-0000-4000-8000-000000000021''' into legacy;
 if legacy<>912 then raise exception 'Legacy costs were overwritten';end if;
end if;end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000012',true);
do $$ declare total integer;begin
 if exists(select 1 from public.finance_config_versions) then raise exception 'Technician can read financial rates';end if;
 if to_regclass('public.customer_profit_costs') is not null then execute 'select count(*) from public.customer_profit_costs' into total;if total<>0 then raise exception 'Legacy rates leaked to technician';end if;end if;
end $$;
rollback;
select 'V3 schema reconciliation, preserved legacy assumptions and private technician rates passed';
