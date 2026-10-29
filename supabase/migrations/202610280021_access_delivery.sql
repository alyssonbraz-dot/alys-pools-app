-- V2.1 expand-only schema. Existing memberships, visits and mail receipts remain intact.
alter table public.team_invitations add column invited_role text not null default 'technician' check(invited_role in ('technician','owner')),
 add column language text not null default 'en' check(language in ('en','pt','es'));
grant select(invited_role,language) on public.team_invitations to authenticated;
create function public.protect_last_owner() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.role='owner' and old.access_state='active' then
 if tg_op='DELETE' or (new.role,new.access_state,new.organization_id) is distinct from (old.role,old.access_state,old.organization_id) then
 perform pg_advisory_xact_lock(hashtextextended(old.organization_id::text||':owners',0));
 if not exists(select 1 from public.profiles where organization_id=old.organization_id and id<>old.id and role='owner' and access_state='active') then raise exception 'The last active Owner must be preserved' using errcode='22023';end if;
 end if;end if;return coalesce(new,old);
end $$;
revoke all on function public.protect_last_owner() from public;
create trigger last_owner before update or delete on public.profiles for each row execute function public.protect_last_owner();
create function public.set_team_access(p_id uuid,p_state text) returns void language plpgsql security definer set search_path='' as $$
declare target public.profiles;begin
 select * into target from public.profiles where id=p_id;
 if not found or not public.is_owner(target.organization_id) or target.role not in ('owner','technician') then raise exception 'Owner required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(target.organization_id::text||':owners',0));
 if not public.is_owner(target.organization_id) then raise exception 'Owner required' using errcode='42501';end if;
 select * into target from public.profiles where id=p_id for update;
 if p_state not in ('active','inactive','suspended') or (target.access_state='invited' and p_state='active') then raise exception 'Accept the invitation before activation' using errcode='22023';end if;
 update public.profiles set access_state=p_state where id=p_id;
 if target.role='owner' and p_state<>'active' then update public.team_invitations set state='revoked' where requested_by=p_id and state in ('prepared','sent','failed');end if;
end $$;
create function public.edit_team_member(p_id uuid,p_name text,p_phone text,p_notes text) returns void language plpgsql security definer set search_path='' as $$
declare org uuid;begin
 select organization_id into org from public.profiles where id=p_id and role in ('owner','technician');
 if org is null or not public.is_owner(org) then raise exception 'Owner required' using errcode='42501';end if;
 if length(trim(p_name)) not between 2 and 100 then raise exception 'Invalid name' using errcode='22023';end if;
 update public.profiles set display_name=trim(p_name) where id=p_id;
 insert into public.team_member_details(id,organization_id,phone,notes) values(p_id,org,p_phone,p_notes) on conflict(id) do update set phone=excluded.phone,notes=excluded.notes;
end $$;
create or replace function public.team_contacts() returns table(id uuid,email text) language plpgsql stable security definer set search_path='' as $$
begin if not exists(select 1 from public.profiles actor where actor.id=auth.uid() and public.is_owner(actor.organization_id)) then raise exception 'Owner required' using errcode='42501';end if;
 return query select p.id,u.email::text from public.profiles p join auth.users u on u.id=p.id where public.is_owner(p.organization_id) and p.role in ('owner','technician');end $$;
create function public.reserve_team_invitation(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid;prior public.team_invitations;new_id uuid:=(p_payload->>'id')::uuid;desired text:=coalesce(p_payload->>'role','technician');begin
 select organization_id into org from public.profiles where id=auth.uid() and role='owner' and access_state='active';
 if org is null then raise exception 'Owner required' using errcode='42501';end if;
 if new_id is null or desired not in ('owner','technician') or (desired='owner' and coalesce((p_payload->>'confirm_owner')::boolean,false) is not true) then raise exception 'Explicit Owner invitation confirmation required' using errcode='22023';end if;
 if p_payload->>'email' is null or p_payload->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Valid email required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||':invite:'||lower(p_payload->>'email'),0));
 select * into prior from public.team_invitations where id=new_id;
 if found then
 if prior.organization_id<>org or prior.email<>lower(p_payload->>'email') or prior.invited_role<>desired then raise exception 'Invitation ID conflict' using errcode='42501';end if;return prior.id;
 end if;
 insert into public.team_invitations(id,organization_id,email,display_name,phone,notes,requested_by,invited_role,language)
 values(new_id,org,lower(p_payload->>'email'),trim(concat_ws(' ',p_payload->>'first_name',nullif(p_payload->>'last_name',''))),coalesce(p_payload->>'phone',''),coalesce(p_payload->>'notes',''),auth.uid(),desired,coalesce(p_payload->>'language','en'));
 return new_id;
end $$;
create or replace function public.accept_team_invitation(p_id uuid,p_user uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare i public.team_invitations;begin
 select * into i from public.team_invitations where id=p_id for update;
 if not found or i.user_id is distinct from p_user or i.expires_at<now() or i.state not in ('prepared','sent','failed') then return false;end if;
 update public.profiles set access_state='active' where id=p_user and organization_id=i.organization_id and role=i.invited_role and access_state='invited';
 if not found then return false;end if;
 update public.team_invitations set state='accepted' where id=i.id;return true;
end $$;
revoke all on function public.set_team_access(uuid,text),public.edit_team_member(uuid,text,text,text),public.reserve_team_invitation(jsonb) from public,anon;
grant execute on function public.set_team_access(uuid,text),public.edit_team_member(uuid,text,text,text),public.reserve_team_invitation(jsonb) to authenticated;
-- Existing accept RPC remains service-role only, not callable by either browser role.

alter table public.customers add column email_delivery_state text not null default 'unknown' check(email_delivery_state in ('unknown','bounced','complained'));
create function public.reset_contact_health() returns trigger language plpgsql set search_path='' as $$
begin if new.email is distinct from old.email then new.email_delivery_state='unknown';end if;return new;end $$;
revoke all on function public.reset_contact_health() from public;
create trigger contact_health before update of email on public.customers for each row execute function public.reset_contact_health();
alter table public.email_delivery_logs add column delivered_at timestamptz,add column delivery_outcome text check(delivery_outcome in ('delivered','bounced','complained','failed'));
create table public.report_provider_events(id text primary key,provider_id text not null,event_type text not null check(event_type in ('email.delivered','email.bounced','email.complained','email.failed')),occurred_at timestamptz not null,received_at timestamptz not null default now());
alter table public.report_provider_events enable row level security;
revoke all on public.report_provider_events from public,anon,authenticated;
grant select on public.report_provider_events to service_role;
create function public.reconcile_report_receipt(p_provider text) returns void language plpgsql security definer set search_path='' as $$
declare e public.report_provider_events;job public.email_delivery_logs;begin
 select * into job from public.email_delivery_logs where provider_id=p_provider for update;if not found then return;end if;
 select * into e from public.report_provider_events where provider_id=p_provider order by case when event_type in ('email.bounced','email.complained','email.failed') then 0 else 1 end,occurred_at desc limit 1;
 if not found then return;end if;
 update public.email_delivery_logs set delivered_at=case when e.event_type='email.delivered' then e.occurred_at else delivered_at end,delivery_outcome=substring(e.event_type from 7) where id=job.id;
 if e.event_type in ('email.bounced','email.complained') then update public.customers set email_delivery_state=substring(e.event_type from 7) where id=(select customer_id from public.visits where id=job.visit_id) and email=job.recipient;end if;
end $$;
create function public.record_report_event(p_id text,p_provider text,p_type text,p_occurred timestamptz) returns void language plpgsql security definer set search_path='' as $$
begin
 if length(p_id) not between 1 and 200 or length(p_provider) not between 1 and 200 or not isfinite(p_occurred) then raise exception 'Invalid provider event' using errcode='22023';end if;
 insert into public.report_provider_events values(p_id,p_provider,p_type,p_occurred,now()) on conflict(id) do nothing;
 perform public.reconcile_report_receipt(p_provider);
end $$;
alter function public.finish_email_job(uuid,uuid,boolean,text,text,boolean) rename to finish_email_job_v2;
revoke all on function public.finish_email_job_v2(uuid,uuid,boolean,text,text,boolean) from public,anon,authenticated,service_role;
create function public.finish_email_job(p_id uuid,p_token uuid,p_success boolean,p_provider_id text default null,p_error text default null,p_retryable boolean default false) returns boolean language plpgsql security definer set search_path='' as $$
declare ok boolean;begin ok:=public.finish_email_job_v2(p_id,p_token,p_success,p_provider_id,p_error,p_retryable);if ok and p_success then perform public.reconcile_report_receipt(p_provider_id);end if;return ok;end $$;
revoke all on function public.finish_email_job(uuid,uuid,boolean,text,text,boolean),public.record_report_event(text,text,text,timestamptz),public.reconcile_report_receipt(text) from public,anon,authenticated;
grant execute on function public.finish_email_job(uuid,uuid,boolean,text,text,boolean),public.record_report_event(text,text,text,timestamptz) to service_role;
create table public.worker_observations(key text primary key,started_at timestamptz not null,finished_at timestamptz,outcome text);
alter table public.worker_observations enable row level security;
revoke all on public.worker_observations from public,anon,authenticated;
grant select,insert,update on public.worker_observations to service_role;
