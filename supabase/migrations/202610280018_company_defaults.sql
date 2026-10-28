create function public.save_company_settings(p_name text,p_settings jsonb) returns void language plpgsql security definer set search_path='' as $$
declare org uuid;begin
 select organization_id into org from public.profiles where id=auth.uid() and role='owner' and access_state='active';
 if org is null then raise exception 'Owner required' using errcode='42501';end if;
 if length(trim(p_name)) not between 2 and 100 or jsonb_typeof(p_settings)<>'object' or octet_length(p_settings::text)>16000 then raise exception 'Invalid settings' using errcode='22023';end if;
 update public.organizations set name=trim(p_name),settings=settings||p_settings where id=org;
end $$;
revoke all on function public.save_company_settings(text,jsonb) from public,anon;
grant execute on function public.save_company_settings(text,jsonb) to authenticated;
