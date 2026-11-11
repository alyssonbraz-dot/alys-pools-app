-- Additive Owner-only finance storage. No changes to visit sync, reports or auth contracts.
create table public.finance_config_versions (
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 effective_month date not null check(extract(day from effective_month)=1),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=150000),
 created_at timestamptz not null default clock_timestamp(), created_by uuid not null references public.profiles(id)
);
create table public.finance_period_sources (
 organization_id uuid not null references public.organizations(id), month date not null check(extract(day from month)=1),
 payload jsonb not null check(jsonb_typeof(payload)='object'), history jsonb not null default '[]', created_at timestamptz not null default now(),
 primary key(organization_id,month)
);
create table public.finance_record_versions (
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 month date not null check(extract(day from month)=1),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=250000),
 created_at timestamptz not null default clock_timestamp(), created_by uuid not null references public.profiles(id)
);
create table public.finance_closed_periods (
 organization_id uuid not null references public.organizations(id), month date not null,
 payload jsonb not null check(jsonb_typeof(payload)='object'), created_at timestamptz not null default now(),
 primary key(organization_id,month), foreign key(organization_id,month) references public.finance_period_sources(organization_id,month)
);
create index on public.finance_config_versions(organization_id,effective_month desc,created_at desc,id);
create index on public.finance_record_versions(organization_id,month,created_at desc,id);
do $$ declare t text;begin
 foreach t in array array['finance_config_versions','finance_period_sources','finance_record_versions','finance_closed_periods'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy finance_owner_read on public.%I for select to authenticated using(public.is_owner(organization_id))',t);
 end loop;
end $$;
-- All writes pass through a service-only RPC called after server-side Owner validation.
-- A per-organization transaction lock serializes close/config/record races. Expected revisions
-- prevent lost edits, UUID retries are idempotent. No client can forge a closed report.
create function public.write_finance(p_org uuid,p_actor uuid,p_id uuid,p_action text,p_month date,p_payload jsonb,p_expected uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare latest uuid;first_month date;begin
 if not exists(select 1 from public.profiles where id=p_actor and organization_id=p_org and role='owner' and access_state='active') then raise exception 'Owner required' using errcode='42501';end if;
 if extract(day from p_month)<>1 then raise exception 'Invalid month' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||'finance',0));
 if p_action='config' then
  if exists(select 1 from public.finance_config_versions where id=p_id and organization_id=p_org and payload=p_payload and effective_month=p_month) then return;end if;
  select date_trunc('month',now() at time zone timezone)::date into first_month from public.organizations where id=p_org;
  if p_month<first_month or exists(select 1 from public.finance_closed_periods where organization_id=p_org and month>=p_month) then raise exception 'Historical configuration is locked' using errcode='22023';end if;
  select id into latest from public.finance_config_versions where organization_id=p_org order by created_at desc,id desc limit 1;
  if latest is distinct from p_expected then raise exception 'ALYS_FINANCE_CONFLICT' using errcode='40001';end if;
  insert into public.finance_config_versions(id,organization_id,effective_month,payload,created_by) values(p_id,p_org,p_month,p_payload,p_actor);
 elsif p_action='open' then
  if exists(select 1 from public.finance_closed_periods where organization_id=p_org and month=p_month) then raise exception 'Period closed' using errcode='22023';end if;
  insert into public.finance_period_sources(organization_id,month,payload) values(p_org,p_month,p_payload) on conflict(organization_id,month) do update set history=public.finance_period_sources.history||jsonb_build_array(public.finance_period_sources.payload),payload=excluded.payload where public.finance_period_sources.payload is distinct from excluded.payload;
 elsif p_action='records' then
  if exists(select 1 from public.finance_record_versions where id=p_id and organization_id=p_org and payload=p_payload and month=p_month) then return;end if;
  if exists(select 1 from public.finance_closed_periods where organization_id=p_org and month=p_month) then raise exception 'Period closed' using errcode='22023';end if;
  select id into latest from public.finance_record_versions where organization_id=p_org and month=p_month order by created_at desc,id desc limit 1;
  if latest is distinct from p_expected then raise exception 'ALYS_FINANCE_CONFLICT' using errcode='40001';end if;
  insert into public.finance_record_versions(id,organization_id,month,payload,created_by) values(p_id,p_org,p_month,p_payload,p_actor);
 elsif p_action='close' then
  -- Compare the report's version metadata again inside the lock.
  select id into latest from public.finance_record_versions where organization_id=p_org and month=p_month order by created_at desc,id desc limit 1;
  if latest is distinct from p_expected then raise exception 'ALYS_FINANCE_CONFLICT' using errcode='40001';end if;
  select id into latest from public.finance_config_versions where organization_id=p_org and effective_month<=p_month order by effective_month desc,created_at desc,id desc limit 1;
  if latest::text is distinct from (p_payload->>'config_id') then raise exception 'ALYS_FINANCE_CONFLICT' using errcode='40001';end if;
  insert into public.finance_closed_periods(organization_id,month,payload) values(p_org,p_month,p_payload) on conflict do nothing;
 else raise exception 'Invalid action' using errcode='22023';end if;
end $$;
revoke all on function public.write_finance(uuid,uuid,uuid,text,date,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.write_finance(uuid,uuid,uuid,text,date,jsonb,uuid) to service_role;
-- Do not leak financial JSON through the pre-existing manager-readable audit log.
-- Financial snapshots are separate from technician-readable visit snapshots.
create table public.finance_visit_terms (
 visit_id uuid primary key, organization_id uuid not null references public.organizations(id),
 config_id uuid not null references public.finance_config_versions(id), payload jsonb not null,
 created_at timestamptz not null default now(),
 foreign key(organization_id,visit_id) references public.visits(organization_id,id)
);
alter table public.finance_visit_terms enable row level security;
revoke all on public.finance_visit_terms from public,anon,authenticated;
grant select on public.finance_visit_terms to authenticated;
create policy finance_owner_read on public.finance_visit_terms for select to authenticated using(public.is_owner(organization_id));
create function public.capture_finance_visit(p_visit uuid) returns void language plpgsql security definer set search_path='' as $$
declare v public.visits;s public.route_stops;c public.finance_config_versions;term jsonb;customer uuid;matches integer;begin
 select * into v from public.visits where id=p_visit;if not found then return;end if;
 select * into s from public.route_stops where id=v.route_stop_id;
 -- Within the applicable effective month, use the terms known at completion.
 -- When finance was configured later, the first version establishes the baseline.
 select customer_id into customer from public.properties where id=s.property_id;
 for c in select * from public.finance_config_versions where organization_id=v.organization_id and effective_month<=s.service_date
 order by effective_month desc,(created_at<=v.completed_at) desc,
 case when created_at<=v.completed_at then created_at end desc,created_at,id loop
 select count(*) into matches from jsonb_array_elements(coalesce(c.payload->'terms','[]')) t where t->>'scope'='contract' and exists(select 1 from public.contracts con where con.customer_id=customer and con.status='active' and con.id::text=t->>'target');
 select t into term from jsonb_array_elements(coalesce(c.payload->'terms','[]')) t
 where (t->>'scope'='contract' and exists(select 1 from public.contracts con where con.customer_id=customer and con.status='active' and con.id::text=t->>'target')) or (t->>'scope'='technician' and t->>'target'=v.technician_id::text) or t->>'scope'='default'
 order by case t->>'scope' when 'contract' then 0 when 'technician' then 1 else 2 end limit 1;
 if term is null then continue;end if;
 if matches<=1 and ((s.schedule_id is null and term->>'extra_visit_cents' is null) or (s.schedule_id is not null and term->>'rate_cents' is null)) then continue;end if;
 if matches>1 then term:=term||'{"rate_cents":null,"extra_visit_cents":null,"additional_service_cents":null}'::jsonb;end if;
 insert into public.finance_visit_terms(visit_id,organization_id,config_id,payload) values(v.id,v.organization_id,c.id,term) on conflict do nothing;return;
 end loop;
end $$;
revoke all on function public.capture_finance_visit(uuid) from public,anon,authenticated;
create function public.snapshot_finance_visit_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.capture_finance_visit(new.id);return new;end $$;
revoke all on function public.snapshot_finance_visit_trigger() from public,anon,authenticated;
create trigger finance_terms_snapshot after insert on public.visits for each row execute function public.snapshot_finance_visit_trigger();
create function public.baseline_finance_terms_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.capture_finance_visit(v.id) from public.visits v join public.route_stops s on s.id=v.route_stop_id where v.organization_id=new.organization_id and s.service_date>=new.effective_month and s.service_date<(new.effective_month+interval '1 month')::date and not exists(select 1 from public.finance_visit_terms t where t.visit_id=v.id);return new;end $$;
revoke all on function public.baseline_finance_terms_trigger() from public,anon,authenticated;
create trigger finance_baseline after insert on public.finance_config_versions for each row execute function public.baseline_finance_terms_trigger();
