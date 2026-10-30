begin;
insert into public.organizations(id,name) values ('22000000-0000-4000-8000-000000000001','V22 synthetic org'),('22000000-0000-4000-8000-000000000002','V22 other org');
insert into auth.users(id,email) values ('22000000-0000-4000-8000-000000000011','v22-owner@example.test'),('22000000-0000-4000-8000-000000000012','v22-tech@example.test'),('22000000-0000-4000-8000-000000000013','v22-other@example.test');
insert into public.profiles(id,organization_id,role,display_name) values ('22000000-0000-4000-8000-000000000011','22000000-0000-4000-8000-000000000001','owner','V22 owner'),('22000000-0000-4000-8000-000000000012','22000000-0000-4000-8000-000000000001','technician','V22 tech'),('22000000-0000-4000-8000-000000000013','22000000-0000-4000-8000-000000000002','technician','V22 other');
insert into public.customers(id,organization_id,name) values ('22000000-0000-4000-8000-000000000021','22000000-0000-4000-8000-000000000001','Synthetic V22 client');
insert into public.properties(id,organization_id,customer_id,address) values ('22000000-0000-4000-8000-000000000031','22000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000021','Synthetic V22 address');
insert into public.route_stops(id,organization_id,property_id,technician_id,service_date,status) values ('22000000-0000-4000-8000-000000000041','22000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000031','22000000-0000-4000-8000-000000000012',current_date,'in_progress');
set local role authenticated;
select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000012',true);
select public.skip_route_stop('22000000-0000-4000-8000-000000000041','Access denied','22000000-0000-4000-8000-000000000051');
select public.skip_route_stop('22000000-0000-4000-8000-000000000041','Access denied','22000000-0000-4000-8000-000000000051');
do $$ begin
 if (select count(*) from public.route_skip_events)<>1 then raise exception 'Skip duplicate or missing event';end if;
 if (select status from public.route_stops where id='22000000-0000-4000-8000-000000000041')<>'skipped' then raise exception 'Not skipped';end if;
 if exists(select 1 from public.visits where route_stop_id='22000000-0000-4000-8000-000000000041') then raise exception 'Skip incorrectly completed a visit';end if;
 begin perform public.skip_route_stop('22000000-0000-4000-8000-000000000041','Changed reason','22000000-0000-4000-8000-000000000051');raise exception 'Reused request allowed';exception when sqlstate '22023' then null;end;
 begin update public.route_skip_events set reason='changed';raise exception 'Mutable audit';exception when insufficient_privilege then null;end;
end $$;
select public.set_stop_status('22000000-0000-4000-8000-000000000041','pending');
do $$ begin if (select count(*) from public.route_skip_events)<>1 then raise exception 'Restoring deleted audit';end if;end $$;
select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000013',true);
do $$ begin
 if exists(select 1 from public.route_skip_events) then raise exception 'Other tenant can read skip reasons';end if;
 begin perform public.skip_route_stop('22000000-0000-4000-8000-000000000041','Other tenant','22000000-0000-4000-8000-000000000052');raise exception 'Other tenant can skip';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000011',true);
do $$ begin if (public.system_health_metadata()->>'schema_version')::int<>25 then raise exception 'Metadata not upgraded';end if;end $$;
rollback;
select 'V2.2 skip reason, idempotence, restoration, immutable audit and tenant isolation passed';
