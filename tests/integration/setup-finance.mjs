// Isolated fictional finance tenant, exclusively on localhost. No email or remote services.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
try {
  process.loadEnvFile(".env.local");
} catch {}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Local Supabase required.");
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function must(p) {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
const org = randomUUID(),
  password = randomUUID() + "aA1!",
  email = `finance-${randomUUID()}@example.test`,
  techEmail = `tech-${randomUUID()}@example.test`;
const { user } = await must(
  db.auth.admin.createUser({ email, password, email_confirm: true }),
);
const { user: tech } = await must(
  db.auth.admin.createUser({ email: techEmail, password, email_confirm: true }),
);
await must(
  db
    .from("organizations")
    .insert({ id: org, name: "ALYS Finance Demo · Fictional" }),
);
await must(
  db.from("profiles").insert([
    {
      id: user.id,
      organization_id: org,
      role: "owner",
      display_name: "Demo Owner",
    },
    {
      id: tech.id,
      organization_id: org,
      role: "technician",
      display_name: "Demo Technician",
    },
  ]),
);
const month = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/New_York" })
    .format(new Date())
    .slice(0, 7),
  pools = [],
  customers = [];
for (const [i, name] of [
  "Sample Harbor",
  "Sample Palms",
  "Sample Bay",
].entries()) {
  const customer = randomUUID(),
    property = randomUUID(),
    pool = randomUUID();
  customers.push(customer);
  pools.push(pool);
  await must(
    db
      .from("customers")
      .insert({
        id: customer,
        organization_id: org,
        name,
        email: `sample-${i}@example.test`,
      }),
  );
  await must(
    db
      .from("properties")
      .insert({
        id: property,
        organization_id: org,
        customer_id: customer,
        address: `${100 + i} Fictional Court, FL`,
        name: "Demonstration only",
      }),
  );
  await must(
    db
      .from("pools")
      .insert({
        id: pool,
        organization_id: org,
        property_id: property,
        name: "Pool " + (i + 1),
        gallons: 14000,
        water_type: "chlorine",
        type: "residential",
        photo_required: false,
      }),
  );
  await must(
    db
      .from("contracts")
      .insert({
        organization_id: org,
        customer_id: customer,
        source: "own",
        billing_model: "monthly",
        price_cents: 14000 + i * 4000,
      }),
  );
  const schedule = await must(
    db
      .from("recurring_schedules")
      .insert({
        organization_id: org,
        property_id: property,
        technician_id: tech.id,
        days_of_week: [1],
        start_on: month + "-01",
      })
      .select("id")
      .single(),
  );
  let count = 0;
  for (let day = 1; day <= 28; day++) {
    const date = month + "-" + String(day).padStart(2, "0");
    if (new Date(date + "T12:00:00Z").getUTCDay() !== 1) continue;
    const stop = await must(
      db
        .from("route_stops")
        .insert({
          organization_id: org,
          property_id: property,
          technician_id: tech.id,
          service_date: date,
          status: "completed",
          schedule_id: schedule.id,
        })
        .select("id")
        .single(),
    );
    await must(
      db
        .from("visits")
        .insert({
          id: randomUUID(),
          organization_id: org,
          route_stop_id: stop.id,
          technician_id: tech.id,
          completed_at: date + "T16:00:00Z",
          snapshot: {
            customer_name: name,
            property_name: "Demonstration",
            notes: "",
            pools: [
              {
                pool_id: pool,
                pool_name: "Pool " + (i + 1),
                tasks: [],
                readings: { fc: 3, ph: 7.4 },
                dosages: [],
              },
            ],
          },
        }),
    );
    if (++count === 2) break;
  }
}
await writeFile(
  "/tmp/alys-finance-fixture.json",
  JSON.stringify({
    url,
    email,
    password,
    techEmail,
    org,
    userId: user.id,
    techId: tech.id,
    month,
    pools,
    customers,
  }),
  { mode: 0o600 },
);
console.log("Isolated local finance fixtures created; secrets kept in /tmp.");
