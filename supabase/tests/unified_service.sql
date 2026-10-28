begin;
set local timezone = 'America/New_York';
insert into auth.users values('a0000015-0000-4000-8000-000000000001'),('a0000015-0000-4000-8000-000000000002');
insert into public.organizations(id,name) values('b0000015-0000-4000-8000-000000000001','V2 Test');
insert into public.profiles(id,organization_id,role,display_name) values
('a0000015-0000-4000-8000-000000000001','b0000015-0000-4000-8000-000000000001','owner','Owner'),
('a0000015-0000-4000-8000-000000000002','b0000015-0000-4000-8000-000000000001','technician','Tech');
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000015-0000-4000-8000-000000000001',true);
do $$ declare p jsonb;cid uuid;count_before integer;sid uuid;begin
 p:=jsonb_build_object('request_id',gen_random_uuid(),'customer',jsonb_build_object('first_name','Unified','last_name','Client','email','','phone','','status','active','service_frequency',2,'tags','[]'::jsonb),
 'properties',jsonb_build_array(jsonb_build_object('address','Fictional address FL','name','Test property','pools',jsonb_build_array(jsonb_build_object('name','Main Pool','gallons',10000,'water_type','chlorine','type','residential','checklist',jsonb_build_array('Test Water'),'required_readings',jsonb_build_array('fc','ph'))),
 'schedules',jsonb_build_array(jsonb_build_object('technician_id','a0000015-0000-4000-8000-000000000002','days_of_week',jsonb_build_array(0,1,2,3,4,5,6),'start_on',current_date,'end_on','','active',true)))),
 'agreement',jsonb_build_object('source','own','billing_model','monthly','price_cents',15000,'status','active'));
 cid:=public.save_customer_bundle(p);
 if public.save_customer_bundle(p)<>cid then raise exception 'Idempotence failed';end if;
 if (select count(*) from public.customers)<>1 or (select count(*) from public.pools)<>1 or (select count(*) from public.contracts)<>1 then raise exception 'Duplicate onboarding';end if;
 if (select count(*) from public.route_stops)<>28 then raise exception 'Expected bounded 28-day window';end if;
 select id into sid from public.recurring_schedules;
 perform public.save_service_schedule(jsonb_build_object('id',sid,'property_id',(select property_id from public.recurring_schedules where id=sid),'technician_id','a0000015-0000-4000-8000-000000000002','days_of_week',jsonb_build_array(0,1,2,3,4,5,6),'start_on',current_date,'active',false));
 if (public.owner_overview()->>'scheduled')::integer<>0 then raise exception 'Cancelled schedule counted as scheduled work';end if;
 if exists(select 1 from public.route_stops where status='pending') then raise exception 'Pause did not cancel eligible stops';end if;
 perform public.save_service_schedule(jsonb_build_object('id',sid,'property_id',(select property_id from public.recurring_schedules where id=sid),'technician_id','a0000015-0000-4000-8000-000000000002','days_of_week',jsonb_build_array(0,1,2,3,4,5,6),'start_on',current_date,'active',true));
 if (select count(*) from public.route_stops where status='pending')<>28 then raise exception 'Resume duplicated/lost stops';end if;
 begin perform public.save_customer_bundle(jsonb_set(p||jsonb_build_object('request_id',gen_random_uuid()),'{properties,0,pools,0,gallons}','-1'));raise exception 'Invalid pool accepted';exception when check_violation then null;end;
 if (select count(*) from public.customers)<>1 then raise exception 'Partial onboarding leaked';end if;

 -- Revenue is authoritative at agreement level: extra pools/subcontracts do not inflate own MRR.
 insert into public.contracts(organization_id,customer_id,source,billing_model,price_cents) values('b0000015-0000-4000-8000-000000000001',cid,'subcontract','monthly',999900);
 insert into public.pools(organization_id,property_id,name,gallons,water_type,type,checklist) select organization_id,id,'Spa',2000,'chlorine','spa',array['Test Water'] from public.properties where customer_id=cid;
 if (public.owner_overview()->>'mrr_cents')::bigint<>15000 then raise exception 'MRR counted subcontracts or pools';end if;
 declare completion jsonb;prop_id uuid;stop_uuid uuid;begin
 select id into prop_id from public.properties where customer_id=cid;
 select id into stop_uuid from public.route_stops where route_stops.property_id=prop_id and status='pending' order by service_date limit 1;
 completion:=jsonb_build_object('id',gen_random_uuid(),'stop_id',stop_uuid,'notes','','photo_paths','[]'::jsonb,'pools',(select jsonb_agg(jsonb_build_object('pool_id',id,'tasks',jsonb_build_array('Test Water'),'readings',jsonb_build_object('fc',3,'ph',7.4),'dosages',jsonb_build_array(jsonb_build_object('product','Liquid Chlorine','quantity',1,'unit','gal')))) from public.pools where pools.property_id=prop_id));
 perform public.complete_visit(completion);perform public.complete_visit(completion);
 if (select count(*) from public.chemistry_ledger(prop_id,30,0,null))<>2 then raise exception 'Per-body ledger missing';end if;
 if exists(select 1 from public.chemistry_ledger(prop_id,30,0,null) where readings ? 'tc') then raise exception 'Missing TC became zero';end if;
 if (select count(*) from public.visits where route_stop_id=stop_uuid)<>1 then raise exception 'Repeated completion duplicated';end if;
 end;
 -- Even identical property payloads represent distinct requested properties.
 declare multi jsonb;multi_id uuid;begin
 multi:=p||jsonb_build_object('request_id',gen_random_uuid(),'properties',(p->'properties')||(p->'properties'));
 multi_id:=public.save_customer_bundle(multi);
 if (select count(*) from public.properties where customer_id=multi_id)<>2 then raise exception 'Identical properties collapsed';end if;
 if (select count(*) from public.pools po join public.properties pr on pr.id=po.property_id where pr.customer_id=multi_id)<>2 then raise exception 'Multi-property pools missing';end if;
 end;

 perform public.assign_technician_properties('a0000015-0000-4000-8000-000000000002',array(select property_id from public.recurring_schedules where technician_id='a0000015-0000-4000-8000-000000000002' and active));
 perform public.assign_technician_properties('a0000015-0000-4000-8000-000000000002','{}'::uuid[]);
 if exists(select 1 from public.recurring_schedules where technician_id='a0000015-0000-4000-8000-000000000002' and active) then raise exception 'Assignment removal retained active future schedules';end if;
 if (select count(*) from public.visits)<>1 then raise exception 'Assignment removal deleted history';end if;
 perform set_config('test.bundle',p::text,true);
end $$;
select set_config('request.jwt.claim.sub','a0000015-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform public.save_customer_bundle(current_setting('test.bundle')::jsonb);raise exception 'Technician onboarding allowed';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'Unified onboarding atomicity, idempotence, bounded recurrence, pause/resume and permissions passed' as result;
