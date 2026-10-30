-- V2.2 additive, immutable audit of technician-requested skips. No visit or queue is rewritten.
create table public.route_skip_events (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 stop_id uuid not null,
 actor_id uuid not null references public.profiles(id),
 reason text not null check (length(btrim(reason)) between 1 and 500),
 created_at timestamptz not null default now(),
 foreign key (organization_id,stop_id) references public.route_stops(organization_id,id)
);
create index route_skip_events_stop on public.route_skip_events(stop_id,created_at desc);
alter table public.route_skip_events enable row level security;
create policy route_skip_events_read on public.route_skip_events for select to authenticated
 using (public.can_access_stop(stop_id));
grant select on public.route_skip_events to authenticated;
revoke insert,update,delete on public.route_skip_events from anon,authenticated;
create function public.skip_route_stop(p_stop uuid,p_reason text,p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.route_stops; existing public.route_skip_events; begin
 select * into s from public.route_stops where id=p_stop for update;
 if not found or not public.can_access_stop(p_stop) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_request is null or length(btrim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'Reason required' using errcode='22023';end if;
 select * into existing from public.route_skip_events where id=p_request;
 if found then
  if existing.organization_id=s.organization_id and existing.stop_id=s.id and existing.actor_id=auth.uid() and existing.reason=btrim(p_reason) then return;end if;
  raise exception 'Request reused' using errcode='22023';
 end if;
 if s.status not in ('pending','in_progress') then raise exception 'Stop is closed' using errcode='22023';end if;
 perform public.set_stop_status(p_stop,'skipped');
 insert into public.route_skip_events(id,organization_id,stop_id,actor_id,reason) values(p_request,s.organization_id,s.id,auth.uid(),btrim(p_reason));
end $$;
revoke all on function public.skip_route_stop(uuid,text,uuid) from public,anon;
grant execute on function public.skip_route_stop(uuid,text,uuid) to authenticated;
-- Preserve the redacted, role-checked V2.1 metadata contract, reporting the additive schema.
alter function public.system_health_metadata() rename to system_health_metadata_v24;
revoke all on function public.system_health_metadata_v24() from public,anon,authenticated;
create function public.system_health_metadata() returns jsonb language sql security definer set search_path='' as $$
 select public.system_health_metadata_v24() || jsonb_build_object('schema_version',25);
$$;
revoke all on function public.system_health_metadata() from public,anon;
grant execute on function public.system_health_metadata() to authenticated;
