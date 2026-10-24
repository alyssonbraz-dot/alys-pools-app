-- Corrections never rewrite signed-off service facts or silently resend an old email.
create table public.visit_corrections (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id), visit_id uuid not null,
 actor_id uuid not null, note text not null check(length(trim(note)) between 1 and 2000),
 created_at timestamptz not null default now(),
 foreign key(organization_id,visit_id) references public.visits(organization_id,id),
 foreign key(organization_id,actor_id) references public.profiles(organization_id,id)
);
create index correction_history on public.visit_corrections(visit_id,created_at);
alter table public.visit_corrections enable row level security;
revoke all on public.visit_corrections from public,anon,authenticated;
grant select on public.visit_corrections to authenticated;
create policy corrections_read on public.visit_corrections for select to authenticated using(public.can_access_visit(visit_id));
create trigger immutable_correction before update or delete on public.visit_corrections for each row execute function public.reject_service_change();
create trigger audit_correction after insert on public.visit_corrections for each row execute function public.audit_change();
create function public.add_visit_correction(p_visit_id uuid,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; result uuid; begin
 select organization_id into org from public.visits where id=p_visit_id;
 if not found or not public.is_manager(org) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_note is null or length(trim(p_note)) not between 1 and 2000 then raise exception 'A correction note between 1 and 2000 characters is required' using errcode='22023';end if;
 insert into public.visit_corrections(organization_id,visit_id,actor_id,note)
 values(org,p_visit_id,auth.uid(),trim(p_note)) returning id into result;
 return result;
end $$;
revoke all on function public.add_visit_correction(uuid,text) from public;
grant execute on function public.add_visit_correction(uuid,text) to authenticated;
