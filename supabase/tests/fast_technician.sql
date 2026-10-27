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
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
do $$ declare payload jsonb;result jsonb;begin
 payload:='{"id":"98000000-0000-4000-8000-000000000001","stop_id":"96000000-0000-4000-8000-000000000001","notes":"Public service note","issue_flags":["green_pool","equipment_issue"],"photo_paths":[],"pools":[{"pool_id":"95000000-0000-4000-8000-000000000001","tasks":["Test Water"],"readings":{"fc":3,"ph":7.4},"dosages":[{"product":"Liquid Chlorine","quantity":0.5,"unit":"gal"}]},{"pool_id":"95000000-0000-4000-8000-000000000002","tasks":[],"readings":{"fc":1,"ph":7.2},"dosages":[]}]}';
 begin perform public.complete_visit_base(payload);raise exception 'Legacy completion bypass accessible';exception when insufficient_privilege then null;end;
 begin perform public.complete_visit(payload);raise exception 'Required photo waived by issue flag';exception when invalid_parameter_value then null;end;
 if exists(select 1 from public.visits) or exists(select 1 from public.visit_issue_flags) then raise exception 'Partial issue visit accepted';end if;
 payload:=jsonb_set(payload,'{photo_paths}','["92000000-0000-4000-8000-000000000001/96000000-0000-4000-8000-000000000001/97000000-0000-4000-8000-000000000001.jpg"]');
 begin perform public.complete_visit(payload||'{"issue_flags":["invented"]}');raise exception 'Unknown flag accepted';exception when invalid_parameter_value then null;end;
 begin perform public.complete_visit(payload||'{"issue_flags":["green_pool","green_pool"]}');raise exception 'Duplicate flag accepted';exception when invalid_parameter_value then null;end;
 result:=public.complete_visit(payload);
 if (result->>'already_completed')::boolean then raise exception 'First visit not completed';end if;
 result:=public.complete_visit(payload||'{"issue_flags":["low_water"]}');
 if not (result->>'already_completed')::boolean then raise exception 'Retry not idempotent';end if;
 perform public.complete_visit(payload-'issue_flags');
 if (select count(*) from public.visits)<>1 or (select count(*) from public.chemical_readings)<>2 or (select count(*) from public.chemical_dosages)<>1 or (select count(*) from public.email_delivery_logs)<>1 or (select count(*) from public.visit_issue_flags)<>1 then raise exception 'Retry duplicated service records';end if;
 if not exists(select 1 from public.visit_issue_flags where flags=array['green_pool','equipment_issue']) then raise exception 'Original flags changed on retry';end if;
 begin insert into public.visit_issue_flags(organization_id,visit_id,flags) values('92000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000001',array['other']);raise exception 'Direct flag write allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.visit_issue_flags) then raise exception 'Unassigned technician leaked issues';end if;
 begin perform public.complete_visit('{"id":"98000000-0000-4000-8000-000000000002","stop_id":"96000000-0000-4000-8000-000000000001","issue_flags":[]}');raise exception 'Unassigned completion allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000004',true);
do $$ begin if exists(select 1 from public.visit_issue_flags) then raise exception 'Cross-tenant issue leak';end if;end $$;
reset role;
do $$ begin begin update public.visit_issue_flags set flags=array['other'];raise exception 'Issue history mutable';exception when insufficient_privilege then null;end;end $$;
rollback;
select 'Fast technician: required photos, assigned roles, immutable flags and idempotent visits/chemicals/reports passed' as result;
