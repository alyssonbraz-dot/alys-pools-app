begin;
insert into auth.users values('a0000016-0000-4000-8000-000000000001'),('a0000016-0000-4000-8000-000000000002'),('a0000016-0000-4000-8000-000000000003');
insert into public.organizations(id,name) values('b0000016-0000-4000-8000-000000000001','Team V2'),('b0000016-0000-4000-8000-000000000002','Other team');
insert into public.profiles(id,organization_id,role,display_name) values('a0000016-0000-4000-8000-000000000001','b0000016-0000-4000-8000-000000000001','owner','Owner'),('a0000016-0000-4000-8000-000000000002','b0000016-0000-4000-8000-000000000001','technician','Tech'),('a0000016-0000-4000-8000-000000000003','b0000016-0000-4000-8000-000000000002','owner','Other Owner');
insert into public.customers(id,organization_id,name) values('c0000016-0000-4000-8000-000000000001','b0000016-0000-4000-8000-000000000001','Team customer');
insert into public.properties(id,organization_id,customer_id,address) values('d0000016-0000-4000-8000-000000000001','b0000016-0000-4000-8000-000000000001','c0000016-0000-4000-8000-000000000001','Fictional team address');
insert into public.route_stops(id,organization_id,property_id,technician_id,service_date) values('e0000016-0000-4000-8000-000000000001','b0000016-0000-4000-8000-000000000001','d0000016-0000-4000-8000-000000000001','a0000016-0000-4000-8000-000000000002',(now() at time zone 'America/New_York')::date);
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000016-0000-4000-8000-000000000001',true);
select public.set_technician_access('a0000016-0000-4000-8000-000000000002','suspended');
select set_config('request.jwt.claim.sub','a0000016-0000-4000-8000-000000000002',true);
do $$ begin
 if public.can_read_visit_photo('b0000016-0000-4000-8000-000000000001/e0000016-0000-4000-8000-000000000001/f0000016-0000-4000-8000-000000000001.jpg') or public.can_access_stop('e0000016-0000-4000-8000-000000000001') or exists(select 1 from public.route_stops) or exists(select 1 from public.properties) or exists(select 1 from public.customers) then raise exception 'Suspended technician retained access';end if;
 begin perform public.generate_route(current_date);raise exception 'Suspended generator allowed';exception when insufficient_privilege then null;end;
 begin perform public.accept_team_invitation('f0000016-0000-4000-8000-000000000001','a0000016-0000-4000-8000-000000000002');raise exception 'Browser accepted invitation directly';exception when insufficient_privilege then null;end;
 begin perform public.owner_overview();raise exception 'Technician dashboard leak';exception when insufficient_privilege then null;end;
 begin perform public.set_technician_access('a0000016-0000-4000-8000-000000000002','active');raise exception 'Self-reactivation allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a0000016-0000-4000-8000-000000000003',true);
do $$ begin
 begin perform public.set_technician_access('a0000016-0000-4000-8000-000000000002','active');raise exception 'Foreign owner changed technician';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a0000016-0000-4000-8000-000000000001',true);
select public.set_technician_access('a0000016-0000-4000-8000-000000000002','active');
select set_config('request.jwt.claim.sub','a0000016-0000-4000-8000-000000000002',true);
do $$ begin if not public.can_access_stop('e0000016-0000-4000-8000-000000000001') then raise exception 'Reactivation failed';end if;end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.profiles set access_state='invited' where id='a0000016-0000-4000-8000-000000000002';
insert into public.team_invitations(id,organization_id,email,display_name,user_id,state,expires_at) values('f0000016-0000-4000-8000-000000000001','b0000016-0000-4000-8000-000000000001','tech@example.test','Tech','a0000016-0000-4000-8000-000000000002','sent',now()-interval '1 minute');
do $$ begin if exists(select 1 from public.audit_log where entity='team_invitations' and (new_data ? 'send_payload' or new_data ? 'token_digest')) then raise exception 'Invitation secret in audit';end if;end $$;
set local role service_role;
do $$ begin
 if public.accept_team_invitation('f0000016-0000-4000-8000-000000000001','a0000016-0000-4000-8000-000000000002') then raise exception 'Expired invitation accepted';end if;
end $$;
reset role;
update public.team_invitations set expires_at=now()+interval '1 hour';
set local role service_role;
do $$ begin
 if not public.accept_team_invitation('f0000016-0000-4000-8000-000000000001','a0000016-0000-4000-8000-000000000002') then raise exception 'Valid invitation refused';end if;
 if public.accept_team_invitation('f0000016-0000-4000-8000-000000000001','a0000016-0000-4000-8000-000000000002') then raise exception 'Invitation reused';end if;
end $$;
rollback;
select 'Team suspension, owner-only actions, tenant boundaries and single-use/expired invitation checks passed' as result;
