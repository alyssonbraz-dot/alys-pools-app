-- New timezone-aware scheduling code affects future edits only. No backfill/reset.
create or replace function public.reconcile_schedule(p_schedule uuid) returns void language plpgsql security definer set search_path='' as $$
declare sc public.recurring_schedules;s public.route_stops;enabled boolean;today date;begin
 select * into sc from public.recurring_schedules where id=p_schedule;if not found then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(sc.organization_id::text||':schedule',0));
 select (now() at time zone p.service_timezone)::date,c.status='active' and c.archived_at is null into today,enabled from public.properties p join public.customers c on c.id=p.customer_id where p.id=sc.property_id;
 for s in select * from public.route_stops where schedule_id=sc.id and service_date>=today and (status='pending' or cancellation_reason in ('schedule_changed','customer_inactive')) for update loop
 if sc.active and enabled and sc.start_on<=s.service_date and (sc.end_on is null or sc.end_on>=s.service_date) and extract(dow from s.service_date)::integer=any(sc.days_of_week) then
 if exists(select 1 from public.route_stops x where x.id<>s.id and x.property_id=sc.property_id and x.technician_id=sc.technician_id and x.service_date=s.service_date) then update public.route_stops set status='skipped',cancellation_reason='schedule_conflict',updated_at=now() where id=s.id;
 else update public.route_stops set technician_id=sc.technician_id,property_id=sc.property_id,status='pending',cancellation_reason=null,updated_at=now() where id=s.id;end if;
 else update public.route_stops set status='skipped',cancellation_reason='schedule_changed',updated_at=now() where id=s.id;end if;
 end loop;
end $$;
create or replace function public.schedule_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare today date;begin
 select (now() at time zone service_timezone)::date into today from public.properties where id=new.property_id;
 if tg_op='UPDATE' and (new.property_id,new.technician_id,new.days_of_week,new.start_on,new.end_on,new.active) is distinct from (old.property_id,old.technician_id,old.days_of_week,old.start_on,old.end_on,old.active) and exists(select 1 from public.route_stops where schedule_id=new.id and status='in_progress' and service_date>=today) then raise exception 'Finish or skip the in-progress stop before changing its schedule' using errcode='22023';end if;
 perform public.reconcile_schedule(new.id);return new;
end $$;
create function public.guard_customer_pause() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.status,new.archived_at) is distinct from (old.status,old.archived_at) and (new.status<>'active' or new.archived_at is not null) and exists(select 1 from public.route_stops s join public.properties p on p.id=s.property_id where p.customer_id=new.id and s.status='in_progress' and s.service_date>=(now() at time zone p.service_timezone)::date) then raise exception 'Finish or explicitly skip in-progress service before pausing the customer' using errcode='22023';end if;return new;
end $$;
revoke all on function public.guard_customer_pause() from public;
create trigger guard_pause before update on public.customers for each row execute function public.guard_customer_pause();
create table public.team_member_details(
 id uuid primary key,organization_id uuid not null,phone text not null default '' check(length(phone)<=30),notes text not null default '' check(length(notes)<=2000),
 foreign key(organization_id,id) references public.profiles(organization_id,id)
);
alter table public.team_member_details enable row level security;
revoke all on public.team_member_details from public,anon,authenticated;
grant select on public.team_member_details to authenticated;
create policy owner_member_details on public.team_member_details for select to authenticated using(public.is_owner(organization_id));
create trigger member_details_audit after insert or update on public.team_member_details for each row execute function public.audit_change();
create function public.edit_technician(p_id uuid,p_name text,p_phone text,p_notes text) returns void language plpgsql security definer set search_path='' as $$
declare target public.profiles;begin
 select * into target from public.profiles where id=p_id;
 if not found or target.role<>'technician' or not public.is_owner(target.organization_id) then raise exception 'Owner required' using errcode='42501';end if;
 if length(trim(p_name)) not between 2 and 100 then raise exception 'Invalid name' using errcode='22023';end if;
 update public.profiles set display_name=trim(p_name) where id=p_id;
 insert into public.team_member_details(id,organization_id,phone,notes) values(p_id,target.organization_id,p_phone,p_notes) on conflict(id) do update set phone=excluded.phone,notes=excluded.notes;
end $$;
create function public.team_contacts() returns table(id uuid,email text) language plpgsql stable security definer set search_path='' as $$
begin if not exists(select 1 from public.profiles where id=auth.uid() and public.is_owner(organization_id)) then raise exception 'Owner required' using errcode='42501';end if;
 return query select p.id,u.email::text from public.profiles p join auth.users u on u.id=p.id where public.is_owner(p.organization_id) and p.role='technician';end $$;
revoke all on function public.edit_technician(uuid,text,text,text),public.team_contacts() from public,anon;
grant execute on function public.edit_technician(uuid,text,text,text),public.team_contacts() to authenticated;
create function public.route_chemistry_history_v2(p_property_ids uuid[],p_from date,p_through date)
returns table(visit_id uuid,pool_id uuid,completed_at timestamptz,readings jsonb,dosages jsonb,technician_name text)
language sql stable security definer set search_path='' as $$
 select h.visit_id,h.pool_id,h.completed_at,h.readings,h.dosages,coalesce(v.snapshot->>'technician_name',p.display_name)
 from public.route_chemistry_history(p_property_ids,p_from,p_through) h join public.visits v on v.id=h.visit_id join public.profiles p on p.id=v.technician_id;
$$;
revoke all on function public.route_chemistry_history_v2(uuid[],date,date) from public,anon;
grant execute on function public.route_chemistry_history_v2(uuid[],date,date) to authenticated;
create function public.stamp_visit_technician() returns trigger language plpgsql security definer set search_path='' as $$
begin new.snapshot:=new.snapshot||jsonb_build_object('technician_name',(select display_name from public.profiles where id=new.technician_id));return new;end $$;
revoke all on function public.stamp_visit_technician() from public;
create trigger stamp_technician before insert on public.visits for each row execute function public.stamp_visit_technician();
create function public.reassign_route_stop(p_stop uuid,p_technician uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.route_stops;begin
 select * into s from public.route_stops where id=p_stop for update;
 if not found or not public.is_owner(s.organization_id) then raise exception 'Owner required' using errcode='42501';end if;
 if s.status not in ('pending','skipped') then raise exception 'Only unstarted stops can be reassigned' using errcode='22023';end if;
 if not exists(select 1 from public.profiles where id=p_technician and organization_id=s.organization_id and role in ('owner','admin','technician') and access_state='active') then raise exception 'Active technician required' using errcode='22023';end if;
 update public.route_stops set technician_id=p_technician,updated_at=now() where id=s.id;
end $$;
revoke all on function public.reassign_route_stop(uuid,uuid) from public,anon;
grant execute on function public.reassign_route_stop(uuid,uuid) to authenticated;
-- Explicitly refresh dependent definer predicates as well as their wrappers, so
-- storage/history authorization cannot retain a pre-suspension helper plan.
create or replace function public.can_access_visit(visit uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_active_operator() and exists(select 1 from public.visits v where v.id=visit and public.can_access_stop(v.route_stop_id));
$$;
create or replace function public.can_read_visit_photo(path text) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_active_operator() and exists(select 1 from public.route_stops s where split_part(path,'/',1)=s.organization_id::text and split_part(path,'/',2)=s.id::text and public.can_access_stop(s.id));
$$;
create or replace function public.can_upload_visit_photo(path text) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_active_operator() and exists(select 1 from public.route_stops s where path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.]jpg$' and split_part(path,'/',1)=s.organization_id::text and split_part(path,'/',2)=s.id::text and s.status in ('pending','in_progress') and public.can_access_stop(s.id));
$$;
-- Invitation links/OTP hashes must never be copied into the general audit log.
alter table public.team_invitations add column requested_by uuid references public.profiles(id);
create function public.audit_team_invitation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_log(organization_id,actor_id,entity,record_id,operation,old_data,new_data)
 values(new.organization_id,coalesce(auth.uid(),case when new.state='accepted' then new.user_id else new.requested_by end),'team_invitations',new.id,tg_op,
 case when tg_op='UPDATE' then jsonb_build_object('state',old.state,'user_id',old.user_id,'expires_at',old.expires_at) end,
 jsonb_build_object('state',new.state,'user_id',new.user_id,'expires_at',new.expires_at));
 return new;
end $$;
revoke all on function public.audit_team_invitation() from public;
drop trigger team_invite_audit on public.team_invitations;
create trigger team_invite_audit after insert or update on public.team_invitations for each row execute function public.audit_team_invitation();
drop policy manager_audit on public.audit_log;
create policy manager_audit on public.audit_log for select to authenticated using(public.is_manager(organization_id) and (entity not in ('team_invitations','team_member_details','technician_property_assignments') or public.is_owner(organization_id)));
