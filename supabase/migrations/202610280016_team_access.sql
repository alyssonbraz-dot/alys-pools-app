-- Default keeps every existing account operational. No role is changed.
alter table public.profiles add column access_state text not null default 'active' check(access_state in ('invited','active','suspended','inactive'));
create function public.is_active_operator() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and access_state='active' and role in ('owner','admin','technician'));
$$;
create function public.is_owner(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and organization_id=org and role='owner' and access_state='active');
$$;
create or replace function public.is_manager(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and organization_id=org and role in ('owner','admin') and access_state='active');
$$;
revoke all on function public.is_active_operator(),public.is_owner(uuid) from public,anon;
grant execute on function public.is_active_operator(),public.is_owner(uuid) to authenticated,service_role;
-- Preserve existing predicates but require current membership even with a valid old JWT.
alter function public.can_access_stop(uuid) rename to can_access_stop_assigned;
alter function public.can_access_property(uuid) rename to can_access_property_assigned;
revoke all on function public.can_access_stop_assigned(uuid),public.can_access_property_assigned(uuid) from public,anon,authenticated;
create function public.can_access_stop(stop_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.is_active_operator() and public.can_access_stop_assigned(stop_id); $$;
create function public.can_access_property(property uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.is_active_operator() and public.can_access_property_assigned(property); $$;
revoke all on function public.can_access_stop(uuid),public.can_access_property(uuid) from public,anon;
grant execute on function public.can_access_stop(uuid),public.can_access_property(uuid) to authenticated;
-- PostgreSQL policies retain function OIDs after rename: explicitly recreate predicates
-- in dependent policies/routines rather than assuming the name changes their target.
drop policy stops_read on public.route_stops;
create policy stops_read on public.route_stops for select to authenticated using(public.can_access_stop(id));
drop policy assigned_customer on public.customers;
create policy assigned_customer on public.customers for select to authenticated using(exists(select 1 from public.properties p where p.customer_id=customers.id and public.can_access_property(p.id)));
drop policy assigned_property on public.properties;
create policy assigned_property on public.properties for select to authenticated using(public.can_access_property(id));
drop policy assigned_pool on public.pools;
create policy assigned_pool on public.pools for select to authenticated using(public.can_access_property(property_id));
create function public.guard_active_write() returns trigger language plpgsql security definer set search_path='' as $$
begin if auth.uid() is not null and not public.is_active_operator() then raise exception 'Active membership required' using errcode='42501';end if;return coalesce(new,old);end $$;
revoke all on function public.guard_active_write() from public;
do $$ declare t text;begin
 foreach t in array array['customers','properties','pools','contracts','customer_details','customer_tags','recurring_schedules','route_stops','visits','visit_checklist_items','chemical_readings','chemical_dosages','visit_photos','visit_corrections','route_plans','photo_upload_budget','customer_onboarding_requests'] loop
 execute format('create policy active_membership on public.%I as restrictive for all to authenticated using(public.is_active_operator()) with check(public.is_active_operator())',t);
 execute format('create trigger active_actor before insert or update or delete on public.%I for each row execute function public.guard_active_write()',t);
 end loop;
end $$;
-- Private invitation/contact details; raw link payloads are service-role only columns.
create table public.team_invitations(
 id uuid primary key,organization_id uuid not null references public.organizations(id),email text not null check(length(email)<=254),
 display_name text not null check(length(display_name) between 2 and 100),phone text not null default '' check(length(phone)<=30),
 notes text not null default '' check(length(notes)<=2000),user_id uuid references public.profiles(id),
 state text not null default 'prepared' check(state in ('prepared','sent','failed','revoked','accepted')),
 expires_at timestamptz not null default now()+interval '48 hours',created_at timestamptz not null default now(),
 token_digest text,send_payload jsonb,provider_id text
);
create index team_invite_email on public.team_invitations(organization_id,lower(email));
alter table public.team_invitations enable row level security;
revoke all on public.team_invitations from public,anon,authenticated;
grant select(id,organization_id,email,display_name,phone,notes,user_id,state,expires_at,created_at) on public.team_invitations to authenticated;
grant all on public.team_invitations to service_role;
create policy owner_team_invites on public.team_invitations for select to authenticated using(public.is_owner(organization_id));
create trigger team_invite_audit after insert or update on public.team_invitations for each row execute function public.audit_change();
create table public.technician_property_assignments(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,technician_id uuid not null,property_id uuid not null,
 active boolean not null default true,unique(technician_id,property_id),
 foreign key(organization_id,technician_id) references public.profiles(organization_id,id),
 foreign key(organization_id,property_id) references public.properties(organization_id,id)
);
alter table public.technician_property_assignments enable row level security;
revoke all on public.technician_property_assignments from public,anon,authenticated;
grant select on public.technician_property_assignments to authenticated;
create policy owner_assignments on public.technician_property_assignments for select to authenticated using(public.is_owner(organization_id));
create trigger assignment_audit after insert or update on public.technician_property_assignments for each row execute function public.audit_change();
create function public.set_technician_access(p_id uuid,p_state text,p_name text default null) returns void language plpgsql security definer set search_path='' as $$
declare target public.profiles;begin
 select * into target from public.profiles where id=p_id for update;
 if not found or target.role<>'technician' or not public.is_owner(target.organization_id) then raise exception 'Owner required' using errcode='42501';end if;
 if p_state not in ('active','suspended','inactive') or (target.access_state='invited' and p_state='active') then raise exception 'Invitation must be accepted first' using errcode='22023';end if;
 update public.profiles set access_state=p_state,display_name=coalesce(nullif(trim(p_name),''),display_name) where id=p_id;
end $$;
create function public.assign_technician_properties(p_id uuid,p_properties uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare target public.profiles;pr uuid;sid uuid;begin
 select * into target from public.profiles where id=p_id;
 if not found or target.role<>'technician' or not public.is_owner(target.organization_id) then raise exception 'Owner required' using errcode='42501';end if;
 if cardinality(p_properties)>200 or array_position(p_properties,null) is not null then raise exception 'Invalid selection' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(target.organization_id::text||':schedule',0));
 foreach pr in array p_properties loop
 if not exists(select 1 from public.properties where id=pr and organization_id=target.organization_id) then raise exception 'Property access denied' using errcode='42501';end if;
 if (select count(*) from public.recurring_schedules where property_id=pr and active)>1 then raise exception 'Multiple schedules: assign the specific service in the customer profile' using errcode='22023';end if;
 end loop;
 update public.recurring_schedules set active=false where technician_id=p_id and active and not(property_id=any(p_properties));
 update public.technician_property_assignments set active=false where technician_id=p_id;
 foreach pr in array p_properties loop
 insert into public.technician_property_assignments(organization_id,technician_id,property_id) values(target.organization_id,p_id,pr) on conflict(technician_id,property_id) do update set active=true;
 update public.recurring_schedules set technician_id=p_id where property_id=pr and active;
 for sid in select id from public.recurring_schedules where property_id=pr and active loop perform public.generate_schedule_window(sid);end loop;
 end loop;
end $$;
revoke all on function public.set_technician_access(uuid,text,text),public.assign_technician_properties(uuid,uuid[]) from public,anon;
grant execute on function public.set_technician_access(uuid,text,text),public.assign_technician_properties(uuid,uuid[]) to authenticated;
create trigger profile_audit after insert or update on public.profiles for each row execute function public.audit_change();
create function public.accept_team_invitation(p_id uuid,p_user uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare i public.team_invitations;begin
 select * into i from public.team_invitations where id=p_id for update;
 if not found or i.user_id is distinct from p_user or i.expires_at<now() or i.state not in ('prepared','sent','failed') then return false;end if;
 update public.profiles set access_state='active' where id=p_user and organization_id=i.organization_id and role='technician' and access_state='invited';
 if not found then return false;end if;
 update public.team_invitations set state='accepted' where id=i.id;return true;
end $$;
revoke all on function public.accept_team_invitation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.accept_team_invitation(uuid,uuid) to service_role;
alter table public.team_invitations add column locked_until timestamptz,add column claim_token uuid;
create function public.claim_team_delivery(p_id uuid,p_org uuid) returns setof public.team_invitations language sql security definer set search_path='' as $$
 update public.team_invitations set locked_until=now()+interval '2 minutes',claim_token=gen_random_uuid()
 where id=p_id and organization_id=p_org and state in ('prepared','sent','failed') and expires_at>now() and (locked_until is null or locked_until<now()) returning *;
$$;
revoke all on function public.claim_team_delivery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_team_delivery(uuid,uuid) to service_role;
alter function public.generate_route(date) rename to generate_route_active_base;
revoke all on function public.generate_route_active_base(date) from public,anon,authenticated;
create function public.generate_route(p_date date) returns integer language plpgsql security definer set search_path='' as $$
begin if not public.is_active_operator() then raise exception 'Active membership required' using errcode='42501';end if;return public.generate_route_active_base(p_date);end $$;
revoke all on function public.generate_route(date) from public,anon;
grant execute on function public.generate_route(date) to authenticated;
-- One outstanding invitation per company/email, including expired invitations
-- awaiting explicit revoke. Concurrency cannot generate competing invitations.
create unique index one_team_invitation on public.team_invitations(organization_id,lower(email)) where state in ('prepared','sent','failed');
create function public.team_identity(p_email text) returns table(id uuid,organization_id uuid,role text,access_state text) language sql stable security definer set search_path='' as $$
 select p.id,p.organization_id,p.role,p.access_state from public.profiles p join auth.users u on u.id=p.id where lower(u.email)=lower(p_email);
$$;
revoke all on function public.team_identity(text) from public,anon,authenticated;
grant execute on function public.team_identity(text) to service_role;
