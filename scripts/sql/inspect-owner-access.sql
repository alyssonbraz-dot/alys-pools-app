-- READ ONLY. Run in the verified staging Supabase SQL Editor.
begin transaction read only;
select set_config('alys.inspect_owner_email','REPLACE_WITH_EXACT_LOGIN_EMAIL',true);

-- No membership row is provisioned by Auth signup. The profile PK is the Auth UUID.
select u.id as auth_user_id,u.email,p.organization_id,p.role,p.access_state,p.display_name,o.name as organization_name
from auth.users u left join public.profiles p on p.id=u.id
left join public.organizations o on o.id=p.organization_id
where lower(u.email)=lower(current_setting('alys.inspect_owner_email'));

select o.id,o.name,o.timezone,count(p.id) filter(where p.role='owner' and p.access_state='active') as active_owners
from public.organizations o left join public.profiles p on p.organization_id=o.id
group by o.id order by o.created_at;

select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public' and table_name in ('profiles','organizations')
order by table_name,ordinal_position;
select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('profiles','organizations');
select tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('profiles','organizations') order by tablename,policyname;
select p.proname,p.prosecdef,p.proacl,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('is_owner','is_manager','is_active_operator','bootstrap_owner');
select i.id,i.organization_id,i.invited_role,i.state,i.expires_at
from public.team_invitations i where lower(i.email)=lower(current_setting('alys.inspect_owner_email'));
-- NULL means migration history was not recorded here; inspect how this database was provisioned.
select to_regclass('supabase_migrations.schema_migrations') as migration_history_table;
commit;
