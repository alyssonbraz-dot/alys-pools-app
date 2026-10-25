-- Reactivation restores automatic appointments; inactive customers cannot be restarted through the status RPC.
create or replace function public.reconcile_schedule(p_schedule uuid) returns void language plpgsql security definer set search_path='' as $$
declare sc public.recurring_schedules; s public.route_stops; enabled boolean;begin
 select * into sc from public.recurring_schedules where id=p_schedule;
 if not found then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(sc.organization_id::text||':schedule',0));
 select exists(select 1 from public.properties p join public.customers c on c.id=p.customer_id where p.id=sc.property_id and c.status='active' and c.archived_at is null) into enabled;
 for s in select * from public.route_stops where schedule_id=sc.id and service_date >= (now() at time zone 'America/New_York')::date and (status='pending' or cancellation_reason in ('schedule_changed','customer_inactive')) for update loop
  if sc.active and enabled and sc.start_on<=s.service_date and (sc.end_on is null or sc.end_on>=s.service_date) and extract(dow from s.service_date)::integer=any(sc.days_of_week) then
   if exists(select 1 from public.route_stops x where x.id<>s.id and x.property_id=sc.property_id and x.technician_id=sc.technician_id and x.service_date=s.service_date) then
    update public.route_stops set status='skipped',cancellation_reason='schedule_conflict',updated_at=now() where id=s.id;
   else
    update public.route_stops set technician_id=sc.technician_id,property_id=sc.property_id,status='pending',cancellation_reason=null,updated_at=now() where id=s.id;
   end if;
  else update public.route_stops set status='skipped',cancellation_reason='schedule_changed',updated_at=now() where id=s.id;
  end if;
 end loop;
end $$;
create or replace function public.set_stop_status(p_stop_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare s public.route_stops; begin
 select * into s from public.route_stops where id=p_stop_id for update;
 if not found or not public.can_access_stop(p_stop_id) then raise exception 'Not authorized' using errcode='42501'; end if;
 if s.status='completed' then raise exception 'Completed stop is immutable' using errcode='22023'; end if;
 if p_status not in ('pending','in_progress','skipped') then raise exception 'Invalid status' using errcode='22023'; end if;
 if p_status in ('pending','in_progress') and s.cancellation_reason is not null and not public.is_manager(s.organization_id) then raise exception 'Manager must restore a cancelled assignment' using errcode='42501';end if;
 if p_status in ('pending','in_progress') and not exists(select 1 from public.properties p join public.customers c on c.id=p.customer_id where p.id=s.property_id and c.status='active' and c.archived_at is null) then raise exception 'Customer is inactive' using errcode='22023';end if;
 update public.route_stops set cancellation_reason=case when p_status='skipped' and s.status in ('pending','in_progress') then null else cancellation_reason end,status=p_status,updated_at=now() where id=p_stop_id;
end $$;

create or replace function public.add_route_stop(p_property_id uuid,p_technician_id uuid,p_date date) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; result uuid; begin
 select organization_id into org from public.properties where id=p_property_id;
 if not public.is_manager(org) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_date is null or p_date<current_date-365 or p_date>current_date+366 then raise exception 'Invalid date' using errcode='22023'; end if;
 if not exists(select 1 from public.profiles p where p.id=p_technician_id and p.organization_id=org and p.role in ('owner','admin','technician')) then raise exception 'Invalid technician' using errcode='22023'; end if;
 if not exists(select 1 from public.pools po join public.properties pr on pr.id=po.property_id join public.customers c on c.id=pr.customer_id where pr.id=p_property_id and po.status='active' and c.status='active') then raise exception 'An active customer and pool are required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||p_date::text,0));
 insert into public.route_stops(organization_id,property_id,technician_id,service_date,position)
 values(org,p_property_id,p_technician_id,p_date,coalesce((select max(position)+1 from public.route_stops where organization_id=org and service_date=p_date and technician_id=p_technician_id),1))
 on conflict(property_id,technician_id,service_date) do update set position=route_stops.position,status=case when route_stops.status='skipped' then 'pending' else route_stops.status end,cancellation_reason=case when route_stops.status='skipped' then null else route_stops.cancellation_reason end
 returning id into result;
 return result;
end $$;


create or replace function public.can_access_property(property uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.properties pr join public.profiles p on p.id=auth.uid() and p.organization_id=pr.organization_id where pr.id=property and (p.role in ('owner','admin') or (p.role='technician' and exists(select 1 from public.route_stops s join public.customers c on c.id=pr.customer_id where s.property_id=pr.id and s.technician_id=p.id and (s.status in ('pending','in_progress') or ((s.status='completed' or (s.status='skipped' and s.cancellation_reason is null)) and s.service_date=(now() at time zone 'America/New_York')::date)) and s.service_date between (now() at time zone 'America/New_York')::date-1 and (now() at time zone 'America/New_York')::date+7 and c.status='active' and c.archived_at is null))));
$$;
