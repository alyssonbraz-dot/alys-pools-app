begin;
insert into auth.users(id) values('e1000000-0000-4000-8000-000000000001'),('e1000000-0000-4000-8000-000000000002'),('e1000000-0000-4000-8000-000000000003');
insert into public.organizations(id,name) values('e2000000-0000-4000-8000-000000000001','Review fixes fixture');
insert into public.profiles(id,organization_id,role,display_name) values
('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','owner','Review manager'),
('e1000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','technician','Old technician'),
('e1000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000001','technician','New technician');
insert into public.customers(id,organization_id,name) values('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Review client');
insert into public.properties(id,organization_id,customer_id,address,gate_notes) values('e4000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','Fictional review address','CURRENT PRIVATE GATE');
insert into public.pools(organization_id,property_id,name,gallons,water_type,type) values('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','Review pool',10000,'chlorine','residential');
insert into public.recurring_schedules(id,organization_id,property_id,technician_id,days_of_week,start_on) values('e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002',array[0,1,2,3,4,5,6],(now() at time zone 'America/New_York')::date);
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
do $$ declare sid uuid;expected jsonb;begin
 if not public.claim_geocode_slot() or public.claim_geocode_slot() then raise exception 'Distributed geocode limiter failed';end if;
 perform public.generate_route((now() at time zone 'America/New_York')::date+21);
 select id into sid from public.route_stops where service_date=(now() at time zone 'America/New_York')::date+21;
 update public.recurring_schedules set technician_id='e1000000-0000-4000-8000-000000000003' where id='e5000000-0000-4000-8000-000000000001';
 perform public.generate_route((now() at time zone 'America/New_York')::date+21);
 if (select count(*) from public.route_stops where service_date=(now() at time zone 'America/New_York')::date+21)<>1 or not exists(select 1 from public.route_stops where id=sid and technician_id='e1000000-0000-4000-8000-000000000003') then raise exception 'Schedule reassignment duplicated or replaced stable stop';end if;
 update public.recurring_schedules set active=false where id='e5000000-0000-4000-8000-000000000001';
 if exists(select 1 from public.route_stops where id=sid and status='pending') then raise exception 'Disabled schedule still pending';end if;
 update public.recurring_schedules set active=true where id='e5000000-0000-4000-8000-000000000001';
 if not exists(select 1 from public.route_stops where id=sid and status='pending') then raise exception 'Reenabled schedule not restored';end if;
 perform public.set_stop_status(sid,'skipped');
 update public.recurring_schedules set active=false where id='e5000000-0000-4000-8000-000000000001';
 update public.recurring_schedules set active=true where id='e5000000-0000-4000-8000-000000000001';
 if not exists(select 1 from public.route_stops where id=sid and status='skipped') then raise exception 'Manual skip was undone';end if;
 perform public.set_stop_status(sid,'in_progress');
 begin update public.recurring_schedules set active=false where id='e5000000-0000-4000-8000-000000000001';raise exception 'In-progress schedule changed';exception when invalid_parameter_value then null;end;
 perform public.set_stop_status(sid,'pending');
 -- An invalid plan must roll back its preceding route reorder.
 expected:=(select jsonb_agg(jsonb_build_object('id',id,'status',status,'position',position) order by position,id) from public.route_stops where service_date=(now() at time zone 'America/New_York')::date+21);
 begin perform public.save_driving_plan(jsonb_build_object('technician_id','e1000000-0000-4000-8000-000000000003','service_date',(now() at time zone 'America/New_York')::date+21,'start_time','08:00','start_latitude',999,'start_longitude',0),array[sid],expected);raise exception 'Invalid plan accepted';exception when check_violation then null;end;
 if exists(select 1 from public.route_plans) then raise exception 'Plan partially saved';end if;
 begin perform public.save_driving_plan(jsonb_build_object('technician_id','e1000000-0000-4000-8000-000000000003','service_date',(now() at time zone 'America/New_York')::date+21,'start_time','08:00'),array[sid],'[]');raise exception 'Stale route accepted';exception when serialization_failure then null;end;
 perform public.bulk_customers(array['e3000000-0000-4000-8000-000000000001'::uuid],'archive','');
 if exists(select 1 from public.route_stops where service_date=(now() at time zone 'America/New_York')::date+21 and status in ('pending','in_progress')) then raise exception 'Archived customer still scheduled';end if;
 begin perform public.set_stop_status(sid,'pending');raise exception 'Inactive customer restarted';exception when invalid_parameter_value then null;end;
 update public.customers set status='active',archived_at=null where id='e3000000-0000-4000-8000-000000000001';
 if not exists(select 1 from public.route_stops where id=sid and status='pending') then raise exception 'Reactivated customer lost automatic future visit';end if;
end $$;
reset role;
update public.customers set status='active',archived_at=null where id='e3000000-0000-4000-8000-000000000001';
insert into public.route_stops(organization_id,property_id,technician_id,service_date,status)
select 'e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002',(now() at time zone 'America/New_York')::date-n,'completed' from generate_series(1,260) n;
insert into public.visits(id,organization_id,route_stop_id,technician_id,completed_at,snapshot)
select gen_random_uuid(),organization_id,id,technician_id,service_date::timestamptz,'{"property_name":"Searchable fixture","customer_name":"Review client","notes":"","pools":[]}' from public.route_stops where status='completed';
insert into public.route_stops(id,organization_id,property_id,technician_id,service_date,status,cancellation_reason) values('e6000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002',(now() at time zone 'America/New_York')::date+1,'skipped','schedule_changed');
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform public.set_stop_status('e6000000-0000-4000-8000-000000000002','pending');raise exception 'Cancelled assignment restored by technician';exception when insufficient_privilege then null;end;
 perform public.set_stop_status('e6000000-0000-4000-8000-000000000002','skipped');
 begin perform * from public.unused_photo_uploads('e2000000-0000-4000-8000-000000000001');raise exception 'Browser session can enumerate maintenance candidates';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.properties) then raise exception 'Historical assignment leaked live gate notes';end if;
 if (select count(*) from public.search_visits('Searchable','all',null,0,51))<>51 or (select count(*) from public.search_visits('Searchable','all',null,250,51))<>10 then raise exception 'History pagination lost authorized old visits';end if;
end $$;
reset role;
insert into public.route_stops(id,organization_id,property_id,technician_id,service_date) values('e6000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002',(now() at time zone 'America/New_York')::date);
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
do $$ declare n integer;p uuid:=gen_random_uuid();begin
 if not exists(select 1 from public.properties) then raise exception 'Current assignment denied live property';end if;
 if not public.reserve_photo_upload('e6000000-0000-4000-8000-000000000001',p) or not public.reserve_photo_upload('e6000000-0000-4000-8000-000000000001',p) then raise exception 'Stable photo retry denied';end if;
 for n in 1..11 loop if not public.reserve_photo_upload('e6000000-0000-4000-8000-000000000001',gen_random_uuid()) then raise exception 'Photo reservation denied too early';end if;end loop;
 if public.reserve_photo_upload('e6000000-0000-4000-8000-000000000001',gen_random_uuid()) then raise exception 'Upload cap bypassed';end if;
end $$;
reset role;
update public.photo_upload_budget set created_at=now()-interval '15 days';
update public.route_stops set status='completed' where id='e6000000-0000-4000-8000-000000000001';
set local role service_role;
do $$ declare candidate record;begin
 if (select count(*) from public.unused_photo_uploads('e2000000-0000-4000-8000-000000000001'))<>12 then raise exception 'Maintenance candidates missing';end if;
 select * into candidate from public.unused_photo_uploads('e2000000-0000-4000-8000-000000000001') limit 1;
 perform public.release_unused_photo(candidate.stop_id,candidate.photo_id);
 if (select count(*) from public.unused_photo_uploads('e2000000-0000-4000-8000-000000000001'))<>11 then raise exception 'Budget release failed';end if;
end $$;
rollback;
select 'Review fixes: stable schedules, archived cancellation, live privacy, historical pagination, atomic/stale plans and upload quotas passed' as result;
