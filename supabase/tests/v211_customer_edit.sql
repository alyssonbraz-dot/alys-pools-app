begin;
insert into auth.users(id) values('a0000024-0000-4000-8000-000000000001'),('a0000024-0000-4000-8000-000000000002');
insert into public.organizations(id,name) values('b0000024-0000-4000-8000-000000000001','Hotfix fixtures');
insert into public.profiles(id,organization_id,role,display_name) values('a0000024-0000-4000-8000-000000000001','b0000024-0000-4000-8000-000000000001','owner','Owner'),('a0000024-0000-4000-8000-000000000002','b0000024-0000-4000-8000-000000000001','technician','Tech');
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000024-0000-4000-8000-000000000001',true);
do $$ declare p jsonb;q jsonb;cid uuid;pid uuid;pool_id uuid;sc_id uuid;stop_id uuid;visit_id uuid:=gen_random_uuid();history jsonb;before_sc jsonb;before_stops jsonb;next_id uuid;other_cid uuid;other_pid uuid;today date:=(now() at time zone 'America/New_York')::date;dow integer:=extract(dow from now() at time zone 'America/New_York');begin
 p:=jsonb_build_object('request_id',gen_random_uuid(),'customer',jsonb_build_object('first_name','Hotfix','last_name','Client','phone','','email','','status','active','service_frequency',7,'tags','[]'::jsonb),
 'properties',jsonb_build_array(jsonb_build_object('address','Fictional hotfix address','name','Hotfix home','service_timezone','America/New_York','pools',jsonb_build_array(jsonb_build_object('name','Pool','gallons',10000,'water_type','chlorine','type','residential','checklist',jsonb_build_array('Test Water'),'required_readings','[]'::jsonb)),
 'schedules',jsonb_build_array(jsonb_build_object('technician_id','a0000024-0000-4000-8000-000000000002','days_of_week',jsonb_build_array(0,1,2,3,4,5,6),'start_on',today,'end_on','','active',true,'service_notes','')))),
 'agreement',jsonb_build_object('source','own','billing_model','monthly','price_cents',15000,'status','active'));
 cid:=public.save_customer_bundle(p);select id into pid from public.properties where customer_id=cid;select id into pool_id from public.pools where property_id=pid;select id into sc_id from public.recurring_schedules where property_id=pid;
 p:=jsonb_set(p,'{customer,id}',to_jsonb(cid));p:=jsonb_set(p,'{properties,0,id}',to_jsonb(pid));p:=jsonb_set(p,'{properties,0,pools,0,id}',to_jsonb(pool_id));p:=jsonb_set(p,'{properties,0,schedules,0,id}',to_jsonb(sc_id));p:=jsonb_set(p,'{agreement,id}',to_jsonb((select id from public.contracts where customer_id=cid)));
 select id into stop_id from public.route_stops where property_id=pid and service_date=today;perform public.set_stop_status(stop_id,'in_progress');
 select id into next_id from public.route_stops where property_id=pid and service_date=today+1;
 perform public.complete_visit(jsonb_build_object('id',visit_id,'stop_id',next_id,'photo_paths','[]'::jsonb,'pools',jsonb_build_array(jsonb_build_object('pool_id',pool_id,'tasks',jsonb_build_array('Test Water'),'readings','{}'::jsonb,'dosages','[]'::jsonb))));
 select snapshot into history from public.visits where id=visit_id;select to_jsonb(sc) into before_sc from public.recurring_schedules sc where id=sc_id;select jsonb_agg(to_jsonb(s) order by s.id) into before_stops from public.route_stops s where property_id=pid;
 -- Existing in-progress service must not block contact/name/price/address edits.
 p:=jsonb_set(p,'{customer,phone}','"555-0101"');p:=p||jsonb_build_object('request_id',gen_random_uuid());perform public.save_customer_bundle(p);
 if (select phone from public.customers where id=cid)<>'555-0101' then raise exception 'Phone did not persist';end if;
 if (select to_jsonb(sc) from public.recurring_schedules sc where id=sc_id) is distinct from before_sc or (select jsonb_agg(to_jsonb(s) order by s.id) from public.route_stops s where property_id=pid) is distinct from before_stops then raise exception 'Unchanged service was rewritten';end if;
 p:=jsonb_set(p,'{customer,first_name}','"Edited"');p:=jsonb_set(p,'{agreement,price_cents}','17500');p:=jsonb_set(p,'{properties,0,address}','"Fictional corrected address"');p:=p||jsonb_build_object('request_id',gen_random_uuid());perform public.save_customer_bundle(p);
 if (select name from public.customers where id=cid)<>'Edited Client' or (select price_cents from public.contracts where customer_id=cid)<>17500 or (select address from public.properties where id=pid)<>'Fictional corrected address' then raise exception 'Independent fields not persisted';end if;
 -- A safe weekday change that retains the running service is allowed.
 q:=(p#>'{properties,0,schedules,0}')||jsonb_build_object('property_id',pid,'days_of_week',jsonb_build_array(dow),'service_notes','Safe notes');perform public.save_service_schedule(q);
 if (select status from public.route_stops where id=stop_id)<>'in_progress' then raise exception 'Running stop changed';end if;
 begin perform public.save_service_schedule(q||jsonb_build_object('days_of_week',jsonb_build_array((dow+1)%7)));raise exception 'Conflicting weekday change accepted';exception when invalid_parameter_value then if sqlerrm<>'ALYS_SCHEDULE_CONFLICT' then raise;end if;end;
 perform public.save_service_schedule(q||jsonb_build_object('service_notes','Notes while running'));
 if (select snapshot from public.visits where id=visit_id) is distinct from history or (select count(*) from public.visits where id=visit_id)<>1 then raise exception 'Completed history changed';end if;
 -- Separate future recurring agreement: Friday -> Tuesday, no duplicate stops.
 q:=p||jsonb_build_object('request_id',gen_random_uuid());q:=jsonb_set(q,'{customer}',(q->'customer')-'id');q:=jsonb_set(q,'{properties,0}',(q#>'{properties,0}')-'id');q:=jsonb_set(q,'{properties,0,pools,0}',(q#>'{properties,0,pools,0}')-'id');q:=jsonb_set(q,'{properties,0,schedules,0}',((q#>'{properties,0,schedules,0}')-'id')||jsonb_build_object('days_of_week',jsonb_build_array(5),'start_on',today+1));q:=jsonb_set(q,'{agreement}',(q->'agreement')-'id');other_cid:=public.save_customer_bundle(q);select id into other_pid from public.properties where customer_id=other_cid;
 select to_jsonb(sc) into q from public.recurring_schedules sc where property_id=other_pid;perform public.save_service_schedule(q||jsonb_build_object('days_of_week',jsonb_build_array(2),'end_on',''));
 if exists(select 1 from public.route_stops where property_id=other_pid and status='pending' and extract(dow from service_date)<>2) then raise exception 'Friday not replaced by Tuesday';end if;
 if exists(select 1 from public.route_stops where property_id=other_pid group by property_id,technician_id,service_date having count(*)>1) then raise exception 'Duplicate stops';end if;
 -- The date-scoped reader works beyond the general +7-day property window.
 perform set_config('request.jwt.claim.sub','a0000024-0000-4000-8000-000000000002',true);
 if jsonb_array_length(public.assigned_route_context(today+14)->'properties')<1 then raise exception 'Assigned future context missing';end if;
 begin perform public.save_service_schedule(q||jsonb_build_object('days_of_week',jsonb_build_array(5)));raise exception 'Technician edited customer schedule';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'V2.1.1 independent edits, real schedule conflicts, history, Friday/Tuesday, duplicate prevention and assigned date context passed' as result;
