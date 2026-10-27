begin;
insert into auth.users(id) values('f1000000-0000-4000-8000-000000000001'),('f1000000-0000-4000-8000-000000000002');
set local role anon;
do $$ begin begin perform public.bootstrap_owner('f1000000-0000-4000-8000-000000000001','Fixture business','Fixture owner');raise exception 'Anonymous bootstrap allowed';exception when insufficient_privilege then null;end;end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
do $$ begin begin perform public.bootstrap_owner('f1000000-0000-4000-8000-000000000001','Fixture business','Fixture owner');raise exception 'Browser role escalation allowed';exception when insufficient_privilege then null;end;end $$;
set local role service_role;
do $$ declare a uuid;b uuid;begin
 a:=public.bootstrap_owner('f1000000-0000-4000-8000-000000000001','Fixture business','Fixture owner');
 b:=public.bootstrap_owner('f1000000-0000-4000-8000-000000000001','Fixture business','Fixture owner');
 if a<>b then raise exception 'Bootstrap not idempotent';end if;
 begin perform public.bootstrap_owner('f1000000-0000-4000-8000-000000000001','Different business','Another owner');raise exception 'Membership reassigned';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.organizations where name='Fixture business')<>1 then raise exception 'Organization duplicated';end if;
 if not exists(select 1 from public.profiles where id='f1000000-0000-4000-8000-000000000001' and role='owner') then raise exception 'Owner missing';end if;
 if exists(select 1 from public.customers where organization_id=(select organization_id from public.profiles where id='f1000000-0000-4000-8000-000000000001')) then raise exception 'Fake customers seeded in launch';end if;
end $$;
rollback;
select 'Owner bootstrap: server-only, idempotent, no role reassignment or customer seed passed' as result;
