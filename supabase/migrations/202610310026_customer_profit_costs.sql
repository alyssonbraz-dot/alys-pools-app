-- Profitability V1: owner-only monthly cost assumptions, additive and non-destructive.
create table public.customer_profit_costs (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  visits_per_month numeric(6,2) not null default 4.33 check (visits_per_month >= 0 and visits_per_month <= 62),
  technician_cost_per_visit_cents integer not null default 0 check (technician_cost_per_visit_cents between 0 and 10000000),
  chemicals_per_visit_cents integer not null default 0 check (chemicals_per_visit_cents between 0 and 10000000),
  fuel_vehicle_per_visit_cents integer not null default 0 check (fuel_vehicle_per_visit_cents between 0 and 10000000),
  other_per_visit_cents integer not null default 0 check (other_per_visit_cents between 0 and 10000000),
  monthly_overhead_cents integer not null default 0 check (monthly_overhead_cents between 0 and 10000000),
  updated_at timestamptz not null default now(),
  constraint profit_customer_same_org foreign key (organization_id,customer_id) references public.customers(organization_id,id)
);
alter table public.customer_profit_costs enable row level security;
create policy customer_profit_owner_read on public.customer_profit_costs for select to authenticated
 using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.access_state='active' and p.organization_id=customer_profit_costs.organization_id));
create policy customer_profit_owner_insert on public.customer_profit_costs for insert to authenticated
 with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.access_state='active' and p.organization_id=customer_profit_costs.organization_id));
create policy customer_profit_owner_update on public.customer_profit_costs for update to authenticated
 using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.access_state='active' and p.organization_id=customer_profit_costs.organization_id))
 with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.access_state='active' and p.organization_id=customer_profit_costs.organization_id));
grant select,insert,update on public.customer_profit_costs to authenticated;
revoke delete on public.customer_profit_costs from anon,authenticated;
