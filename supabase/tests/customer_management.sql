begin;
insert into auth.users(id) values('d1000000-0000-4000-8000-000000000001'),('d1000000-0000-4000-8000-000000000002'),('d1000000-0000-4000-8000-000000000003');
insert into public.organizations(id,name) values('d2000000-0000-4000-8000-000000000001','Management A'),('d2000000-0000-4000-8000-000000000002','Management B');
insert into public.profiles(id,organization_id,role,display_name) values
('d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','owner','Fixture owner'),
('d1000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001','technician','Fixture technician'),
('d1000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000002','owner','Other owner');
insert into public.customers(id,organization_id,name) values('d3000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002','Foreign client');
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
do $$ declare cid uuid;payload jsonb;begin
 payload:='{"first_name":"Demo","last_name":"Manager","email":"demo@example.test","phone":"555","status":"lead","service_address":"Fictional address FL","property_name":"Fictional property","billing_address":"Fictional billing address","internal_notes":"PRIVATE BILLING NOTE","monthly_price_cents":14000,"service_frequency":2,"assigned_technician_id":"d1000000-0000-4000-8000-000000000002","tags":["demo","salt"],"latitude":26.12,"longitude":-80.14,"email_reports_enabled":false}';
 cid:=public.save_customer_profile(payload);perform set_config('test.customer',cid::text,true);
 if not exists(select 1 from public.customers where id=cid and status='lead' and name='Demo Manager') then raise exception 'Lead creation failed';end if;
 if (select monthly_price_cents from public.customer_details where customer_id=cid)<>14000 then raise exception 'Price lost';end if;
 if (select count(*) from public.customer_tags where customer_id=cid)<>2 then raise exception 'Tags lost';end if;
 begin perform public.bulk_customers(array[cid,'d3000000-0000-4000-8000-000000000002'::uuid],'status','inactive');raise exception 'Cross-tenant bulk allowed';exception when insufficient_privilege then null;end;
 if (select status from public.customers where id=cid)<>'lead' then raise exception 'Bulk partially applied';end if;
 perform public.bulk_customers(array[cid],'status','active');
 perform public.bulk_customers(array[cid],'remove_tag','salt');
 perform public.bulk_customers(array[cid],'add_tag','weekly');
 if exists(select 1 from public.customer_tags where customer_id=cid and tag='salt') then raise exception 'Remove tag failed';end if;
 if not exists(select 1 from public.customer_tags where customer_id=cid and tag='weekly') then raise exception 'Add tag failed';end if;
 begin perform public.save_customer_profile(payload||jsonb_build_object('id',cid,'assigned_technician_id','d1000000-0000-4000-8000-000000000003'));raise exception 'Foreign technician accepted';exception when insufficient_privilege then null;end;
 if not (public.claim_customer_invitation(cid)->>'claimed')::boolean then raise exception 'Invite claim missing';end if;
 if (public.claim_customer_invitation(cid)->>'claimed')::boolean then raise exception 'Invite duplicate claim';end if;
 insert into public.route_plans(organization_id,technician_id,service_date) values('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002',current_date);
end $$;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.customer_details) then raise exception 'Technician leaked private billing metadata';end if;
 if (select count(*) from public.route_plans)<>1 then raise exception 'Assigned plan unavailable';end if;
 begin perform public.bulk_customers(array[current_setting('test.customer')::uuid],'status','inactive');raise exception 'Technician bulk allowed';exception when insufficient_privilege then null;end;
 begin insert into public.route_plans(organization_id,technician_id,service_date) values('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',current_date);raise exception 'Technician wrote another route';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
do $$ begin if exists(select 1 from public.route_plans) then raise exception 'Other tenant read route plan';end if;end $$;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
do $$ declare cid uuid:=current_setting('test.customer')::uuid;begin
 perform public.bulk_customers(array[cid],'archive','');
 if not exists(select 1 from public.customers where id=cid and archived_at is not null and status='inactive') then raise exception 'Archive missing';end if;
 if not exists(select 1 from public.properties where customer_id=cid) then raise exception 'Archive destroyed property';end if;
end $$;
rollback;
select 'Customer management, private metadata, atomic bulk and route plan RLS passed' as result;
