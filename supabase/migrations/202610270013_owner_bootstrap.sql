-- Trusted provisioning only; no signup metadata can create an organization or owner role.
create function public.bootstrap_owner(p_owner uuid,p_company text,p_display_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid;existing public.profiles;begin
 if p_owner is null or length(trim(p_company)) not between 2 and 100 or length(trim(p_display_name)) not between 2 and 100 then raise exception 'Invalid owner details' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':bootstrap',0));
 select * into existing from public.profiles where id=p_owner;
 if found then
  if existing.role<>'owner' or not exists(select 1 from public.organizations where id=existing.organization_id and name=trim(p_company)) then raise exception 'Existing membership does not match this owner setup' using errcode='42501';end if;
  return existing.organization_id;
 end if;
 insert into public.organizations(name) values(trim(p_company)) returning id into org;
 insert into public.profiles(id,organization_id,role,display_name) values(p_owner,org,'owner',trim(p_display_name));
 return org;
end $$;
revoke all on function public.bootstrap_owner(uuid,text,text) from public,anon,authenticated;
grant execute on function public.bootstrap_owner(uuid,text,text) to service_role;
