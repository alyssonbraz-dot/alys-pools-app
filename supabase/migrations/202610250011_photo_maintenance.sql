create function public.unused_photo_uploads(p_org uuid) returns table(stop_id uuid,photo_id uuid,path text) language sql stable security definer set search_path='' as $$
 select b.stop_id,b.photo_id,b.organization_id::text||'/'||b.stop_id::text||'/'||b.photo_id::text||'.jpg' from public.photo_upload_budget b join public.route_stops s on s.id=b.stop_id
 where b.organization_id=p_org and b.created_at<now()-interval '14 days' and s.status in ('completed','skipped') and not exists(select 1 from public.visit_photos p where p.storage_path=b.organization_id::text||'/'||b.stop_id::text||'/'||b.photo_id::text||'.jpg');
$$;
create function public.release_unused_photo(p_stop uuid,p_photo uuid) returns void language plpgsql security definer set search_path='' as $$
begin delete from public.photo_upload_budget b using public.route_stops s where b.stop_id=p_stop and b.photo_id=p_photo and s.id=b.stop_id and s.status in ('completed','skipped') and b.created_at<now()-interval '14 days' and not exists(select 1 from public.visit_photos p where p.storage_path=b.organization_id::text||'/'||b.stop_id::text||'/'||b.photo_id::text||'.jpg');end $$;
revoke all on function public.unused_photo_uploads(uuid),public.release_unused_photo(uuid,uuid) from public,anon,authenticated;
grant execute on function public.unused_photo_uploads(uuid),public.release_unused_photo(uuid,uuid) to service_role;
