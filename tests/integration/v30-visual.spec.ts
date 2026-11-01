import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
const f = JSON.parse(readFileSync("/tmp/alys-v30-fixture.json", "utf8"));
const phase = process.env.V30_CAPTURE_PHASE === "before" ? "before" : "after";
async function login(page: Page, tech = false) {
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(tech ? f.techEmail : f.email);
  await page.getByLabel("Password", { exact: true }).fill(f.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/login/);
}
async function ready(page: Page) {
  await expect(page.locator(".field-skeleton")).toHaveCount(0);
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expect(page.locator(".pwa-checking")).toHaveCount(0);
  await expect(page.getByText("Loading your route…", { exact: true })).toHaveCount(0);
  if (phase === "after") {
    const nav = await page.locator(".mobile-tabbar a").evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect();
      return {left:r.left,right:r.right,width:r.width,height:r.height};
    }));
    expect(nav.length).toBeGreaterThanOrEqual(3);
    for (const [index, item] of nav.entries()) {
      expect(item.width).toBeGreaterThanOrEqual(44);
      expect(item.height).toBeGreaterThanOrEqual(44);
      expect(item.left).toBeGreaterThanOrEqual(0);
      expect(item.right).toBeLessThanOrEqual(390);
      if(index) expect(item.left).toBeGreaterThanOrEqual(nav[index - 1].right);
    }
  }
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
}
test("V3 actual before/after mobile screens, role navigation and progressive disclosure", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  if (phase === "before") {
    const r = await page.request.get("/api/finance?month=" + f.month);
    const d = await r.json();
    if (!d.config_id) {
      d.config.terms[0].rate_cents = 2500;
      d.config.terms[0].extra_visit_cents = 2500;
      d.config.costs.forEach((c: { cents: number }) => (c.cents = 0));
      d.config.processing_bps = 0;
      d.config.processing_fixed_cents = 0;
      const saved = await page.request.post("/api/finance", {
        headers: { origin: new URL(page.url()).origin },
        data: {
          action: "config",
          month: f.month,
          id: crypto.randomUUID(),
          expected: d.latest_config_id,
          payload: d.config,
        },
      });
      expect(saved.ok()).toBeTruthy();
    }
  }
  mkdirSync("docs/screenshots/v30", { recursive: true });
  for (const [name, path] of [
    ["owner-home", "/"],
    ["customers", "/customers"],
    ["customer-profile", "/customers/" + f.customers[0]],
    ["todays-route", "/route?date=" + f.date + "&technician=all"],
    ["team", "/team"],
    ["profitability", "/finance"],
  ] as const) {
    await page.goto(path);
    await ready(page);
    if (path === "/customers")
      await expect(
        page
          .locator(".business-customer a,.customer-profile-link")
          .filter({ hasText: "Sample Harbor" }),
      ).toBeVisible();
    if (path.startsWith("/route"))
      await expect(page.locator(".route-stop-card")).toHaveCount(3);
    if (path === "/team")
      await expect(
        page.getByText("Demo Technician", { exact: false }).first(),
      ).toBeVisible();
    if (path === "/finance")
      await expect(
        page.locator(".finance-context,.contribution-results").first(),
      ).toBeVisible();
    if (phase === "after") {
      if (path.startsWith("/customers/")) {
        const edit = page.getByRole("link", {name: "Edit customer & service", exact: true});
        await expect(edit).toBeVisible();
        expect(await edit.evaluate(el => getComputedStyle(el).color)).not.toBe("rgb(255, 255, 255)");
      }
      if (path.startsWith("/route"))
        await expect(
          page
            .locator(".route-stop-card")
            .first()
            .getByRole("button", { name: /Start service|Continue service/ }),
        ).toBeInViewport();
      await expect(page.locator(".mobile-tabbar a")).toHaveCount(5);
      if (path === "/")
        await expect(
          page.locator(".technician-summary-list [role=status]"),
        ).toHaveCount(0);
      await expect(
        page.getByText("Loading contribution…", { exact: true }),
      ).toHaveCount(0);
    }
    await page.screenshot({
      path: `docs/screenshots/v30/${phase}-${name}.png`,
    });
  }
  await page.goto("/route?date=" + f.date);
  await page
    .locator(".route-stop-card")
    .first()
    .getByRole("button", { name: /Start service|Continue service/ })
    .click();
  await expect(page.locator(".rebuilt-visit")).toBeVisible();
  await ready(page);
  if (phase === "after") {
    await expect(
      page.getByRole("button", { name: "Pool 1 FC 3 ppm", exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Pool 1 pH 7.4", exact: true }),
    ).toBeInViewport();
  }
  if(phase==='after'){const footer=await page.locator('.field-complete-bar').boundingBox();for(const label of ['Pool 1 FC 5 ppm','Pool 1 pH 8.0']){const box=await page.getByRole('button',{name:label,exact:true}).boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(footer!.y+1);}}
  await page.screenshot({
    path: `docs/screenshots/v30/${phase}-service-visit.png`,
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const tech = await context.newPage();
  await login(tech, true);
  await tech.goto("/stops");
  await ready(tech);
  await expect(tech.locator(".field-app")).toBeVisible();
  if (phase === "after") {
    await expect(tech.locator(".mobile-tabbar a")).toHaveCount(3);
    await expect(tech.locator(".mobile-tabbar")).not.toContainText("Team");
    await expect(
      tech
        .locator(".route-stop-card")
        .first()
        .getByRole("button", { name: /Start service|Continue service/ }),
    ).toBeInViewport();
    await tech.goto("/more");
    await expect(
      tech.getByRole("link", { name: /Profitability|Business Costs|Team/ }),
    ).toHaveCount(0);
    expect(
      (await tech.request.get("/api/contribution?month=" + f.month)).status(),
    ).toBe(403);
    await tech.goto("/stops");
  }
  await tech.screenshot({
    path: `docs/screenshots/v30/${phase}-technician-today.png`,
  });
  await context.close();
});
