-- Foundation: management access only. No automatic organization or role signup.
create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 100),
 timezone text not null default 'America/New_York' check(timezone='America/New_York'),
 settings jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 organization_id uuid not null references public.organizations(id),
 role text not null check(role in ('owner','admin','technician','customer')),
 display_name text not null, unique(organization_id,id)
);
create table public.customers (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null check(length(trim(name)) between 2 and 100), email text not null default '' check(length(email)<=254),
 phone text not null default '' check(length(phone)<=30), status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id)
);
create table public.properties (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 customer_id uuid not null, address text not null check(length(trim(address)) between 5 and 300),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
create table public.pools (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 property_id uuid not null, name text not null check(length(trim(name)) between 2 and 100),
 gallons integer not null check(gallons>0 and gallons<=10000000),
 water_type text not null check(water_type in ('chlorine','salt','other')),
 type text not null check(type in ('residential','commercial','spa')),
 status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,property_id) references public.properties(organization_id,id)
);
create table public.contracts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 customer_id uuid not null, source text not null check(source in ('own','subcontract')),
 billing_model text not null check(billing_model in ('monthly','per_visit','fixed_contract')),
 price_cents bigint not null check(price_cents>=0 and price_cents<=1000000000),
 currency text not null default 'USD' check(currency='USD'),
 status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(source<>'own' or billing_model='monthly'),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
-- Fixed search_path and invoker rights: profiles has a self-read-only RLS policy.
create function public.is_manager(org uuid) returns boolean language sql stable security invoker
set search_path = '' as $$ select exists(select 1 from public.profiles where id=(select auth.uid()) and organization_id=org and role in ('owner','admin')); $$;
revoke all on function public.is_manager(uuid) from public;
grant execute on function public.is_manager(uuid) to authenticated;
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
create policy own_profile on public.profiles for select to authenticated using (id=(select auth.uid()));
create policy manager_org on public.organizations for select to authenticated using(public.is_manager(id));
-- No INSERT/UPDATE policy on profiles: JWT metadata cannot grant membership or privileges.
revoke all on public.organizations,public.profiles from anon,authenticated;
grant select on public.organizations,public.profiles to authenticated;
do $$ declare t text; begin
 foreach t in array array['customers','properties','pools','contracts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select,insert,update on public.%I to authenticated',t);
  execute format('create policy manager_read on public.%I for select to authenticated using(public.is_manager(organization_id))',t);
  execute format('create policy manager_insert on public.%I for insert to authenticated with check(public.is_manager(organization_id))',t);
  execute format('create policy manager_update on public.%I for update to authenticated using(public.is_manager(organization_id)) with check(public.is_manager(organization_id))',t);
  execute format('create index on public.%I(organization_id)',t);
 end loop;
end $$;
-- Append-only audit, including privileged SQL changes; old/new values can contain PII.
create table public.audit_log (
 id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id),
 actor_id uuid, entity text not null, record_id uuid not null, operation text not null,
 old_data jsonb, new_data jsonb, created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon,authenticated;
grant select on public.audit_log to authenticated;
create policy manager_audit on public.audit_log for select to authenticated using(public.is_manager(organization_id));
create function public.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_log(organization_id,actor_id,entity,record_id,operation,old_data,new_data)
 values(coalesce(new.organization_id,old.organization_id),auth.uid(),tg_table_name,coalesce(new.id,old.id),tg_op,case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
revoke all on function public.audit_change() from public;
create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
revoke all on function public.touch_updated_at() from public;
do $$ declare t text; begin
 foreach t in array array['customers','properties','pools','contracts'] loop
  execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()',t);
  execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_change()',t);
 end loop;
end $$;
-- No Storage bucket exposed in this phase. Photos require private bucket and visit-based policies.
