#!/usr/bin/env bash
# Start the independent V4 project with a local demo account and production Next build.
set -euo pipefail

cd "$(dirname "$0")"
if [[ -n "${SUPABASE_CLI:-}" ]]; then
  cli=$SUPABASE_CLI
elif [[ -x /workspace/.alys-tools/node_modules/.bin/supabase ]]; then
  cli=/workspace/.alys-tools/node_modules/.bin/supabase
else
  cli=supabase
fi
export SUPABASE_CLI="$cli"
export SUPABASE_TELEMETRY_DISABLED=1
export SUPABASE_USE_SLIM_IMAGES=1
export SUPABASE_CONFIG_DIR="${SUPABASE_CONFIG_DIR:-${TMPDIR:-/tmp}/alys-supabase-config}"
export SUPABASE_INTERNAL_IMAGE_REGISTRY="${SUPABASE_INTERNAL_IMAGE_REGISTRY:-ghcr.io}"
export NEXT_TELEMETRY_DISABLED=1
export PORT="${PORT:-3004}"

docker info >/dev/null
"$cli" --version >/dev/null
# In Codex Cloud the built-in wget probes attempt to proxy loopback requests.
if ! "$cli" start --ignore-health-check \
  -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor >/dev/null 2>&1; then
  echo 'Could not start the local V4 project. Check Docker and availability of ports 55321 and 55322.' >&2
  exit 1
fi
docker exec supabase_db_alys-v4 pg_isready -U postgres
docker exec supabase_auth_alys-v4 wget -Y off -q --spider http://127.0.0.1:9999/health
docker exec supabase_storage_alys-v4 wget -Y off -q --spider http://127.0.0.1:5000/status
"$cli" migration up --local
node seed-local.mjs

# Only the local public key is needed by the app.
export V4_SUPABASE_URL=http://127.0.0.1:55321
V4_SUPABASE_PUBLISHABLE_KEY=$("$cli" status -o json 2>/dev/null | node --input-type=module -e '
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  const status = JSON.parse(data);
  if (status.API_URL !== process.env.V4_SUPABASE_URL || !status.PUBLISHABLE_KEY) {
    throw new Error("Expected the local V4 project");
  }
  process.stdout.write(status.PUBLISHABLE_KEY);
')
export V4_SUPABASE_PUBLISHABLE_KEY
cd ..
npm run build
exec npm start
