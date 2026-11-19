-- ADMINISTRATIVE RUNBOOK, NOT A MIGRATION OR PUBLIC RPC.
-- Run only in a separately verified STAGING project's SQL Editor as postgres.
-- Fill EVERY value from inspect-owner-access.sql, after verifying administrator authority.
-- Preview is not proof of a separate database: stop if it points to production.
begin;
select set_config('alys.owner_recovery', $config${
  "confirmation": "UNCONFIRMED",
  "user_id": "00000000-0000-0000-0000-000000000000",
  "email": "replace-owner@example.invalid",
  "organization_id": "00000000-0000-0000-0000-000000000000",
  "organization_name": "REPLACE EXACT EXISTING ORGANIZATION NAME",
  "expected_role": "missing",
  "expected_access_state": "missing",
  "display_name": "REPLACE AUTHORIZED OWNER NAME",
  "reason": "REPLACE WITH APPROVAL / INCIDENT REFERENCE"
}$config$, true);

do $alys_recovery$
declare
 cfg jsonb := nullif(current_setting('alys.owner_recovery', true), '')::jsonb;
 target uuid; org uuid; actual_email text; actual_org_name text;
 prior public.profiles; changed boolean := false;
begin
 if current_user not in ('postgres','supabase_admin') then
  raise exception 'Database administrator required' using errcode='42501';
 end if;
 if cfg is null or cfg->>'confirmation' is distinct from 'I_VERIFIED_SEPARATE_STAGING_AND_ADMIN_AUTHORITY' then
  raise exception 'Confirm a separate staging project and authorized administrator first' using errcode='22023';
 end if;
 if coalesce(cfg->>'email','') not like '%@%' or coalesce(cfg->>'email','') like '%@example.invalid'
  or coalesce(length(trim(cfg->>'organization_name')),0) not between 2 and 100
  or coalesce(length(trim(cfg->>'display_name')),0) not between 2 and 100
  or coalesce(length(trim(cfg->>'reason')),0) not between 8 and 500
  or coalesce(cfg->>'expected_role','') not in ('missing','owner')
  or coalesce(cfg->>'expected_access_state','') not in ('missing','active','inactive','suspended')
  or ((cfg->>'expected_role'='missing') is distinct from (cfg->>'expected_access_state'='missing')) then
  raise exception 'Supply exact inspected identity, expected state and approval reason' using errcode='22023';
 end if;
 target := (cfg->>'user_id')::uuid; org := (cfg->>'organization_id')::uuid;
 if target is null or org is null or target='00000000-0000-0000-0000-000000000000'::uuid
  or org='00000000-0000-0000-0000-000000000000'::uuid then
  raise exception 'Existing Auth and organization UUIDs required' using errcode='22023';
 end if;
 -- Same per-user lock as bootstrap_owner; lock before any identity rows.
 perform pg_advisory_xact_lock(hashtextextended(target::text||':bootstrap',0));
 select email into actual_email from auth.users where id=target for update;
 if not found or lower(actual_email) is distinct from lower(trim(cfg->>'email')) then
  raise exception 'Auth UUID and email do not match; no user will be created' using errcode='42501';
 end if;
 select name into actual_org_name from public.organizations where id=org for update;
 if not found or actual_org_name is distinct from cfg->>'organization_name' then
  raise exception 'Organization UUID and name do not match; no organization will be created' using errcode='42501';
 end if;
 select * into prior from public.profiles where id=target for update;
 if found then
  if prior.organization_id<>org or prior.role<>'owner' then
   raise exception 'Existing membership cannot be reassigned or promoted' using errcode='42501';
  end if;
  -- A successful repeated recovery is a no-op, including its audit entry.
  if prior.access_state='active' then return; end if;
  if cfg->>'expected_role'<>'owner' or prior.access_state is distinct from cfg->>'expected_access_state'
    or prior.access_state not in ('inactive','suspended') then
   raise exception 'Owner state changed or invitation must be accepted; inspect again' using errcode='42501';
  end if;
 elsif cfg->>'expected_role'<>'missing' then
  raise exception 'Expected Owner profile is missing; inspect again' using errcode='42501';
 end if;
 if exists(select 1 from public.team_invitations where
   (user_id=target or lower(email)=lower(actual_email)) and state in ('prepared','sent','failed')) then
  raise exception 'Outstanding invitation must be resolved through its existing flow' using errcode='42501';
 end if;
 if prior.id is null then
  insert into public.profiles(id,organization_id,role,access_state,display_name)
   values(target,org,'owner','active',trim(cfg->>'display_name'));
  changed := true;
 else
  update public.profiles set access_state='active' where id=target;
  changed := true;
 end if;
 if changed then
  insert into public.audit_log(organization_id,actor_id,entity,record_id,operation,old_data,new_data)
   values(org,null,'staging_owner_recovery',target,'RECOVER',to_jsonb(prior),
    jsonb_build_object('role','owner','access_state','active','reason',trim(cfg->>'reason'),'executor',current_user));
 end if;
end
$alys_recovery$;

select p.id,p.organization_id,p.role,p.access_state,o.name
from public.profiles p join public.organizations o on o.id=p.organization_id
where p.id=(current_setting('alys.owner_recovery')::jsonb->>'user_id')::uuid;
-- DRY RUN by default. After verifying staging, identity and result, use COMMIT instead.
rollback;
