-- Read-only, bounded, tenant-authorized chemistry ledger. Old snapshots remain unchanged.
create function public.chemistry_ledger(p_property uuid,p_days integer default 30,p_offset integer default 0,p_pool uuid default null)
returns table(visit_id uuid,pool_id uuid,pool_name text,completed_at timestamptz,readings jsonb,dosages jsonb,technician_name text,can_view_visit boolean,reference_ranges jsonb)
language plpgsql stable security definer set search_path='' as $$
declare tz text;begin
 if not public.can_access_property(p_property) then raise exception 'Property access denied' using errcode='42501';end if;
 if p_days is not null and p_days not in (7,30,90) or p_offset not between 0 and 1000000 then raise exception 'Invalid page' using errcode='22023';end if;
 select service_timezone into tz from public.properties where id=p_property;
 return query select v.id,r.pool_id,coalesce((select item->>'pool_name' from jsonb_array_elements(v.snapshot->'pools') item where item->>'pool_id'=r.pool_id::text),po.name),v.completed_at,
 jsonb_strip_nulls(jsonb_build_object('fc',r.fc,'tc',r.tc,'cc',r.cc,'ph',r.ph,'ta',r.ta,'ch',r.ch,'cya',r.cya,'salt',r.salt,'temperature_f',r.temperature_f)),
 coalesce((select jsonb_agg(jsonb_build_object('product',d.product,'quantity',d.quantity,'unit',d.unit) order by d.id) from public.chemical_dosages d where d.visit_id=v.id and d.pool_id=r.pool_id),'[]'::jsonb),
 person.display_name,public.can_access_visit(v.id),po.reference_ranges
 from public.visits v join public.route_stops s on s.id=v.route_stop_id join public.chemical_readings r on r.visit_id=v.id join public.pools po on po.id=r.pool_id join public.profiles person on person.id=v.technician_id
 where s.property_id=p_property and (p_pool is null or r.pool_id=p_pool)
 and (p_days is null or v.completed_at >= (((now() at time zone tz)::date-p_days+1)::timestamp at time zone tz))
 order by v.completed_at desc,v.id,r.pool_id limit 51 offset p_offset;
end $$;
revoke all on function public.chemistry_ledger(uuid,integer,integer,uuid) from public,anon;
grant execute on function public.chemistry_ledger(uuid,integer,integer,uuid) to authenticated;
create function public.search_visits_v2(p_query text default '',p_status text default 'all',p_customer uuid default null,p_offset integer default 0,p_limit integer default 51,p_from date default null,p_tech uuid default null,p_visit uuid default null)
returns setof public.visits language sql stable security invoker set search_path='' as $$
 select v.* from public.visits v where (p_customer is null or v.customer_id=p_customer) and (p_visit is null or v.id=p_visit) and (p_tech is null or v.technician_id=p_tech)
 and (p_from is null or v.completed_at >= (p_from::timestamp at time zone 'America/New_York'))
 and (coalesce(p_query,'')='' or position(lower(left(p_query,100)) in lower(v.snapshot::text))>0)
 and (p_status='all' or exists(select 1 from public.email_delivery_logs e where e.visit_id=v.id and e.status=p_status))
 order by v.completed_at desc,v.id limit least(greatest(p_limit,1),51) offset least(greatest(p_offset,0),1000000);
$$;
revoke all on function public.search_visits_v2(text,text,uuid,integer,integer,date,uuid,uuid) from public,anon;
grant execute on function public.search_visits_v2(text,text,uuid,integer,integer,date,uuid,uuid) to authenticated;
create function public.owner_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid;today date:=(now() at time zone 'America/New_York')::date;begin
 select organization_id into org from public.profiles where id=auth.uid() and role='owner' and access_state='active';
 if org is null then raise exception 'Owner required' using errcode='42501';end if;
 return jsonb_build_object(
 'scheduled',(select count(*) from public.route_stops where organization_id=org and service_date=today and not(status='skipped' and cancellation_reason is not null)),
 'completed',(select count(*) from public.route_stops where organization_id=org and service_date=today and status='completed'),
 'remaining',(select count(*) from public.route_stops where organization_id=org and service_date=today and status in ('pending','in_progress')),
 'technicians',(select count(*) from public.profiles where organization_id=org and role='technician' and access_state='active'),
 'customers',(select count(*) from public.customers where organization_id=org and status='active' and archived_at is null),
 'properties',(select count(*) from public.properties p join public.customers c on c.id=p.customer_id where p.organization_id=org and c.status='active' and c.archived_at is null),
 'pools',(select count(*) from public.pools p join public.properties pr on pr.id=p.property_id join public.customers c on c.id=pr.customer_id where p.organization_id=org and p.status='active' and c.status='active' and c.archived_at is null),
 'mrr_cents',(select coalesce(sum(a.price_cents),0) from public.contracts a join public.customers c on c.id=a.customer_id where a.organization_id=org and a.source='own' and a.billing_model='monthly' and a.status='active' and c.status='active' and c.archived_at is null and exists(select 1 from public.properties p join public.recurring_schedules sc on sc.property_id=p.id where p.customer_id=c.id and sc.active and sc.start_on<=today and (sc.end_on is null or sc.end_on>=today))),
 'new_customers',(select count(*) from public.customers where organization_id=org and created_at>=now()-interval '30 days' and archived_at is null),
 'pending_reports',(select count(*) from public.email_delivery_logs where organization_id=org and status='pending'),
 'failed_reports',(select count(*) from public.email_delivery_logs where organization_id=org and status='failed'),
 'missing_coordinates',(select count(*) from public.properties where organization_id=org and latitude is null),
 'issues',(select count(*) from public.visit_issue_flags f join public.visits v on v.id=f.visit_id where f.organization_id=org and v.completed_at>=now()-interval '7 days' and cardinality(f.flags)>0),
 'overdue',(select count(*) from public.route_stops where organization_id=org and service_date<today and status in ('pending','in_progress')));
end $$;
revoke all on function public.owner_overview() from public,anon;
grant execute on function public.owner_overview() to authenticated;
