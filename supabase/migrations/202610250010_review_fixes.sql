-- Reconcile generated, unstarted appointments without deleting service history.
alter table public.route_stops add column cancellation_reason text;
create function public.reconcile_schedule(p_schedule uuid) returns void language plpgsql security definer set search_path='' as $$
declare sc public.recurring_schedules; s public.route_stops; enabled boolean;begin
 select * into sc from public.recurring_schedules where id=p_schedule;
 if not found then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(sc.organization_id::text||':schedule',0));
 select exists(select 1 from public.properties p join public.customers c on c.id=p.customer_id where p.id=sc.property_id and c.status='active' and c.archived_at is null) into enabled;
 for s in select * from public.route_stops where schedule_id=sc.id and service_date >= (now() at time zone 'America/New_York')::date and (status='pending' or cancellation_reason='schedule_changed') for update loop
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
revoke all on function public.reconcile_schedule(uuid) from public,anon,authenticated;
create function public.schedule_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.property_id,new.technician_id,new.days_of_week,new.start_on,new.end_on,new.active) is distinct from (old.property_id,old.technician_id,old.days_of_week,old.start_on,old.end_on,old.active) and exists(select 1 from public.route_stops where schedule_id=new.id and status='in_progress' and service_date >= (now() at time zone 'America/New_York')::date) then raise exception 'Finish or skip the in-progress stop before changing its schedule' using errcode='22023';end if;
 perform public.reconcile_schedule(new.id);return new;
end $$;
revoke all on function public.schedule_changed() from public;
create trigger reconcile_schedule_change after insert or update on public.recurring_schedules for each row execute function public.schedule_changed();
create function public.customer_service_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid;begin
 if (new.status,new.archived_at) is not distinct from (old.status,old.archived_at) then return new;end if;
 if new.status<>'active' or new.archived_at is not null then
  update public.route_stops s set status='skipped',cancellation_reason='customer_inactive',updated_at=now() from public.properties p where s.property_id=p.id and p.customer_id=new.id and s.status in ('pending','in_progress') and s.service_date >= (now() at time zone 'America/New_York')::date;
 end if;
 for sid in select sc.id from public.recurring_schedules sc join public.properties p on p.id=sc.property_id where p.customer_id=new.id loop perform public.reconcile_schedule(sid);end loop;
 return new;
end $$;
revoke all on function public.customer_service_changed() from public;
create trigger reconcile_customer_change after update on public.customers for each row execute function public.customer_service_changed();
create or replace function public.generate_route(p_date date) returns integer language plpgsql security definer set search_path='' as $$
declare actor public.profiles; added integer;begin
 select * into actor from public.profiles where id=auth.uid();
 if not found or actor.role not in ('owner','admin','technician') then raise exception 'Not authorized' using errcode='42501';end if;
 if p_date is null or p_date<current_date-365 or p_date>current_date+366 then raise exception 'Invalid route date' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor.organization_id::text||':schedule',0));
 perform pg_advisory_xact_lock(hashtextextended(actor.organization_id::text||p_date::text,0));
 insert into public.route_stops(organization_id,property_id,technician_id,service_date,position,schedule_id)
 select sc.organization_id,sc.property_id,sc.technician_id,p_date,coalesce((select max(s.position) from public.route_stops s where s.organization_id=sc.organization_id and s.service_date=p_date and s.technician_id=sc.technician_id),0)+row_number() over(partition by sc.technician_id order by sc.created_at,sc.id)::integer,sc.id
 from public.recurring_schedules sc join public.properties p on p.id=sc.property_id join public.customers c on c.id=p.customer_id
 where sc.organization_id=actor.organization_id and sc.active and sc.start_on<=p_date and (sc.end_on is null or sc.end_on>=p_date) and extract(dow from p_date)::integer=any(sc.days_of_week) and c.status='active' and c.archived_at is null
 and (actor.role in ('owner','admin') or sc.technician_id=actor.id) and exists(select 1 from public.pools po where po.property_id=p.id and po.status='active')
 and not exists(select 1 from public.route_stops existing where existing.schedule_id=sc.id and existing.service_date=p_date)
 on conflict(property_id,technician_id,service_date) do nothing;
 get diagnostics added=row_count;return added;
end $$;
-- Existing pending automatic stops are reconciled once as well.
do $$ declare sid uuid;begin for sid in select id from public.recurring_schedules loop perform public.reconcile_schedule(sid);end loop;end $$;

-- Current access instructions require an open assignment in a bounded work window.
create or replace function public.can_access_property(property uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.properties pr join public.profiles p on p.id=auth.uid() and p.organization_id=pr.organization_id where pr.id=property and (p.role in ('owner','admin') or (p.role='technician' and exists(select 1 from public.route_stops s join public.customers c on c.id=pr.customer_id where s.property_id=pr.id and s.technician_id=p.id and (s.status in ('pending','in_progress') or (s.status='completed' and s.service_date=(now() at time zone 'America/New_York')::date)) and s.service_date between (now() at time zone 'America/New_York')::date-1 and (now() at time zone 'America/New_York')::date+7 and c.status='active' and c.archived_at is null))));
$$;
-- Filter historical visits without joining the live, restricted property row.
alter table public.visits add column customer_id uuid;
alter table public.visits disable trigger immutable_service;
update public.visits v set customer_id=p.customer_id from public.route_stops s join public.properties p on p.id=s.property_id where v.route_stop_id=s.id;
alter table public.visits enable trigger immutable_service;
alter table public.visits alter column customer_id set not null;
alter table public.visits add foreign key(organization_id,customer_id) references public.customers(organization_id,id);
create function public.visit_customer() returns trigger language plpgsql security definer set search_path='' as $$
begin select p.customer_id into new.customer_id from public.route_stops s join public.properties p on p.id=s.property_id where s.id=new.route_stop_id;return new;end $$;
revoke all on function public.visit_customer() from public;
create trigger visit_customer before insert on public.visits for each row execute function public.visit_customer();
create index visit_history_page on public.visits(organization_id,completed_at desc,id);

-- Save ordering and driving plan together, rejecting a route changed during calculation.
create function public.save_driving_plan(p_row jsonb,p_ids uuid[],p_expected jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor public.profiles; actual jsonb;d date:=(p_row->>'service_date')::date;t uuid:=(p_row->>'technician_id')::uuid;begin
 select * into actor from public.profiles where id=auth.uid();
 if not found or not (actor.role in ('owner','admin') or (actor.role='technician' and actor.id=t)) then raise exception 'Access denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor.organization_id::text||d::text,0));
 perform 1 from public.route_stops where organization_id=actor.organization_id and technician_id=t and service_date=d order by id for update;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'status',s.status,'position',s.position) order by s.position,s.id),'[]') into actual from public.route_stops s where s.organization_id=actor.organization_id and s.technician_id=t and s.service_date=d;
 if actual is distinct from p_expected then raise exception 'Route changed. Refresh and calculate again.' using errcode='40001';end if;
 if p_ids is not null then perform public.reorder_route(p_ids);end if;
 insert into public.route_plans(organization_id,technician_id,service_date,start_latitude,start_longitude,start_time,calculation,fingerprint)
 values(actor.organization_id,t,d,(p_row->>'start_latitude')::double precision,(p_row->>'start_longitude')::double precision,p_row->>'start_time',nullif(p_row->'calculation','null'),p_row->>'fingerprint')
 on conflict(organization_id,technician_id,service_date) do update set start_latitude=excluded.start_latitude,start_longitude=excluded.start_longitude,start_time=excluded.start_time,calculation=excluded.calculation,fingerprint=excluded.fingerprint,updated_at=now();
end $$;
revoke all on function public.save_driving_plan(jsonb,uuid[],jsonb) from public,anon;
grant execute on function public.save_driving_plan(jsonb,uuid[],jsonb) to authenticated;
create function public.search_visits(p_query text default '',p_status text default 'all',p_customer uuid default null,p_offset integer default 0,p_limit integer default 51) returns setof public.visits language sql stable security invoker set search_path='' as $$
 select v.* from public.visits v where (p_customer is null or v.customer_id=p_customer)
 and (coalesce(p_query,'')='' or position(lower(left(p_query,100)) in lower(v.snapshot::text))>0)
 and (p_status='all' or exists(select 1 from public.email_delivery_logs e where e.visit_id=v.id and e.status=p_status))
 order by v.completed_at desc,v.id limit least(greatest(p_limit,1),51) offset least(greatest(p_offset,0),1000000);
$$;
revoke all on function public.search_visits(text,text,uuid,integer,integer) from public,anon;
grant execute on function public.search_visits(text,text,uuid,integer,integer) to authenticated;
-- Distributed limits and a hard upload budget; browser sessions cannot alter reservations.
create table public.photo_upload_budget(organization_id uuid not null,stop_id uuid not null,photo_id uuid not null,created_at timestamptz not null default now(),primary key(stop_id,photo_id),foreign key(organization_id,stop_id) references public.route_stops(organization_id,id));
alter table public.photo_upload_budget enable row level security;
revoke all on public.photo_upload_budget from public,anon,authenticated;
grant select on public.photo_upload_budget to service_role;
create function public.reserve_photo_upload(p_stop uuid,p_photo uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare org uuid;begin
 select organization_id into org from public.route_stops where id=p_stop and status in ('pending','in_progress') and public.can_access_stop(id);
 if org is null then raise exception 'Access denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||':uploads',0));
 if exists(select 1 from public.photo_upload_budget where stop_id=p_stop and photo_id=p_photo) then return true;end if;
 if (select count(*) from public.photo_upload_budget where stop_id=p_stop)>=12 or (select count(*) from public.photo_upload_budget where organization_id=org)>=2000 or (select count(*) from public.photo_upload_budget where organization_id=org and created_at>now()-interval '1 hour')>=120 then return false;end if;
 insert into public.photo_upload_budget(organization_id,stop_id,photo_id) values(org,p_stop,p_photo);return true;
end $$;
revoke all on function public.reserve_photo_upload(uuid,uuid) from public,anon;
grant execute on function public.reserve_photo_upload(uuid,uuid) to authenticated;
create table public.external_service_limits(service text primary key,last_used timestamptz not null);
alter table public.external_service_limits enable row level security;
revoke all on public.external_service_limits from public,anon,authenticated;
create function public.claim_geocode_slot() returns boolean language plpgsql security definer set search_path='' as $$
declare granted boolean;begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role in ('owner','admin')) then raise exception 'Access denied' using errcode='42501';end if;
 insert into public.external_service_limits values('geocode',clock_timestamp()) on conflict(service) do update set last_used=excluded.last_used where public.external_service_limits.last_used<clock_timestamp()-interval '1.1 seconds' returning true into granted;
 return coalesce(granted,false);
end $$;
revoke all on function public.claim_geocode_slot() from public,anon;
grant execute on function public.claim_geocode_slot() to authenticated;
-- Include existing uploads in the budget; never remove objects in a migration.
insert into public.photo_upload_budget(organization_id,stop_id,photo_id,created_at)
select s.organization_id,s.id,substring(split_part(o.name,'/',3) from 1 for 36)::uuid,now()
from storage.objects o join public.route_stops s on split_part(o.name,'/',1)=s.organization_id::text and split_part(o.name,'/',2)=s.id::text
where o.bucket_id='visit-photos' and split_part(o.name,'/',3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$'
on conflict do nothing;
