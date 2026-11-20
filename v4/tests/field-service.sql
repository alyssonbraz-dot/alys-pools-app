-- Run via psql -v ON_ERROR_STOP=1 against the isolated V4 database.
-- All fixture writes and assertions execute inside one rollback-only transaction.
begin;
create function pg_temp.check_that(condition boolean, message text) returns void
language plpgsql as $$begin
  if condition is distinct from true then raise exception 'Failed: %', message; end if;
end$$;

insert into public.organizations(id,name) values
  ('10000000-0000-4000-8000-000000000001','RLS test A'),
  ('20000000-0000-4000-8000-000000000001','RLS test B');
insert into auth.users(id) values
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000002');
insert into public.profiles(id,organization_id,role,display_name) values
  ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','owner','Route owner'),
  ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','technician','Other technician'),
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','owner','Other company');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$
declare
  service_day date := '2099-01-05';
  stop_a uuid := gen_random_uuid();
  stop_b uuid := gen_random_uuid();
  visit_id uuid := gen_random_uuid();
  body_id uuid;
  packet jsonb;
  route jsonb;
begin
  perform public.v4_add_stop(stop_a,service_day,'Fixture 1','Harbor 1','pool',10000);
  perform public.v4_add_stop(stop_b,service_day,'Fixture 2','Harbor 2','spa',750);
  route := public.v4_route(service_day);
  perform pg_temp.check_that(jsonb_array_length(route->'stops') = 2,'assigned route returns both stops');
  perform pg_temp.check_that((route#>>'{stops,0,id}')::uuid = stop_a,'route follows position');
  body_id := (route#>>'{stops,0,bodies,0,id}')::uuid;
  packet := jsonb_build_object('id',visit_id,'stopId',stop_a,'date',service_day,'notes','Fixture notes','bodies',
    jsonb_build_array(jsonb_build_object('bodyId',body_id,'ph',7.5,'fc',3,'alkalinity',null,
      'tasks',jsonb_build_array('Brush walls'),'chemicals',jsonb_build_array())));
  begin
    perform public.v4_complete(jsonb_set(packet,'{bodies,0,bodyId}',to_jsonb(gen_random_uuid())));
    raise exception 'Accepted a body from outside the stop';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.v4_complete(jsonb_set(packet,'{bodies,0,ph}','20'));
    raise exception 'Accepted an invalid reading';
  exception when invalid_parameter_value then null; end;
  perform pg_temp.check_that((select count(*)=0 from public.visits),'failed submissions roll back');
  perform public.v4_complete(packet);
  perform public.v4_complete(packet);
  perform pg_temp.check_that((select count(*)=1 from public.visits),'retry creates one visit');
  perform pg_temp.check_that((select count(*)=1 from public.body_readings),'retry creates one reading per body');
  perform pg_temp.check_that((select count(*)=1 from public.service_reports),'retry creates one report');
  begin
    perform public.v4_complete(jsonb_set(packet,'{notes}','"Changed"'));
    raise exception 'Conflicting replay unexpectedly succeeded';
  exception when unique_violation then null; end;
  route := public.v4_order(service_day,array[stop_b,stop_a],'save');
  perform pg_temp.check_that((route#>>'{stops,0,id}')::uuid = stop_b,'save order');
  route := public.v4_order(service_day,'{}','reset');
  perform pg_temp.check_that((route#>>'{stops,0,id}')::uuid = stop_b,'reset uses saved default');
  begin
    perform public.v4_order(service_day,array[stop_a,stop_a],'save');
    raise exception 'Invalid order unexpectedly succeeded';
  exception when invalid_parameter_value then null; end;

  perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
  perform pg_temp.check_that(jsonb_array_length(public.v4_route(service_day)->'stops') = 0,'other technician in same company');
  begin
    perform public.v4_complete(packet);
    raise exception 'Other technician completed stop';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
  perform pg_temp.check_that((select count(*)=0 from public.visits),'foreign company cannot read visits');
  perform pg_temp.check_that((select count(*)=0 from public.service_sites),'foreign company cannot read sites');
  perform pg_temp.check_that((select count(*)=0 from public.water_bodies),'foreign company cannot read water bodies');
  perform pg_temp.check_that((select count(*)=0 from public.body_readings),'foreign company cannot read measurements');
  perform pg_temp.check_that((select count(*)=0 from public.service_reports),'foreign company cannot read reports');
  perform pg_temp.check_that((select count(*)=0 from public.route_defaults),'order defaults stay private');
  begin
    update public.profiles set role = 'owner' where id=auth.uid();
    raise exception 'Direct update to privileged profile succeeded';
  exception when insufficient_privilege then null; end;
end$$;

set local role anon;
do $$begin
  begin
    perform public.v4_route('2099-01-05');
    raise exception 'Anonymous route read succeeded';
  exception when insufficient_privilege then null; end;
end$$;
rollback;
