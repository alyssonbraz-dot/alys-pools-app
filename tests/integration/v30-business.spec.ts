import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
try {
  process.loadEnvFile(".env.local");
} catch {}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Local business integration only.");
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let f: {
  email: string;
  password: string;
  techEmail: string;
  month: string;
  org: string;
  userId: string;
  techId: string;
  customers: string[];
  pools: string[];
};
test.beforeAll(() => {
  execFileSync(process.execPath, ["tests/integration/setup-finance.mjs"], {
    stdio: "pipe",
  });
  f = JSON.parse(readFileSync("/tmp/alys-finance-fixture.json", "utf8"));
});
async function login(page: Page, tech = false) {
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(tech ? f.techEmail : f.email);
  await page.getByLabel("Password", { exact: true }).fill(f.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/login/);
}
async function report(page: Page) {
  const r = await page.request.get("/api/contribution?month=" + f.month);
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
async function rate(
  page: Page,
  target: "customer" | "technician",
  id: string,
  value: number | null,
  expected?: string | null,
) {
  const d = await report(page);
  return page.request.post("/api/contribution", {
    headers: { origin: new URL(page.url()).origin },
    data: {
      id: crypto.randomUUID(),
      month: f.month,
      expected: expected === undefined ? d.latest_config_id : expected,
      target,
      target_id: id,
      rate_cents: value,
    },
  });
}
test("Owner delegates without expense setup, overrides one customer and explicitly prices personal labor with immutable completed rates", async ({
  page,
}) => {
  test.setTimeout(120000);
  await login(page);
  await page.goto("/team");
  await expect(page.locator(".business-team-list")).toContainText(
    "Demo Technician",
  );
  await page
    .locator(".business-team-list details")
    .filter({
      has: page.locator("summary").filter({ hasText: "Payment per visit" }),
    })
    .first()
    .locator("summary")
    .first()
    .click();
  await page
    .getByLabel("Default payment per visit", { exact: true })
    .fill("25");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/contribution") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save rate", exact: true }).click();
  expect((await saved).ok()).toBeTruthy();
  let d = await report(page);
  expect(d.report.ownedMrr).toBe(54000);
  expect(d.report.estimatedContribution).not.toBeNull();
  expect(d.report.estimatedContribution).toBe(
    d.report.ownedMrr -
      d.report.customers.reduce(
        (n: number, c: { forecast: { technicianPayments: number } }) =>
          n + c.forecast.technicianPayments,
        0,
      ),
  );
  const old = await admin
    .from("finance_config_versions")
    .select("payload")
    .eq("id", d.latest_config_id)
    .single();
  expect(old.error).toBeNull();
  expect(
    old.data!.payload.costs.every(
      (c: { cents: number | null }) => c.cents === null,
    ),
  ).toBe(true);
  const stale = d.latest_config_id;
  expect(
    (await rate(page, "customer", f.customers[0], 3000)).ok(),
  ).toBeTruthy();
  expect((await rate(page, "technician", f.techId, 2800, stale)).status()).toBe(
    409,
  );
  d = await report(page);
  expect(
    d.report.customers.find((c: { id: string }) => c.id === f.customers[0])
      .forecast.technicianPayments,
  ).toBeGreaterThan(0);
  expect(
    d.report.customers.find((c: { id: string }) => c.id === f.customers[0])
      .completed.technicianPayments,
  ).toBe(5000);
  const prop = (
    await admin
      .from("properties")
      .select("id")
      .eq("customer_id", f.customers[0])
      .single()
  ).data!;
  expect(
    (
      await admin
        .from("recurring_schedules")
        .update({ technician_id: f.userId })
        .eq("property_id", prop.id)
    ).error,
  ).toBeNull();
  d = await report(page);
  const customer = d.report.customers.find(
    (c: { id: string }) => c.id === f.customers[0],
  );
  expect(customer.forecast.contribution).toBeNull();
  expect(customer.forecast.ownerLabor).toBeNull();
  expect((await rate(page, "technician", f.userId, 1000)).ok()).toBeTruthy();
  d = await report(page);
  expect(
    d.report.customers.find((c: { id: string }) => c.id === f.customers[0])
      .forecast.ownerLabor,
  ).toBeGreaterThan(0);
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/New_York",
  }).format(new Date());
  const stop = await admin
    .from("route_stops")
    .insert({
      organization_id: f.org,
      property_id: prop.id,
      technician_id: f.userId,
      service_date: date,
      status: "pending",
    })
    .select("id")
    .single();
  expect(stop.error).toBeNull();
  const payload = {
    id: crypto.randomUUID(),
    stop_id: stop.data!.id,
    notes: "Fictional business labor test",
    photo_paths: [],
    pools: [
      {
        pool_id: f.pools[0],
        tasks: [],
        readings: { fc: 3, ph: 7.4 },
        dosages: [],
      },
    ],
  };
  const completion = await page.request.post("/api/visits", {
    headers: { origin: new URL(page.url()).origin },
    data: payload,
  });
  expect(completion.ok(), await completion.text()).toBeTruthy();
  expect((await rate(page, "technician", f.userId, 1200)).ok()).toBeTruthy();
  d = await report(page);
  expect(
    d.report.customers.find((c: { id: string }) => c.id === f.customers[0])
      .completed.ownerLabor,
  ).toBe(1000);
  expect(
    (await rate(page, "customer", f.customers[1], 2300)).ok(),
  ).toBeTruthy();
  expect(
    (await report(page)).report.customers.find(
      (c: { id: string }) => c.id === f.customers[1],
    ).rate,
  ).toBe(2300);
  expect(
    (await rate(page, "customer", f.customers[1], null)).ok(),
  ).toBeTruthy();
  expect(
    (await report(page)).report.customers.find(
      (c: { id: string }) => c.id === f.customers[1],
    ).rate,
  ).toBe(2500);
  await page.goto("/finance");
  await expect(page.locator(".contribution-results")).toBeVisible();
  await expect(
    page.getByLabel(/Insurance|Gasoline|Chemical cost|Marketing/),
  ).toHaveCount(0);
  expect(
    (await rate(page, "technician", crypto.randomUUID(), 2500)).status(),
  ).toBe(404);
});
test("Technician has only assigned work and cannot read rates, finances, customer lists or team administration", async ({
  page,
}) => {
  await login(page, true);
  for (const path of [
    "/api/contribution?month=" + f.month,
    "/api/finance?month=" + f.month,
    "/api/team",
    "/api/customers",
  ])
    expect((await page.request.get(path)).status()).toBe(403);
  await page.goto("/more");
  await expect(page.locator(".mobile-tabbar a")).toHaveCount(3);
  await expect(page.locator(".business-destinations")).not.toContainText(
    "Profitability",
  );
  await page.goto("/team");
  await expect(page).toHaveURL(/stops/);
  await page.goto("/reports");
  await expect(
    page.getByRole("heading", { name: "Reports", exact: true }),
  ).toBeVisible();
});
