alter table public.route_stops add column estimated_service_minutes integer not null default 20 check(estimated_service_minutes between 1 and 480),
 add column service_type text not null default 'Pool maintenance' check(length(service_type)<=100);
create table public.route_plans(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 technician_id uuid not null,service_date date not null,start_latitude double precision check(start_latitude between -90 and 90),start_longitude double precision check(start_longitude between -180 and 180),start_time text not null default '08:00' check(start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 calculation jsonb,fingerprint text,updated_at timestamptz not null default now(),
 check((start_latitude is null)=(start_longitude is null)),unique(organization_id,technician_id,service_date),foreign key(organization_id,technician_id) references public.profiles(organization_id,id)
);
alter table public.route_plans enable row level security;
revoke all on public.route_plans from anon,authenticated;
grant select,insert,update on public.route_plans to authenticated;
create policy route_plan_read on public.route_plans for select to authenticated using(public.is_manager(organization_id) or exists(select 1 from public.profiles p where p.id=auth.uid() and p.id=technician_id and p.organization_id=route_plans.organization_id and p.role='technician'));
create policy route_plan_insert on public.route_plans for insert to authenticated with check(public.is_manager(organization_id) or exists(select 1 from public.profiles p where p.id=auth.uid() and p.id=technician_id and p.organization_id=route_plans.organization_id and p.role='technician'));
create policy route_plan_update on public.route_plans for update to authenticated using(public.is_manager(organization_id) or exists(select 1 from public.profiles p where p.id=auth.uid() and p.id=technician_id and p.organization_id=route_plans.organization_id and p.role='technician')) with check(public.is_manager(organization_id) or exists(select 1 from public.profiles p where p.id=auth.uid() and p.id=technician_id and p.organization_id=route_plans.organization_id and p.role='technician'));
create trigger route_plan_audit after insert or update on public.route_plans for each row execute function public.audit_change();
grant all on public.customer_details,public.customer_tags,public.customer_invitations,public.route_plans to service_role;
