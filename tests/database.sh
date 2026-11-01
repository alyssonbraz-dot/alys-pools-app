#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
name="alys-rls-${RANDOM}-${RANDOM}"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
# Disposable local container: no ports, volumes or real customer data.
docker run -d --name "$name" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
ready=false
for attempt in {1..60}; do
  if docker exec "$name" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then ready=true;break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then echo 'Disposable PostgreSQL did not become ready' >&2; exit 1; fi
docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon,service_role;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,service_role;
grant select,insert on storage.objects to authenticated;
grant all on all tables in schema public,storage to service_role;
-- Match Supabase service-role defaults for tables created by migrations.
alter default privileges in schema public grant all on tables to service_role;
SQL
docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres < supabase/migrations/202610230001_foundation.sql
docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres < supabase/tests/rls.sql
for migration in supabase/migrations/*.sql; do
  if [[ "${ALYS_TEST_V1_BRIDGE:-0}" == 1 && "$migration" == *202610310026_profitability.sql ]]; then
    docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres < tests/fixtures/profitability-v1-schema.sql
    docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres <<'V3SEED'
insert into public.organizations(id,name) values('37000000-0000-4000-8000-000000000001','Fictional pre-bridge V1');
insert into public.customers(id,organization_id,name) values('37000000-0000-4000-8000-000000000002','37000000-0000-4000-8000-000000000001','Fictional existing V1 customer');
insert into public.customer_profit_costs(customer_id,organization_id,technician_cost_per_visit_cents,chemicals_per_visit_cents,monthly_overhead_cents) values('37000000-0000-4000-8000-000000000002','37000000-0000-4000-8000-000000000001',2800,123,789);
V3SEED
    continue
  fi
  if [[ "$migration" != *202610230001_foundation.sql ]]; then
    docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres < "$migration"
  fi
done
for suite in supabase/tests/*.sql; do
  if [[ "$suite" != *rls.sql ]]; then
    docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres < "$suite"
  fi
done
