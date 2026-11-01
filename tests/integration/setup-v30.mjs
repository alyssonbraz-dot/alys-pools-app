// Dedicated fictional business. Never reset a database or reuse production credentials.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
try {
  process.loadEnvFile(".env.local");
} catch {}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Local Supabase only.");
execFileSync(process.execPath, ["tests/integration/setup-finance.mjs"], {
  stdio: "inherit",
});
const f = JSON.parse(await readFile("/tmp/alys-finance-fixture.json", "utf8"));
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function must(p) {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
const date = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/New_York",
}).format(new Date());
const stops = [];
for (const [i, customer] of f.customers.entries()) {
  const p = (
    await must(db.from("properties").select("id").eq("customer_id", customer))
  )[0];
  await must(
    db
      .from("properties")
      .update({
        latitude: 26.14 + i / 100,
        longitude: -80.13 - i / 100,
        location_confirmed: true,
      })
      .eq("id", p.id),
  );
  const schedules = await must(
    db.from("recurring_schedules").select("id").eq("property_id", p.id),
  );
  if (i === 0)
    await must(
      db
        .from("recurring_schedules")
        .update({ technician_id: f.userId })
        .eq("id", schedules[0].id),
    );
  const stop = await must(
    db
      .from("route_stops")
      .insert({
        organization_id: f.org,
        property_id: p.id,
        technician_id: i === 0 ? f.userId : f.techId,
        service_date: date,
        schedule_id: schedules[0].id,
        position: i + 1,
        status: i === 2 ? "completed" : "pending",
      })
      .select("id")
      .single(),
  );
  stops.push(stop.id);
  if (i === 2)
    await must(
      db
        .from("visits")
        .insert({
          id: randomUUID(),
          organization_id: f.org,
          route_stop_id: stop.id,
          technician_id: f.techId,
          snapshot: {
            customer_name: "Sample Bay",
            property_name: "Demonstration",
            notes: "",
            pools: [
              {
                pool_id: f.pools[i],
                pool_name: "Pool 3",
                tasks: [],
                readings: { fc: 3, ph: 7.4 },
                dosages: [],
              },
            ],
          },
        }),
    );
}
await writeFile(
  "/tmp/alys-v30-fixture.json",
  JSON.stringify({ ...f, date, stops }),
  { mode: 0o600 },
);
console.log(
  "V3 isolated solo/delegated fixture ready. Credentials remain in /tmp.",
);
