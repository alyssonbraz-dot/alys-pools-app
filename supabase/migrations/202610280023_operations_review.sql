-- Explicit Owner review only. No legacy price is automatically counted as revenue.
create table public.legacy_agreement_reviews(
 id uuid primary key,organization_id uuid not null,customer_id uuid not null unique,contract_id uuid not null,payload jsonb not null,reviewed_by uuid not null,created_at timestamptz not null default now(),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id),foreign key(contract_id) references public.contracts(id),foreign key(reviewed_by) references public.profiles(id)
);
alter table public.legacy_agreement_reviews enable row level security;
revoke all on public.legacy_agreement_reviews from public,anon,authenticated;
grant select on public.legacy_agreement_reviews to authenticated;
create policy owner_legacy_review on public.legacy_agreement_reviews for select to authenticated using(public.is_owner(organization_id));
create function public.legacy_agreement_candidates(p_offset integer default 0) returns table(customer_id uuid,name text,monthly_price_cents bigint) language plpgsql stable security definer set search_path='' as $$
declare org uuid;begin
 select organization_id into org from public.profiles where id=auth.uid() and role='owner' and access_state='active';if org is null then raise exception 'Owner required' using errcode='42501';end if;
 return query select c.id,c.name,d.monthly_price_cents from public.customers c join public.customer_details d on d.customer_id=c.id where c.organization_id=org and c.status='active' and c.archived_at is null and d.monthly_price_cents>0 and not exists(select 1 from public.contracts a where a.customer_id=c.id) order by c.name,c.id limit 51 offset least(greatest(p_offset,0),1000000);
end $$;
create function public.convert_legacy_agreement(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.customers;prior public.legacy_agreement_reviews;cid uuid:=(p_payload->>'customer_id')::uuid;pid uuid:=(p_payload->>'property_id')::uuid;req uuid:=(p_payload->>'request_id')::uuid;sc_id uuid;agreement uuid;begin
 select * into c from public.customers where id=cid for update;
 if not found or not public.is_owner(c.organization_id) then raise exception 'Owner required' using errcode='42501';end if;
 if coalesce((p_payload->>'confirmed')::boolean,false) is not true or req is null or p_payload->>'source' not in ('own','subcontract') or (p_payload->>'price_cents')::bigint<0 then raise exception 'Confirm agreement terms' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(cid::text||':legacy',0));
 select * into prior from public.legacy_agreement_reviews where customer_id=cid or id=req;
 if found then if prior.organization_id<>c.organization_id or prior.payload is distinct from p_payload then raise exception 'Review already completed' using errcode='22023';end if;return prior.contract_id;end if;
 if exists(select 1 from public.contracts where customer_id=cid) then raise exception 'Review the existing agreement in the customer profile' using errcode='22023';end if;
 if not exists(select 1 from public.properties p join public.pools po on po.property_id=p.id where p.id=pid and p.customer_id=cid and po.status='active') then raise exception 'Active property and pool required' using errcode='22023';end if;
 if (select count(*) from public.recurring_schedules where property_id=pid and active)>1 then raise exception 'Review multiple schedules in the customer profile' using errcode='22023';end if;
 select id into sc_id from public.recurring_schedules where property_id=pid and active limit 1;
 perform public.save_service_schedule(jsonb_build_object('id',sc_id,'property_id',pid,'technician_id',p_payload->'technician_id','days_of_week',p_payload->'days_of_week','start_on',p_payload->>'start_on','end_on','','active',p_payload->'active','service_notes',''));
 insert into public.contracts(organization_id,customer_id,source,billing_model,price_cents,status) values(c.organization_id,cid,p_payload->>'source','monthly',(p_payload->>'price_cents')::bigint,case when (p_payload->>'active')::boolean then 'active' else 'inactive' end) returning id into agreement;
 insert into public.legacy_agreement_reviews values(req,c.organization_id,cid,agreement,p_payload,auth.uid(),now());return agreement;
end $$;
revoke all on function public.legacy_agreement_candidates(integer),public.convert_legacy_agreement(jsonb) from public,anon;
grant execute on function public.legacy_agreement_candidates(integer),public.convert_legacy_agreement(jsonb) to authenticated;
-- Only reviewed service defaults may be changed through this RPC; a demo Owner
-- cannot remove the top-level server-enforced demo isolation/delivery marker.
create or replace function public.save_company_settings(p_name text,p_settings jsonb) returns void language plpgsql security definer set search_path='' as $$
declare org uuid;begin
 select organization_id into org from public.profiles where id=auth.uid() and role='owner' and access_state='active';if org is null then raise exception 'Owner required' using errcode='42501';end if;
 if length(trim(p_name)) not between 2 and 100 or jsonb_typeof(p_settings->'service_defaults') is distinct from 'object' or octet_length(p_settings::text)>16000 then raise exception 'Invalid settings' using errcode='22023';end if;
 update public.organizations set name=trim(p_name),settings=settings||jsonb_build_object('service_defaults',p_settings->'service_defaults'),timezone=coalesce(p_settings->'service_defaults'->>'timeZone',timezone) where id=org;
end $$;
create function public.system_health_metadata() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid;observed jsonb;begin
 select organization_id into org from public.profiles where id=auth.uid() and role='owner' and access_state='active';if org is null then raise exception 'Owner required' using errcode='42501';end if;
 select jsonb_build_object('started_at',started_at,'finished_at',finished_at,'outcome',outcome) into observed from public.worker_observations where key='schedule';
 return jsonb_build_object('schema_version',23,'worker',observed,'queue',(select jsonb_build_object('queued',count(*) filter(where status='pending' and (locked_until is null or locked_until<=now())),'sending',count(*) filter(where status='pending' and locked_until>now()),'accepted',count(*) filter(where status='sent' and delivery_outcome is null),'delivered',count(*) filter(where delivered_at is not null and delivery_outcome='delivered'),'failed',count(*) filter(where status='failed' or delivery_outcome in ('bounced','complained','failed'))) from public.email_delivery_logs where organization_id=org),'last_confirmed_delivery',(select max(delivered_at) from public.email_delivery_logs where organization_id=org));
end $$;
revoke all on function public.system_health_metadata() from public,anon;
grant execute on function public.system_health_metadata() to authenticated;
-- Versioned readers retain snapshot units/timezone without breaking V2 callers.
create function public.route_chemistry_history_v21(p_property_ids uuid[],p_from date,p_through date)
returns table(visit_id uuid,pool_id uuid,completed_at timestamptz,readings jsonb,dosages jsonb,technician_name text,unit_system text,service_timezone text)
language sql stable security definer set search_path='' as $$
 select r.*,coalesce(v.snapshot->>'unit_system','imperial'),coalesce(v.snapshot->>'service_timezone','America/New_York') from public.route_chemistry_history_v2(p_property_ids,p_from,p_through) r join public.visits v on v.id=r.visit_id;
$$;
create function public.chemistry_ledger_v21(p_property uuid,p_days integer default 30,p_offset integer default 0,p_pool uuid default null)
returns table(visit_id uuid,pool_id uuid,pool_name text,completed_at timestamptz,readings jsonb,dosages jsonb,technician_name text,can_view_visit boolean,reference_ranges jsonb,unit_system text,service_timezone text)
language sql stable security definer set search_path='' as $$
 select r.visit_id,r.pool_id,r.pool_name,r.completed_at,r.readings,r.dosages,coalesce(v.snapshot->>'technician_name',r.technician_name),r.can_view_visit,r.reference_ranges,coalesce(v.snapshot->>'unit_system','imperial'),coalesce(v.snapshot->>'service_timezone','America/New_York') from public.chemistry_ledger(p_property,p_days,p_offset,p_pool) r join public.visits v on v.id=r.visit_id;
$$;
revoke all on function public.route_chemistry_history_v21(uuid[],date,date),public.chemistry_ledger_v21(uuid,integer,integer,uuid) from public,anon;
grant execute on function public.route_chemistry_history_v21(uuid[],date,date),public.chemistry_ledger_v21(uuid,integer,integer,uuid) to authenticated;
-- Date filtering follows each immutable visit's service timezone, not the viewer.
create or replace function public.search_visits_v2(p_query text default '',p_status text default 'all',p_customer uuid default null,p_offset integer default 0,p_limit integer default 51,p_from date default null,p_tech uuid default null,p_visit uuid default null)
returns setof public.visits language sql stable security invoker set search_path='' as $$
 select v.* from public.visits v where (p_customer is null or v.customer_id=p_customer) and (p_visit is null or v.id=p_visit) and (p_tech is null or v.technician_id=p_tech)
 and (p_from is null or v.completed_at >= (p_from::timestamp at time zone coalesce(v.snapshot->>'service_timezone','America/New_York')))
 and (coalesce(p_query,'')='' or position(lower(left(p_query,100)) in lower(v.snapshot::text))>0)
 and (p_status='all' or exists(select 1 from public.email_delivery_logs e where e.visit_id=v.id and e.status=p_status))
 order by v.completed_at desc,v.id limit least(greatest(p_limit,1),51) offset least(greatest(p_offset,0),1000000);
$$;

-- Customer pause cancellation follows each property-local service day.
create or replace function public.customer_service_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid;begin
 if (new.status,new.archived_at) is not distinct from (old.status,old.archived_at) then return new;end if;
 if new.status<>'active' or new.archived_at is not null then
  update public.route_stops s set status='skipped',cancellation_reason='customer_inactive',updated_at=now() from public.properties p where s.property_id=p.id and p.customer_id=new.id and s.status in ('pending','in_progress') and s.service_date >= (now() at time zone p.service_timezone)::date;
 end if;
 for sid in select sc.id from public.recurring_schedules sc join public.properties p on p.id=sc.property_id where p.customer_id=new.id loop perform public.reconcile_schedule(sid);end loop;
 return new;
end $$;
