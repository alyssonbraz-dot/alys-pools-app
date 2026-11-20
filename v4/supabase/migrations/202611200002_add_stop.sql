-- Create the site, first water body and assigned stop as one owner operation.
create function public.v4_add_stop(
  p_id uuid, p_day date, p_name text, p_address text, p_kind text, p_gallons integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  company uuid;
  site uuid;
  next_position integer;
begin
  -- v4_order locks the same row, keeping positions consistent across sessions.
  select organization_id into company from public.profiles
    where id = actor and role = 'owner' for update;
  if not found then raise insufficient_privilege using message = 'Owner access required.'; end if;

  p_name := trim(p_name);
  p_address := trim(p_address);
  if p_day is null or p_id is null or p_kind is null or p_kind not in ('pool', 'spa')
    or length(coalesce(p_name, '')) not between 1 and 120
    or length(coalesce(p_address, '')) not between 1 and 320
    or p_gallons not between 1 and 100000000 then
    raise invalid_parameter_value using message = 'Invalid stop details.';
  end if;

  if exists (select 1 from public.route_stops where id = p_id) then
    if exists (
      select 1 from public.route_stops r
      join public.service_sites s on s.id = r.site_id
      join public.water_bodies b on b.site_id = s.id
      where r.id = p_id and r.technician_id = actor and r.service_day = p_day
        and s.organization_id = company and s.customer = p_name and s.address = p_address
        and b.kind = p_kind and b.gallons is not distinct from p_gallons
    ) then return p_id; end if;
    raise unique_violation using message = 'This stop ID was already used.';
  end if;

  select coalesce(max(position), 0) + 1 into next_position from public.route_stops
    where technician_id = actor and service_day = p_day;
  insert into public.service_sites(organization_id, customer, address)
    values (company, p_name, p_address) returning id into site;
  insert into public.water_bodies(site_id, name, kind, gallons)
    values (site, initcap(p_kind), p_kind, p_gallons);
  insert into public.route_stops(id, organization_id, technician_id, site_id, service_day, position, default_position)
    values (p_id, company, actor, site, p_day, next_position, next_position);
  return p_id;
end
$$;

revoke all on function public.v4_add_stop(uuid,date,text,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.v4_add_stop(uuid,date,text,text,text,integer) to authenticated;
