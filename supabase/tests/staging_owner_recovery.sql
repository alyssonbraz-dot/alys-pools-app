begin;
insert into auth.users(id,email) values
 ('49000000-0000-4000-8000-000000000001','recover-owner@example.test'),
 ('49000000-0000-4000-8000-000000000002','tech-recovery@example.test'),
 ('49000000-0000-4000-8000-000000000003','backup-owner@example.test');
insert into public.organizations(id,name) values
 ('49000000-0000-4000-8000-000000000010','Fictional Recovery Company'),
 ('49000000-0000-4000-8000-000000000011','Fictional Other Company');
insert into public.profiles(id,organization_id,role,access_state,display_name) values
 ('49000000-0000-4000-8000-000000000002','49000000-0000-4000-8000-000000000010','technician','active','Fictional Tech'),
 ('49000000-0000-4000-8000-000000000003','49000000-0000-4000-8000-000000000010','owner','active','Fictional Backup Owner');
select set_config('alys.owner_recovery',jsonb_build_object(
 'confirmation','I_VERIFIED_SEPARATE_STAGING_AND_ADMIN_AUTHORITY',
 'user_id','49000000-0000-4000-8000-000000000001','email','recover-owner@example.test',
 'organization_id','49000000-0000-4000-8000-000000000010','organization_name','Fictional Recovery Company',
 'expected_role','missing','expected_access_state','missing','display_name','Fictional Recovered Owner',
 'reason','Fixture administrator approval')::text,true);
set local role anon;
do $$ begin
 begin execute current_setting('alys.test.owner_recovery_sql');raise exception 'Anon recovery allowed';exception when insufficient_privilege then null;end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','49000000-0000-4000-8000-000000000001',true);
do $$ begin
 if exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'Auth-only user got a profile';end if;
 begin execute current_setting('alys.test.owner_recovery_sql');raise exception 'Self-promotion allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ declare cfg jsonb:=current_setting('alys.owner_recovery')::jsonb; n bigint;begin
 -- Exact Auth identity and organization pairing, fail closed.
 for n in 1..3 loop
  perform set_config('alys.owner_recovery',(cfg||case n
   when 1 then '{"email":"wrong@example.test"}'::jsonb
   when 2 then '{"organization_name":"Wrong Company"}'::jsonb
   else '{"organization_id":"49000000-0000-4000-8000-000000000099"}'::jsonb end)::text,true);
  begin execute current_setting('alys.test.owner_recovery_sql');raise exception 'Wrong identity/org allowed';exception when insufficient_privilege then null;end;
 end loop;
 perform set_config('alys.owner_recovery',(cfg||'{"confirmation":"UNCONFIRMED"}'::jsonb)::text,true);
 begin execute current_setting('alys.test.owner_recovery_sql');raise exception 'Unconfirmed admin allowed';exception when invalid_parameter_value then null;end;
 perform set_config('alys.owner_recovery',cfg::text,true);
 select count(*) into n from public.organizations;
 execute current_setting('alys.test.owner_recovery_sql');
 execute current_setting('alys.test.owner_recovery_sql');
 if n<>(select count(*) from public.organizations) then raise exception 'Recovery created organization';end if;
 if (select count(*) from auth.users where email='recover-owner@example.test')<>1 then raise exception 'Auth user duplicated';end if;
 if (select count(*) from public.audit_log where entity='staging_owner_recovery' and record_id='49000000-0000-4000-8000-000000000001')<>1 then raise exception 'Recovery audit missing or repeated';end if;
 if not exists(select 1 from public.profiles where id='49000000-0000-4000-8000-000000000001' and role='owner' and access_state='active' and organization_id='49000000-0000-4000-8000-000000000010') then raise exception 'Owner not recovered';end if;
 -- A technician cannot be promoted, and an existing Owner cannot move tenants.
 perform set_config('alys.owner_recovery',(cfg||'{"user_id":"49000000-0000-4000-8000-000000000002","email":"tech-recovery@example.test"}'::jsonb)::text,true);
 begin execute current_setting('alys.test.owner_recovery_sql');raise exception 'Technician promoted';exception when insufficient_privilege then null;end;
 perform set_config('alys.owner_recovery',(cfg||'{"organization_id":"49000000-0000-4000-8000-000000000011","organization_name":"Fictional Other Company"}'::jsonb)::text,true);
 begin execute current_setting('alys.test.owner_recovery_sql');raise exception 'Owner moved tenants';exception when insufficient_privilege then null;end;
 -- Suspended Owner requires an exact reviewed snapshot. Keep original name.
 update public.profiles set access_state='suspended' where id='49000000-0000-4000-8000-000000000001';
 perform set_config('alys.owner_recovery',cfg::text,true);
 begin execute current_setting('alys.test.owner_recovery_sql');raise exception 'Suspension overridden without review';exception when insufficient_privilege then null;end;
 cfg:=cfg||'{"expected_role":"owner","expected_access_state":"suspended","display_name":"Do not replace existing name"}'::jsonb;
 perform set_config('alys.owner_recovery',cfg::text,true);
 execute current_setting('alys.test.owner_recovery_sql');execute current_setting('alys.test.owner_recovery_sql');
 if not exists(select 1 from public.profiles where id='49000000-0000-4000-8000-000000000001' and display_name='Fictional Recovered Owner' and access_state='active') then raise exception 'Owner name/state not preserved';end if;
 -- An invited Owner must still accept their invitation.
 update public.profiles set access_state='invited' where id='49000000-0000-4000-8000-000000000001';
 begin execute current_setting('alys.test.owner_recovery_sql');raise exception 'Invitation bypassed';exception when insufficient_privilege then null;end;
 -- Inactive with an outstanding invitation also remains blocked.
 update public.profiles set access_state='inactive' where id='49000000-0000-4000-8000-000000000001';
 insert into public.team_invitations(id,organization_id,email,display_name,user_id,invited_role)
 values('49000000-0000-4000-8000-000000000020','49000000-0000-4000-8000-000000000010','recover-owner@example.test','Fictional Owner','49000000-0000-4000-8000-000000000001','owner');
 cfg:=cfg||'{"expected_access_state":"inactive"}'::jsonb;perform set_config('alys.owner_recovery',cfg::text,true);
 begin execute current_setting('alys.test.owner_recovery_sql');raise exception 'Outstanding invitation bypassed';exception when insufficient_privilege then null;end;
 update public.team_invitations set state='revoked' where id='49000000-0000-4000-8000-000000000020';
 execute current_setting('alys.test.owner_recovery_sql');
end $$;
set local role authenticated;
do $$ begin
 if not public.is_owner('49000000-0000-4000-8000-000000000010') or not public.is_active_operator() then raise exception 'Recovered Owner not recognized by RLS';end if;
 if public.is_manager('49000000-0000-4000-8000-000000000011') then raise exception 'Recovered Owner crosses tenants';end if;
 begin update public.profiles set role='owner' where id='49000000-0000-4000-8000-000000000002';raise exception 'Browser mutation allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'Staging recovery passed: exact existing Auth/org, repeat-safe, audited, no self-promotion or RLS bypass' as result;
