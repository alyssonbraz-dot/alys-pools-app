-- Transactional fixtures: entirely fictitious and rolled back after assertions.
begin;
insert into auth.users(id) values
 ('91000000-0000-4000-8000-000000000001'),('91000000-0000-4000-8000-000000000002'),
 ('91000000-0000-4000-8000-000000000003'),('91000000-0000-4000-8000-000000000004');
insert into public.organizations(id,name) values('92000000-0000-4000-8000-000000000001','Fast Route Test A'),('92000000-0000-4000-8000-000000000002','Fast Route Test B');
insert into public.profiles(id,organization_id,role,display_name) values
 ('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','owner','Manager A'),
 ('91000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','technician','Assigned Tech A'),
 ('91000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000001','technician','Other Tech A'),
 ('91000000-0000-4000-8000-000000000004','92000000-0000-4000-8000-000000000002','owner','Manager B');
insert into public.customers(id,organization_id,name,email,email_reports_enabled) values
 ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Fictional Client','nobody@example.test',true),
 ('93000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002','Other Fictional Client','',false);
insert into public.properties(id,organization_id,customer_id,name,address,gate_notes) values
 ('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Fictional Property','Fictional address FL','SECRET INTERNAL GATE'),
 ('94000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000002','Other Fictional Property','Other fictional address FL','OTHER SECRET');
insert into public.pools(id,organization_id,property_id,name,gallons,water_type,type,photo_required) values
 ('95000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','Main Pool',15000,'chlorine','residential',true),
 ('95000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','Spa',1500,'chlorine','spa',false);
insert into public.route_stops(id,organization_id,property_id,technician_id,service_date,position) values
 ('96000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002',current_date,1);
-- Fixture upload simulates the authenticated Storage service's persisted metadata.
insert into storage.objects(bucket_id,name,metadata) values('visit-photos','92000000-0000-4000-8000-000000000001/96000000-0000-4000-8000-000000000001/97000000-0000-4000-8000-000000000001.jpg','{"mimetype":"image/jpeg","size":1024}');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000004',true);
do $$ begin
 if exists(select 1 from public.route_stops) then raise exception 'Cross-tenant stop leak';end if;
 begin
  perform public.set_stop_status('96000000-0000-4000-8000-000000000001','in_progress');
  raise exception 'Cross-tenant mutation';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.route_stops) then raise exception 'Unassigned stop leak';end if;
 if exists(select 1 from public.properties) then raise exception 'Unassigned property leak';end if;
 if exists(select 1 from public.customers) then raise exception 'Unassigned client leak';end if;
 if public.can_read_visit_photo('92000000-0000-4000-8000-000000000001/96000000-0000-4000-8000-000000000001/97000000-0000-4000-8000-000000000001.jpg') then raise exception 'Unassigned photo leak';end if;
end $$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
do $$ declare payload jsonb; result jsonb; begin
 if (select count(*) from public.route_stops)<>1 or (select count(*) from public.properties)<>1 or (select count(*) from public.pools)<>2 then raise exception 'Assigned route unavailable';end if;
 if not public.can_upload_visit_photo('92000000-0000-4000-8000-000000000001/96000000-0000-4000-8000-000000000001/97000000-0000-4000-8000-000000000002.jpg') then raise exception 'Upload denied to assigned technician';end if;
 begin
  insert into storage.objects(bucket_id,name,metadata) values('visit-photos','92000000-0000-4000-8000-000000000001/96000000-0000-4000-8000-000000000001/97000000-0000-4000-8000-000000000002.jpg','{"mimetype":"image/jpeg","size":64}');
  raise exception 'Direct photo upload bypassed trusted JPEG decoding';
 exception when insufficient_privilege then null;end;
 begin
  update public.route_stops set status='completed';raise exception 'Completion bypass';
 exception when insufficient_privilege then null;end;
 begin
  perform public.set_stop_status('96000000-0000-4000-8000-000000000001','completed');raise exception 'Status RPC completion bypass';
 exception when invalid_parameter_value then null;end;
 perform public.set_stop_status('96000000-0000-4000-8000-000000000001','in_progress');
 payload:='{"id":"98000000-0000-4000-8000-000000000001","stop_id":"96000000-0000-4000-8000-000000000001","notes":"Public visit note","service_details":{"technician_notes":"SECRET STAFF ONLY","equipment_problems":"Fictional pump issue","filter_cleaning":"Fictional filter cleaned","repairs_performed":"No actual repairs"},"photo_paths":[],"pools":[{"pool_id":"95000000-0000-4000-8000-000000000001","tasks":["Skim Surface","Test Water"],"readings":{"fc":3,"ph":7.4,"tc":3.2,"temperature_f":82},"dosages":[{"product":"Liquid Chlorine","quantity":1,"unit":"gal"},{"product":"Muriatic Acid","quantity":12,"unit":"fl oz"}]},{"pool_id":"95000000-0000-4000-8000-000000000002","tasks":[],"readings":{"fc":2,"ph":7.3},"dosages":[]}]}';
 begin perform public.complete_visit(payload);raise exception 'Mandatory photo bypass';exception when invalid_parameter_value then null;end;
 payload:=jsonb_set(payload,'{photo_paths}','["92000000-0000-4000-8000-000000000001/96000000-0000-4000-8000-000000000001/97000000-0000-4000-8000-000000000001.jpg"]');
 begin perform public.complete_visit(jsonb_set(payload,'{pools,0,readings,fc}','-1'));raise exception 'Negative reading bypass';exception when invalid_parameter_value then null;end;
 begin perform public.complete_visit(payload #- '{pools,0,readings,ph}');raise exception 'Required reading bypass';exception when invalid_parameter_value then null;end;
 begin perform public.complete_visit(jsonb_set(payload,'{pools,0,tasks}','["Task never configured"]'));raise exception 'Checklist forgery';exception when invalid_parameter_value then null;end;
 begin perform public.complete_visit(payload #- '{pools,1}');raise exception 'Omitted second pool';exception when invalid_parameter_value then null;end;
 begin perform public.complete_visit(jsonb_set(payload,'{pools,0,dosages,0,quantity}','-1'));raise exception 'Negative dosage';exception when invalid_parameter_value then null;end;
 payload:=jsonb_set(payload,'{completed_at}',to_jsonb(now()-interval '2 days'));
 result:=public.complete_visit(payload);
 if (result->>'already_completed')::boolean then raise exception 'First completion replay';end if;
 result:=public.complete_visit(payload);
 if not (result->>'already_completed')::boolean then raise exception 'Idempotent retry failed';end if;
 if not exists(select 1 from public.visits where completed_at=now()-interval '2 days' and received_at>completed_at) then raise exception 'Offline service time replaced by sync receipt';end if;
 if (select count(*) from public.visits)<>1 or (select count(*) from public.chemical_readings)<>2 or (select count(*) from public.chemical_dosages)<>2 or (select count(*) from public.visit_checklist_items)<>2 then raise exception 'Normalized persistence mismatch';end if;
 if not exists(select 1 from public.chemical_readings where tc=3.2 and temperature_f=82) then raise exception 'Extended chemistry missing';end if;
 if not exists(select 1 from public.visit_service_details where technician_notes='SECRET STAFF ONLY') then raise exception 'Private service history missing';end if;
 if exists(select 1 from public.visits where snapshot::text like '%SECRET STAFF ONLY%') then raise exception 'Internal service detail leaked into report';end if;
 if (select count(*) from public.email_delivery_logs)<>1 then raise exception 'Email queue missing or duplicated';end if;
 if (select count(*) from public.visit_photos)<>1 then raise exception 'Photo association missing';end if;
 if exists(select 1 from public.visits where snapshot::text like '%SECRET%' or snapshot::text like '%nobody@example%') then raise exception 'Private note/contact leaked into report';end if;
 if (select status from public.route_stops limit 1)<>'completed' then raise exception 'Stop not completed atomically';end if;
 if public.can_upload_visit_photo('92000000-0000-4000-8000-000000000001/96000000-0000-4000-8000-000000000001/97000000-0000-4000-8000-000000000002.jpg') then raise exception 'Completed photo replacement';end if;
 begin update public.visits set snapshot='{}';raise exception 'History edit';exception when insufficient_privilege then null;end;
 begin update public.email_delivery_logs set status='sent',sent_at=now(),provider_id='forged';raise exception 'Fake sent email';exception when insufficient_privilege then null;end;
end $$;
-- SQL owner cannot silently rewrite completed service facts either.
reset role;
do $$ begin
 begin update public.visits set snapshot='{}' where id='98000000-0000-4000-8000-000000000001';raise exception 'Privileged history rewrite';exception when insufficient_privilege then null;end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
insert into public.recurring_schedules(organization_id,property_id,technician_id,days_of_week,start_on)
 values('92000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002',array[0,1,2,3,4,5,6],current_date);
do $$ declare next_stop uuid; begin
 if (select count(*) from public.profiles)<>3 then raise exception 'Manager technician selector';end if;
 if public.generate_route(current_date+1)<>1 then raise exception 'Schedule generation';end if;
 if public.generate_route(current_date+1)<>0 then raise exception 'Duplicate schedule generation';end if;
 next_stop:=public.add_route_stop('94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002',current_date+2);
 if next_stop is null then raise exception 'Add stop failed';end if;
 perform public.reorder_route(array[next_stop]);
 perform public.set_stop_status(next_stop,'skipped');
 if (select status from public.route_stops where id=next_stop)<>'skipped' then raise exception 'Skip failed';end if;
end $$;
rollback;
select 'Fast Route persistence, idempotence, permissions, photo and outbox assertions passed' as result;
