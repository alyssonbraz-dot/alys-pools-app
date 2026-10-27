-- Keep the original validated completion transaction and add immutable, whitelisted issue flags.
create table public.visit_issue_flags(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,visit_id uuid not null unique,
 flags text[] not null check(cardinality(flags)<=5 and flags <@ array['green_pool','equipment_issue','low_water','access_denied','other']::text[] and array_position(flags,null) is null),
 foreign key(organization_id,visit_id) references public.visits(organization_id,id)
);
alter table public.visit_issue_flags enable row level security;
revoke all on public.visit_issue_flags from anon,authenticated;
grant select on public.visit_issue_flags to authenticated;
grant select on public.visit_issue_flags to service_role;
create policy assigned_issue_read on public.visit_issue_flags for select to authenticated using(public.can_access_visit(visit_id));
create trigger immutable_issue_flags before update or delete on public.visit_issue_flags for each row execute function public.reject_service_change();
create trigger audit_issue_flags after insert on public.visit_issue_flags for each row execute function public.audit_change();
alter function public.complete_visit(jsonb) rename to complete_visit_base;
revoke all on function public.complete_visit_base(jsonb) from public,anon,authenticated;
create function public.complete_visit(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;flags text[]:='{}';org uuid;begin
 if p_payload ? 'issue_flags' then
  if jsonb_typeof(p_payload->'issue_flags') is distinct from 'array' or jsonb_array_length(p_payload->'issue_flags')>5 then raise exception 'Invalid issue flags' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'issue_flags') v where jsonb_typeof(v)<>'string' or (v#>>'{}') not in ('green_pool','equipment_issue','low_water','access_denied','other')) then raise exception 'Invalid issue flag' using errcode='22023';end if;
  select coalesce(array_agg(value),'{}') into flags from jsonb_array_elements_text(p_payload->'issue_flags');
  if cardinality(flags)<>(select count(distinct f) from unnest(flags) f) then raise exception 'Duplicate issue flags' using errcode='22023';end if;
 end if;
 result:=public.complete_visit_base(p_payload-'issue_flags');
 if not (result->>'already_completed')::boolean then
  select organization_id into org from public.visits where id=(result->>'visit_id')::uuid;
  insert into public.visit_issue_flags(organization_id,visit_id,flags) values(org,(result->>'visit_id')::uuid,flags);
 end if;
 return result;
end $$;
revoke all on function public.complete_visit(jsonb) from public,anon;
grant execute on function public.complete_visit(jsonb) to authenticated;
