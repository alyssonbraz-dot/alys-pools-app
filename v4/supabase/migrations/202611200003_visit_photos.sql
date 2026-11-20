-- A completed V4 visit has at most one immutable service photograph.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('v4-visit-photos', 'v4-visit-photos', false, 2097152, array['image/jpeg']);

-- These subqueries use the caller's RLS on both visits and assigned route stops.
-- Comparing to the entire path also rules out alternative names for the same visit.
create policy v4_read_visit_photo on storage.objects for select to authenticated
using (bucket_id = 'v4-visit-photos' and exists (
  select 1 from public.visits v join public.route_stops s on s.id = v.stop_id
  where s.technician_id = (select auth.uid())
    and s.organization_id::text || '/' || v.id::text || '.jpg' = storage.objects.name
));

create policy v4_add_visit_photo on storage.objects for insert to authenticated
with check (bucket_id = 'v4-visit-photos' and exists (
  select 1 from public.visits v join public.route_stops s on s.id = v.stop_id
  where s.technician_id = (select auth.uid())
    and s.organization_id::text || '/' || v.id::text || '.jpg' = storage.objects.name
));
