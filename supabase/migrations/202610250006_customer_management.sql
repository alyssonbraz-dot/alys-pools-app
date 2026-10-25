alter table public.customers drop constraint customers_status_check;
alter table public.customers add constraint customers_status_check check(status in ('lead','active','inactive'));
alter table public.customers add column first_name text not null default '' check(length(first_name)<=100),
 add column last_name text not null default '' check(length(last_name)<=100),
 add column service_frequency integer not null default 1 check(service_frequency between 1 and 7),
 add column assigned_technician_id uuid, add column archived_at timestamptz,
 add constraint customer_technician_tenant foreign key(organization_id,assigned_technician_id) references public.profiles(organization_id,id);
update public.customers set first_name=split_part(name,' ',1),last_name=case when position(' ' in name)>0 then substring(name from position(' ' in name)+1) else '' end;
alter table public.properties add column latitude double precision check(latitude between -90 and 90),add column longitude double precision check(longitude between -180 and 180),
 add constraint property_coordinate_pair check((latitude is null)=(longitude is null));
create table public.customer_details(
 customer_id uuid primary key,organization_id uuid not null,
 billing_address text not null default '' check(length(billing_address)<=500),
 monthly_price_cents bigint not null default 0 check(monthly_price_cents between 0 and 100000000),
 internal_notes text not null default '' check(length(internal_notes)<=3000),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
create table public.customer_tags(
 organization_id uuid not null,customer_id uuid not null,tag text not null check(length(trim(tag)) between 1 and 30),
 primary key(customer_id,tag),foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
create table public.customer_invitations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,customer_id uuid not null,
 recipient text not null,state text not null default 'pending' check(state in ('pending','sent','failed')),
 requested_at timestamptz not null default now(),sent_at timestamptz,error text,
 unique(customer_id,recipient),foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
do $$ declare t text;begin
 foreach t in array array['customer_details','customer_tags','customer_invitations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy management_read on public.%I for select to authenticated using(public.is_manager(organization_id))',t);
 end loop;
end $$;
create function public.save_customer_profile(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles; cid uuid; pid uuid; full_name text; tag text; tech uuid;lat double precision;lng double precision;begin
 select * into actor from public.profiles where id=auth.uid();
 if not found or actor.role not in ('owner','admin') then raise exception 'Manager required' using errcode='42501';end if;
 if p_payload is null or octet_length(p_payload::text)>12000 then raise exception 'Invalid customer' using errcode='22023';end if;
 full_name:=trim(concat_ws(' ',nullif(trim(p_payload->>'first_name'),''),nullif(trim(p_payload->>'last_name'),'')));
 if length(full_name) not between 2 and 100 or p_payload->>'status' not in ('lead','active','inactive') then raise exception 'Invalid customer name or status' using errcode='22023';end if;
 if length(coalesce(p_payload->>'email',''))>254 or length(coalesce(p_payload->>'phone',''))>30 or length(coalesce(p_payload->>'service_address','')) not between 5 and 300 then raise exception 'Invalid contact/address' using errcode='22023';end if;
 if coalesce((p_payload->>'email_reports_enabled')::boolean,false) and coalesce(p_payload->>'email','')!~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Report email required' using errcode='22023';end if;
 tech:=nullif(p_payload->>'assigned_technician_id','')::uuid;
 if tech is not null and not exists(select 1 from public.profiles where id=tech and organization_id=actor.organization_id and role in ('owner','admin','technician')) then raise exception 'Invalid technician' using errcode='42501';end if;
 cid:=nullif(p_payload->>'id','')::uuid;
 if cid is not null then
  if not exists(select 1 from public.customers where id=cid and organization_id=actor.organization_id and archived_at is null for update) then raise exception 'Customer not found' using errcode='42501';end if;
  update public.customers set name=full_name,first_name=trim(p_payload->>'first_name'),last_name=trim(coalesce(p_payload->>'last_name','')),email=coalesce(p_payload->>'email',''),phone=coalesce(p_payload->>'phone',''),status=p_payload->>'status',service_frequency=(p_payload->>'service_frequency')::integer,assigned_technician_id=tech,email_reports_enabled=coalesce((p_payload->>'email_reports_enabled')::boolean,false) where id=cid;
 else
  insert into public.customers(organization_id,name,first_name,last_name,email,phone,status,service_frequency,assigned_technician_id,email_reports_enabled)
  values(actor.organization_id,full_name,trim(p_payload->>'first_name'),trim(coalesce(p_payload->>'last_name','')),coalesce(p_payload->>'email',''),coalesce(p_payload->>'phone',''),p_payload->>'status',(p_payload->>'service_frequency')::integer,tech,coalesce((p_payload->>'email_reports_enabled')::boolean,false)) returning id into cid;
 end if;
 insert into public.customer_details(organization_id,customer_id,billing_address,monthly_price_cents,internal_notes) values(actor.organization_id,cid,coalesce(p_payload->>'billing_address',''),coalesce((p_payload->>'monthly_price_cents')::bigint,0),coalesce(p_payload->>'internal_notes',''))
 on conflict(customer_id) do update set billing_address=excluded.billing_address,monthly_price_cents=excluded.monthly_price_cents,internal_notes=excluded.internal_notes;
 if jsonb_typeof(p_payload->'tags') is distinct from 'array' or jsonb_array_length(p_payload->'tags')>20 then raise exception 'Invalid tags' using errcode='22023';end if;
 delete from public.customer_tags where customer_id=cid;
 for tag in select distinct lower(trim(value)) from jsonb_array_elements_text(p_payload->'tags') loop
  insert into public.customer_tags values(actor.organization_id,cid,tag);
 end loop;
 lat:=nullif(p_payload->>'latitude','')::double precision;lng:=nullif(p_payload->>'longitude','')::double precision;
 pid:=nullif(p_payload->>'property_id','')::uuid;
 if pid is not null then
  update public.properties set name=coalesce(p_payload->>'property_name',''),address=p_payload->>'service_address',latitude=lat,longitude=lng where id=pid and customer_id=cid and organization_id=actor.organization_id;
  if not found then raise exception 'Invalid property' using errcode='42501';end if;
 else
  insert into public.properties(organization_id,customer_id,name,address,latitude,longitude) values(actor.organization_id,cid,coalesce(p_payload->>'property_name',full_name),p_payload->>'service_address',lat,lng);
 end if;
 return cid;
end $$;
create function public.bulk_customers(p_ids uuid[],p_action text,p_value text default '') returns integer language plpgsql security definer set search_path='' as $$
declare actor public.profiles;n integer;tech uuid;begin
 select * into actor from public.profiles where id=auth.uid();
 if not found or actor.role not in ('owner','admin') then raise exception 'Manager required' using errcode='42501';end if;
 if coalesce(cardinality(p_ids),0) not between 1 and 200 or (select count(distinct x) from unnest(p_ids) x)<>cardinality(p_ids) then raise exception 'Select 1..200 distinct customers' using errcode='22023';end if;
 perform 1 from public.customers where id=any(p_ids) and organization_id=actor.organization_id and archived_at is null for update;
 if (select count(*) from public.customers where id=any(p_ids) and organization_id=actor.organization_id and archived_at is null)<>cardinality(p_ids) then raise exception 'Customer access denied' using errcode='42501';end if;
 if p_action='status' then
  if p_value not in ('lead','active','inactive') then raise exception 'Invalid status' using errcode='22023';end if;
  update public.customers set status=p_value where id=any(p_ids);
 elsif p_action in ('add_tag','remove_tag') then
  if length(trim(p_value)) not between 1 and 30 then raise exception 'Invalid tag' using errcode='22023';end if;
  if p_action='add_tag' then insert into public.customer_tags select actor.organization_id,id,lower(trim(p_value)) from unnest(p_ids) id on conflict do nothing;
  else delete from public.customer_tags where customer_id=any(p_ids) and tag=lower(trim(p_value));end if;
 elsif p_action='assign' then
  tech:=nullif(p_value,'')::uuid;
  if tech is not null and not exists(select 1 from public.profiles where id=tech and organization_id=actor.organization_id and role in ('owner','admin','technician')) then raise exception 'Invalid technician' using errcode='42501';end if;
  update public.customers set assigned_technician_id=tech where id=any(p_ids);
 elsif p_action='archive' then
  update public.customers set status='inactive',archived_at=now() where id=any(p_ids);
 else raise exception 'Unknown bulk action' using errcode='22023';end if;
 n:=cardinality(p_ids);return n;
end $$;
create function public.claim_customer_invitation(p_customer_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.customers;job public.customer_invitations;begin
 select * into c from public.customers where id=p_customer_id for update;
 if not found or not public.is_manager(c.organization_id) then raise exception 'Access denied' using errcode='42501';end if;
 if c.archived_at is not null or c.email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Valid email required' using errcode='22023';end if;
 insert into public.customer_invitations(organization_id,customer_id,recipient) values(c.organization_id,c.id,c.email) on conflict do nothing returning * into job;
 if not found then return jsonb_build_object('claimed',false);end if;
 return jsonb_build_object('claimed',true,'id',job.id,'email',job.recipient);
end $$;
revoke all on function public.save_customer_profile(jsonb),public.bulk_customers(uuid[],text,text),public.claim_customer_invitation(uuid) from public,anon;
grant execute on function public.save_customer_profile(jsonb),public.bulk_customers(uuid[],text,text),public.claim_customer_invitation(uuid) to authenticated;
-- Reuse the existing append-only audit pipeline for portfolio changes; private details remain manager-only.
create function public.audit_customer_detail() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.audit_log(organization_id,actor_id,entity,record_id,operation,old_data,new_data) values(new.organization_id,auth.uid(),tg_table_name,new.customer_id,tg_op,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));return new;end $$;
revoke all on function public.audit_customer_detail() from public;
create trigger audit_details after insert or update on public.customer_details for each row execute function public.audit_customer_detail();
