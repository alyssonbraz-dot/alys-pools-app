-- Assigned technicians need the pool's chemical context even if another technician
-- performed the prior visit. Expose only measurements and dosages, never notes/photos/contact.
create function public.route_chemistry_history(p_property_ids uuid[],p_from date,p_through date)
returns table(visit_id uuid,pool_id uuid,completed_at timestamptz,readings jsonb,dosages jsonb)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Not authorized' using errcode='42501';end if;
 if p_from is null or p_through is null or p_through<p_from or p_through-p_from>30 or cardinality(p_property_ids)>300 then
  raise exception 'Invalid history window' using errcode='22023';
 end if;
 return query
 select v.id,r.pool_id,v.completed_at,
 jsonb_strip_nulls(jsonb_build_object('fc',r.fc,'ph',r.ph,'ta',r.ta,'cya',r.cya,'ch',r.ch,'salt',r.salt,'cc',r.cc)),
 coalesce((select jsonb_agg(jsonb_build_object('product',d.product,'quantity',d.quantity,'unit',d.unit) order by d.id)
           from public.chemical_dosages d where d.visit_id=v.id and d.pool_id=r.pool_id),'[]'::jsonb)
 from public.visits v join public.route_stops s on s.id=v.route_stop_id
 join public.chemical_readings r on r.visit_id=v.id
 where s.property_id=any(p_property_ids) and public.can_access_property(s.property_id)
 and v.completed_at >= (p_from::timestamp at time zone 'America/New_York')
 and v.completed_at < ((p_through+1)::timestamp at time zone 'America/New_York')
 order by v.completed_at desc,v.id,r.pool_id;
end $$;
revoke all on function public.route_chemistry_history(uuid[],date,date) from public,anon;
grant execute on function public.route_chemistry_history(uuid[],date,date) to authenticated;
create index chemical_dosage_history on public.chemical_dosages(visit_id,pool_id);
