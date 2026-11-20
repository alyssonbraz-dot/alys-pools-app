-- Initial schema for the standalone V4 project.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table public.profiles (
  id uuid primary key references auth.users(id),
  organization_id uuid not null references public.organizations(id),
  display_name text not null,
  role text not null default 'technician' check (role in ('technician','owner')),
  unique (organization_id, id)
);

create table public.service_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  customer text not null,
  address text not null,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  instructions text not null default '',
  unique (organization_id, id),
  check ((latitude is null) = (longitude is null))
);

create table public.water_bodies (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.service_sites(id),
  name text not null,
  kind text not null check (kind in ('pool','spa')),
  gallons integer check (gallons >= 0),
  equipment text[] not null default '{}'
);
create index water_bodies_site on public.water_bodies(site_id);

create table public.route_stops (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  technician_id uuid not null,
  site_id uuid not null,
  service_day date not null,
  position integer not null check (position > 0),
  default_position integer not null check (default_position > 0),
  foreign key (organization_id, technician_id) references public.profiles(organization_id,id),
  foreign key (organization_id, site_id) references public.service_sites(organization_id,id),
  unique (technician_id,service_day,position) deferrable initially deferred
);
create index route_stops_history on public.route_stops(site_id,technician_id,service_day desc);

create table public.visits (
  id uuid primary key,
  stop_id uuid not null unique references public.route_stops(id),
  completed_at timestamptz not null default now(),
  payload jsonb not null
);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.service_sites enable row level security;
alter table public.water_bodies enable row level security;
alter table public.route_stops enable row level security;
alter table public.visits enable row level security;

revoke all on public.organizations, public.profiles, public.service_sites, public.water_bodies,
  public.route_stops, public.visits from public, anon, authenticated;
grant select on public.organizations, public.profiles, public.service_sites, public.water_bodies,
  public.route_stops, public.visits to authenticated;
grant all on public.organizations, public.profiles, public.service_sites, public.water_bodies,
  public.route_stops, public.visits to service_role;

create policy own_profile on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy own_company on public.organizations for select to authenticated using
  (exists (select 1 from public.profiles p where p.organization_id = organizations.id));
create policy assigned_stops on public.route_stops for select to authenticated using
  (technician_id = (select auth.uid()));
create policy assigned_sites on public.service_sites for select to authenticated using
  (exists (select 1 from public.route_stops s where s.site_id = service_sites.id));
create policy assigned_bodies on public.water_bodies for select to authenticated using
  (exists (select 1 from public.route_stops s where s.site_id = water_bodies.site_id));
create policy assigned_visits on public.visits for select to authenticated using
  (exists (select 1 from public.route_stops s where s.id = visits.stop_id));

create table public.body_readings (
  visit_id uuid not null references public.visits(id),
  body_id uuid not null references public.water_bodies(id),
  ph numeric not null check (ph between 0 and 14),
  fc numeric not null check (fc between 0 and 100),
  alkalinity numeric check (alkalinity between 0 and 2000),
  primary key (visit_id, body_id)
);
create index body_readings_history on public.body_readings(body_id,visit_id);
create table public.service_reports (
  visit_id uuid primary key references public.visits(id),
  generated_at timestamptz not null default now(),
  snapshot jsonb not null
);
create table public.route_defaults (
  technician_id uuid not null references public.profiles(id),
  weekday smallint not null check (weekday between 0 and 6),
  site_id uuid not null references public.service_sites(id),
  position integer not null check (position > 0),
  primary key (technician_id,weekday,site_id)
);
alter table public.body_readings enable row level security;
alter table public.service_reports enable row level security;
alter table public.route_defaults enable row level security;
revoke all on public.body_readings, public.service_reports, public.route_defaults from public, anon, authenticated;
grant select on public.body_readings, public.service_reports, public.route_defaults to authenticated;
grant all on public.body_readings, public.service_reports, public.route_defaults to service_role;
create policy assigned_readings on public.body_readings for select to authenticated using
  (exists (select 1 from public.visits v where v.id = body_readings.visit_id));
create policy assigned_reports on public.service_reports for select to authenticated using
  (exists (select 1 from public.visits v where v.id = service_reports.visit_id));
create policy own_default on public.route_defaults for select to authenticated using (technician_id = (select auth.uid()));

-- Routes and bounded per-body history arrive in a single round trip.
create function public.v4_route(p_day date) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'date', p_day,
    'technician', p.display_name,
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'position', s.position, 'name', site.customer, 'address', site.address,
        'latitude', site.latitude, 'longitude', site.longitude,
        'completedAt', v.completed_at, 'visit', v.payload,
        'bodies', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', b.id, 'kind', b.kind, 'name', b.name, 'gallons', b.gallons, 'equipment', b.equipment,
            'history', coalesce((
              select jsonb_agg(to_jsonb(h) order by h.date desc)
              from (
                select past.service_day as date, r.ph, r.fc, r.alkalinity
                from public.route_stops past
                join public.visits pv on pv.stop_id = past.id
                join public.body_readings r on r.visit_id = pv.id and r.body_id = b.id
                where past.site_id = site.id and past.technician_id = p.id and past.service_day < p_day
                order by past.service_day desc, pv.completed_at desc limit 4
              ) h
            ), '[]'::jsonb)
          ) order by b.kind,b.name,b.id)
          from public.water_bodies b where b.site_id = site.id
        ), '[]'::jsonb)
      ) order by s.position)
      from public.route_stops s
      join public.service_sites site on site.id = s.site_id and site.organization_id = p.organization_id
      left join public.visits v on v.stop_id = s.id
      where s.technician_id = p.id and s.service_day = p_day
    ), '[]'::jsonb)
  ) from public.profiles p where p.id = (select auth.uid())
$$;

create function public.v4_complete(p_visit jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.route_stops;
  existing public.visits;
  visit_id uuid := (p_visit->>'id')::uuid;
  item jsonb;
  body_ids uuid[];
  reply jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select * into s from public.route_stops
    where id = (p_visit->>'stopId')::uuid and technician_id = auth.uid()
    for update;
  if not found then raise insufficient_privilege using message = 'Stop is not assigned to this account.'; end if;
  reply := jsonb_build_object('id',visit_id,'stopId',s.id);
  select * into existing from public.visits where stop_id = s.id;
  if found then
    if existing.payload = p_visit then return reply; end if;
    raise unique_violation using message = 'A different visit already completed this stop.';
  end if;
  if visit_id is null or (p_visit->>'date') is distinct from to_char(s.service_day,'YYYY-MM-DD')
     or not (p_visit ?& array['id','stopId','date','bodies','notes'])
     or p_visit - array['id','stopId','date','bodies','notes'] <> '{}'::jsonb
     or jsonb_typeof(p_visit->'notes') <> 'string' or length(p_visit->>'notes') > 4000
     or jsonb_typeof(p_visit->'bodies') <> 'array' then
    raise invalid_parameter_value using message = 'Invalid visit.';
  end if;
  if jsonb_array_length(p_visit->'bodies') not between 1 and 32 then
    raise invalid_parameter_value using message = 'Invalid body count.';
  end if;
  select array_agg((b->>'bodyId')::uuid order by (b->>'bodyId')::uuid) into body_ids
    from jsonb_array_elements(p_visit->'bodies') b;
  if body_ids is distinct from (select array_agg(id order by id) from public.water_bodies where site_id = s.site_id) then
    raise invalid_parameter_value using message = 'Complete each assigned water body once.';
  end if;
  insert into public.visits (id,stop_id,payload) values (visit_id,s.id,p_visit);
  for item in select value from jsonb_array_elements(p_visit->'bodies') loop
    if not (item ?& array['bodyId','ph','fc','alkalinity','tasks','chemicals'])
      or item - array['bodyId','ph','fc','alkalinity','tasks','chemicals'] <> '{}'::jsonb
      or jsonb_typeof(item->'ph') <> 'number' or jsonb_typeof(item->'fc') <> 'number'
      or (item->>'ph')::numeric not between 0 and 14 or (item->>'fc')::numeric not between 0 and 100
      or jsonb_typeof(item->'alkalinity') not in ('null','number')
      or (item->>'alkalinity')::numeric not between 0 and 2000
      or jsonb_typeof(item->'tasks') <> 'array' or jsonb_typeof(item->'chemicals') <> 'array' then
      raise invalid_parameter_value using message = 'Invalid readings or service details.';
    end if;
    if jsonb_array_length(item->'tasks') > 32
      or exists (select 1 from jsonb_array_elements(item->'tasks') t where jsonb_typeof(t) <> 'string' or length(trim(t #>> '{}')) not between 1 and 120)
      or jsonb_array_length(item->'chemicals') > 32
      or exists (select 1 from jsonb_array_elements(item->'chemicals') c where
          not (c ?& array['product','amount','unit']) or c - array['product','amount','unit'] <> '{}'::jsonb
          or jsonb_typeof(c->'product') <> 'string' or length(trim(c->>'product')) not between 1 and 120
          or jsonb_typeof(c->'unit') <> 'string' or length(trim(c->>'unit')) not between 1 and 24
          or jsonb_typeof(c->'amount') <> 'number' or (c->>'amount')::numeric <= 0 or (c->>'amount')::numeric > 100000) then
      raise invalid_parameter_value using message = 'Invalid checklist or chemical dose.';
    end if;
    insert into public.body_readings(visit_id,body_id,ph,fc,alkalinity)
      values (visit_id,(item->>'bodyId')::uuid,(item->>'ph')::numeric,(item->>'fc')::numeric,(item->>'alkalinity')::numeric);
  end loop;
  insert into public.service_reports(visit_id,snapshot)
    select visit_id,jsonb_build_object('customer',site.customer,'address',site.address,'visit',p_visit)
    from public.service_sites site where site.id=s.site_id;
  return reply;
exception when invalid_text_representation then
  raise invalid_parameter_value using message = 'Invalid identifier or measurement.';
end
$$;

create function public.v4_order(p_day date, p_ids uuid[], p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  assigned uuid[];
  weekday_no integer := extract(dow from p_day);
begin
  if actor is null then raise insufficient_privilege; end if;
  -- Serialize reorders across tabs and days for this technician.
  perform 1 from public.profiles where id = actor for update;
  if not found then raise insufficient_privilege; end if;
  if p_day is null or p_mode is null or p_mode not in ('save','reset') then
    raise invalid_parameter_value using message = 'Invalid order operation.';
  end if;
  if p_mode = 'save' then
    select array_agg(id order by id) into assigned from public.route_stops
      where technician_id = actor and service_day = p_day;
    if assigned is null or assigned is distinct from (select array_agg(id order by id) from unnest(p_ids) id) then
      raise invalid_parameter_value using message = 'Include every assigned stop exactly once.';
    end if;
    update public.route_stops s set position = request.ordinal
      from unnest(p_ids) with ordinality request(id,ordinal)
      where s.id = request.id and s.technician_id = actor and s.service_day = p_day;
    insert into public.route_defaults(technician_id,weekday,site_id,position)
      select actor,weekday_no,site_id,min(position) from public.route_stops
      where technician_id = actor and service_day = p_day group by site_id
      on conflict (technician_id,weekday,site_id) do update set position = excluded.position;
  else
    with restored as (
      select s.id, row_number() over (order by d.position nulls last,s.default_position,s.id) as position
      from public.route_stops s left join public.route_defaults d
        on d.site_id = s.site_id and d.technician_id = actor and d.weekday = weekday_no
      where s.technician_id = actor and s.service_day = p_day
    )
    update public.route_stops s set position = restored.position from restored where restored.id = s.id;
  end if;
  return public.v4_route(p_day);
end
$$;

revoke all on function public.v4_complete(jsonb), public.v4_route(date), public.v4_order(date,uuid[],text)
  from public, anon, authenticated, service_role;
grant execute on function public.v4_complete(jsonb), public.v4_route(date), public.v4_order(date,uuid[],text)
  to authenticated;

-- V4 currently records report snapshots only. External delivery requires a separate workflow.
