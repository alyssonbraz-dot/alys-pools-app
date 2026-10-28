-- Optional body-level photo association. Existing photos and requirements are preserved.
create table public.visit_photo_bodies(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,visit_id uuid not null,storage_path text not null unique,pool_id uuid not null,
 foreign key(organization_id,visit_id) references public.visits(organization_id,id),
 foreign key(organization_id,pool_id) references public.pools(organization_id,id),
 foreign key(storage_path) references public.visit_photos(storage_path)
);
alter table public.visit_photo_bodies enable row level security;
revoke all on public.visit_photo_bodies from public,anon,authenticated;
grant select on public.visit_photo_bodies to authenticated,service_role;
create policy photo_body_read on public.visit_photo_bodies for select to authenticated using(public.can_access_visit(visit_id));
create trigger photo_body_immutable before update or delete on public.visit_photo_bodies for each row execute function public.reject_service_change();
alter function public.complete_visit(jsonb) rename to complete_visit_with_flags;
revoke all on function public.complete_visit_with_flags(jsonb) from public,anon,authenticated;
create function public.complete_visit(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.route_stops;result jsonb;item record;po public.pools;mapping jsonb:=coalesce(p_payload->'photo_assignments','{}');begin
 select * into s from public.route_stops where id=(p_payload->>'stop_id')::uuid for update;
 if not found or not public.can_access_stop(s.id) then raise exception 'Access denied' using errcode='42501';end if;
 if jsonb_typeof(mapping)<>'object' then raise exception 'Invalid photo mapping' using errcode='22023';end if;
 if not exists(select 1 from public.visits where id=(p_payload->>'id')::uuid and route_stop_id=s.id) then
 for item in select key,value from jsonb_each_text(mapping) loop
 if not (coalesce(p_payload->'photo_paths','[]') ? item.key) or not exists(select 1 from public.pools where id=item.value::uuid and property_id=s.property_id) then raise exception 'Invalid photo body' using errcode='22023';end if;
 end loop;
 for po in select * from public.pools where property_id=s.property_id and status='active' and photo_required and photo_scope_required loop
 if not exists(select 1 from jsonb_each_text(mapping) where value=po.id::text) then raise exception 'Photo required for each configured body' using errcode='22023';end if;
 end loop;
 end if;
 result:=public.complete_visit_with_flags(p_payload-'photo_assignments');
 if not (result->>'already_completed')::boolean then
 insert into public.visit_photo_bodies(organization_id,visit_id,storage_path,pool_id) select s.organization_id,(result->>'visit_id')::uuid,key,value::uuid from jsonb_each_text(mapping);
 end if;return result;
end $$;
revoke all on function public.complete_visit(jsonb) from public,anon;
grant execute on function public.complete_visit(jsonb) to authenticated;
