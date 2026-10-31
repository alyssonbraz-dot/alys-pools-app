import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { emptyConfig, emptyRecords } from "../../src/lib/finance/schema";
try {
  process.loadEnvFile(".env.local");
} catch {}
const fixture = JSON.parse(
  readFileSync("/tmp/alys-finance-fixture.json", "utf8"),
);
if (!["127.0.0.1", "localhost"].includes(new URL(fixture.url).hostname))
  throw new Error("Local finance tests only.");
const admin = createClient(
  fixture.url,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
async function login(page: Page, tech = false) {
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(tech ? fixture.techEmail : fixture.email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/login/);
}
async function financial(page: Page, month = fixture.month) {
  const r = await page.request.get("/api/finance?month=" + month);
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
async function mutate(
  page: Page,
  action: string,
  payload: unknown,
  expected: string | null = null,
  month = fixture.month,
  id = crypto.randomUUID(),
) {
  return page.request.post("/api/finance", {
    headers: { origin: new URL(page.url()).origin },
    data: { action, month, id, payload, expected },
  });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("Owner persists costs/records, closes history immutably and uses all three mobile finance screens", async ({
  page,
}) => {
  test.setTimeout(120000);
  await login(page);
  await page.goto("/finance/costs");
  await expect(
    page.getByRole("heading", { name: "Monthly company costs", exact: true }),
  ).toBeVisible();
  const cfg = emptyConfig();
  cfg.costs.forEach((c, i) => (c.cents = [2000, 0, 3000, 4000, 0][i]));
  cfg.processing_bps = 0;
  cfg.processing_fixed_cents = 0;
  cfg.terms[0].rate_cents = 2500;
  cfg.terms[0].extra_visit_cents = 3000;
  cfg.terms[0].additional_service_cents = 1000;
  // Exercise the actual editable form, including typed decimal quantities.
  for (const c of cfg.costs)
    await page
      .getByLabel(c.label, { exact: true })
      .first()
      .fill((c.cents! / 100).toFixed(2));
  await page.getByLabel("Processing percentage (%)", { exact: true }).fill("0");
  await page.getByLabel("Fixed fee per transaction", { exact: true }).fill("0");
  await page.getByLabel("Base payout", { exact: true }).fill("25");
  await page.getByLabel("Extra visit payout", { exact: true }).fill("30");
  await page
    .getByLabel("Additional service payout", { exact: true })
    .fill("10");
  const save = page.waitForResponse(
    (r) => r.url().endsWith("/api/finance") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Save configuration for this month onward" })
    .click();
  expect((await save).ok()).toBe(true);
  await expect(
    page.getByText("Financial data saved.", { exact: true }),
  ).toBeVisible();
  let data = await financial(page);
  expect(data.report.forecast.revenue).toBe(54000);
  expect(data.report.forecast.technician).toBe(30000);
  expect(data.report.forecast.overhead).toBe(9000);
  expect(data.report.forecast.profit).toBe(15000);
  expect(data.report.recorded.technician).toBe(15000);
  const records = emptyRecords();
  records.company = cfg.costs.map((c) => ({ category: c.id, cents: c.cents }));
  records.receipts = fixture.customers.map((id: string, i: number) => ({
    customer_id: id,
    cents: 14000 + i * 4000,
    transactions: 1,
  }));
  const saved = await mutate(page, "records", records, data.records_id);
  expect(saved.ok(), await saved.text()).toBeTruthy();
  data = await financial(page);
  expect(data.report.recorded.profit).toBe(30000);
  // Full monthly totals are revisions, not additive transactions; replay is idempotent.
  const requestId = crypto.randomUUID();
  expect(
    (
      await mutate(
        page,
        "records",
        records,
        data.records_id,
        fixture.month,
        requestId,
      )
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await mutate(
        page,
        "records",
        records,
        data.records_id,
        fixture.month,
        requestId,
      )
    ).ok(),
  ).toBeTruthy();
  expect((await financial(page)).report.recorded.profit).toBe(30000);
  const forbidden = {
    ...records,
    direct: [
      {
        id: crypto.randomUUID(),
        pool_id: fixture.pools[0],
        category: "chemicals",
        cents: 1000,
        basis: "recorded",
        label: "Technician already pays",
      },
    ],
  };
  const denied = await mutate(
    page,
    "records",
    forbidden,
    (await financial(page)).records_id,
  );
  expect(denied.status()).toBe(400);
  expect((await denied.json()).error).toContain("covered by the technician");
  // Seed a known historical configuration only within this isolated test tenant.
  const previous = new Date(fixture.month + "-01T12:00:00Z");
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const prior = previous.toISOString().slice(0, 7);
  const old = await admin
    .from("finance_config_versions")
    .insert({
      id: crypto.randomUUID(),
      organization_id: fixture.org,
      effective_month: prior + "-01",
      payload: cfg,
      created_by: fixture.userId,
    });
  expect(old.error).toBeNull();
  expect((await mutate(page, "open", null, null, prior)).ok()).toBeTruthy();
  expect(
    (await mutate(page, "records", records, null, prior)).ok(),
  ).toBeTruthy();
  const priorData = await financial(page, prior);
  expect(
    (await mutate(page, "close", null, priorData.records_id, prior)).ok(),
  ).toBeTruthy();
  const closed = await financial(page, prior);
  expect(closed.closed).toBe(true);
  const changed = structuredClone(cfg);
  changed.terms[0].rate_cents = 2700;
  expect(
    (
      await mutate(
        page,
        "config",
        changed,
        (await financial(page)).latest_config_id,
      )
    ).ok(),
  ).toBeTruthy();
  expect((await financial(page, prior)).report).toEqual(closed.report);
  expect((await financial(page)).report.recorded.technician).toBe(15000);
  expect(
    (await mutate(page, "records", records, closed.records_id, prior)).status(),
  ).toBe(400);
  // Restore current-period payout, then capture the real rendered screens.
  expect(
    (
      await mutate(
        page,
        "config",
        cfg,
        (await financial(page)).latest_config_id,
      )
    ).ok(),
  ).toBeTruthy();
  mkdirSync("docs/screenshots/v24", { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, path] of [
    ["business-costs", "/finance/costs"],
    ["pool-profitability", "/finance/pools/" + fixture.pools[0]],
    ["profit-result", "/finance"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator(".finance-context")).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      path: "docs/screenshots/v24/" + name + ".png",
      fullPage: true,
    });
  }
  // Longer translated labels and narrow iPhone widths.
  for (const language of ["pt", "en", "es"]) {
    await page.evaluate((lang) => {
      localStorage.setItem("alys-ui-language", lang);
      dispatchEvent(new Event("storage"));
    }, language);
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      for (const path of [
        "/finance",
        "/finance/costs",
        "/finance/pools/" + fixture.pools[0],
      ]) {
        await page.goto(path);
        await expect(page.locator(".finance-context")).toBeVisible();
        await noOverflow(page);
      }
    }
  }
  await page.evaluate(() => localStorage.setItem("alys-ui-language", "en"));
});

test("Technician cannot see finance in page, API or Supabase RLS; another tenant cannot read it", async ({
  page,
}) => {
  await login(page, true);
  await page.goto("/finance");
  await expect(page).toHaveURL(/stops/);
  expect(
    (await page.request.get("/api/finance?month=" + fixture.month)).status(),
  ).toBe(403);
  expect((await mutate(page, "config", emptyConfig())).status()).toBe(403);
  const client = createClient(
    fixture.url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  expect(
    (
      await client.auth.signInWithPassword({
        email: fixture.techEmail,
        password: fixture.password,
      })
    ).error,
  ).toBeNull();
  for (const table of [
    "finance_config_versions",
    "finance_record_versions",
    "finance_period_sources",
    "finance_closed_periods",
    "finance_visit_terms",
  ]) {
    const result = await client.from(table).select("*");
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  }
  const other = JSON.parse(
    readFileSync("/tmp/alys-integration-fixture.json", "utf8"),
  );
  expect(
    (
      await client.auth.signInWithPassword({
        email: other.otherEmail,
        password: other.otherPassword,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await client
        .from("finance_config_versions")
        .select("id")
        .eq("organization_id", fixture.org)
    ).data,
  ).toEqual([]);
});
