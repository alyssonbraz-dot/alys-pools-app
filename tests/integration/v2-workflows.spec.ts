import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
try {
  process.loadEnvFile(".env.local");
} catch {
  /* Local environment injection. */
}
const fixture = JSON.parse(
  readFileSync("/tmp/alys-integration-fixture.json", "utf8"),
);
if (!["127.0.0.1", "localhost"].includes(new URL(fixture.url).hostname))
  throw new Error("Local fixture only.");
const admin = createClient(
  fixture.url,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(fixture.email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
}
test("unified customer saves multiple properties and pools atomically, replays safely and exposes owner controls", async ({
  page,
  baseURL,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Add Customer", exact: true }).click();
  const last = "Unified " + randomUUID().slice(0, 6);
  await page.getByLabel("First name", { exact: true }).fill("Fictional");
  await page.getByLabel("Last name", { exact: true }).fill(last);
  await page
    .getByLabel("Service address", { exact: true })
    .fill("Fictional first property, Florida");
  await page
    .getByRole("button", { name: "Add Another Pool / Spa", exact: true })
    .click();
  await page.getByLabel("Pool / spa name", { exact: true }).nth(1).fill("Spa");
  await page
    .getByRole("button", { name: "Add Another Property", exact: true })
    .click();
  await page
    .getByLabel("Service address", { exact: true })
    .nth(1)
    .fill("Fictional second property, Florida");
  await page
    .getByLabel("Monthly service price (USD)", { exact: true })
    .fill("219.50");
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/customers/onboard") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", {
      name: "Save Customer & Activate Service",
      exact: true,
    })
    .click();
  const saved = await response;
  expect(saved.ok()).toBe(true);
  const payload = saved.request().postDataJSON();
  const { id } = await saved.json();
  await expect(
    page.getByRole("heading", { name: "Fictional " + last, exact: true }),
  ).toBeVisible();
  const replay = await page.request.post("/api/customers/onboard", {
    headers: { Origin: baseURL! },
    data: payload,
  });
  expect(replay.ok()).toBe(true);
  expect((await replay.json()).id).toBe(id);
  const { data: properties, error } = await admin
    .from("properties")
    .select("id,pools(id),recurring_schedules(id,end_on)")
    .eq("customer_id", id);
  expect(error).toBeNull();
  expect(properties).toHaveLength(2);
  expect(properties!.flatMap((p) => p.pools)).toHaveLength(3);
  expect(
    properties!
      .flatMap((p) => p.recurring_schedules)
      .every((s) => s.end_on === null),
  ).toBe(true);
  const { count } = await admin
    .from("contracts")
    .select("id", { head: true, count: "exact" })
    .eq("customer_id", id);
  expect(count).toBe(1);
  await page.screenshot({
    path: "/tmp/alys-v2-customer-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Edit customer & service", exact: true })
    .click();
  await expect(page.getByLabel("Service address", { exact: true })).toHaveCount(
    2,
  );
  await expect(page.getByLabel("Pool / spa name", { exact: true })).toHaveCount(
    3,
  );
  await page.goto("/team");
  await expect(
    page.getByRole("heading", { name: "Team & Technicians", exact: true }),
  ).toBeVisible();
  const invite = await page.request.post("/api/team", {
    headers: { Origin: baseURL! },
    data: {
      action: "invite",
      id: randomUUID(),
      first_name: "Fictional",
      last_name: "Disabled",
      email: "disabled-" + randomUUID() + "@example.test",
    },
  });
  expect(invite.status()).toBe(503);
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Company Profile", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add schedule", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Manage Schedules", exact: true }),
  ).toBeVisible();
});
test("local single-use Auth invitation establishes a technician password, blocks owner APIs and suspension revokes access", async ({
  page,
  browser,
  baseURL,
}) => {
  const email = "v2-invite-" + randomUUID() + "@example.test";
  const { data: generated, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
  });
  expect(error).toBeNull();
  const userId = generated.user!.id,
    token = generated.properties!.hashed_token,
    invitation = randomUUID();
  expect(
    (
      await admin.from("profiles").insert({
        id: userId,
        organization_id: fixture.orgId,
        role: "technician",
        access_state: "invited",
        display_name: "V2 Invited Technician",
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from("team_invitations").insert({
        id: invitation,
        organization_id: fixture.orgId,
        email,
        display_name: "V2 Invited Technician",
        user_id: userId,
        state: "sent",
        token_digest: createHash("sha256").update(token).digest("hex"),
      })
    ).error,
  ).toBeNull();
  await page.goto(
    "/join#" + new URLSearchParams({ invitation, token_hash: token }),
  );
  const password = randomUUID() + "aA1!";
  await page
    .getByLabel("New password (at least 16 characters)", { exact: true })
    .fill(password);
  await page
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Current Service", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/team")).status()).toBe(403);
  expect((await page.request.get("/api/customers")).status()).toBe(403);
  expect(
    (
      await page.request.post("/api/settings", {
        headers: { Origin: baseURL! },
        data: { name: "Forged", defaults: {} },
      })
    ).status(),
  ).toBe(403);
  const replacementPassword = randomUUID() + "aA1!";
  expect(
    (
      await page.request.post("/api/account", {
        headers: { Origin: baseURL! },
        data: {
          current_password: "incorrect password",
          password: replacementPassword,
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/account", {
        headers: { Origin: baseURL! },
        data: { current_password: password, password: replacementPassword },
      })
    ).status(),
  ).toBe(200);
  const again = await page.request.post("/api/team/accept", {
    headers: { Origin: baseURL! },
    data: { invitation, token_hash: token, password },
  });
  expect(again.status()).toBe(410);
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await owner.goto(baseURL!);
  await owner.getByLabel("Email", { exact: true }).fill(fixture.email);
  await owner.getByLabel("Password", { exact: true }).fill(fixture.password);
  await owner.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    owner.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  const suspended = await owner.request.post(baseURL + "/api/team", {
    headers: { Origin: baseURL! },
    data: { action: "access", id: userId, state: "suspended" },
  });
  expect(suspended.ok()).toBe(true);
  expect((await page.request.get("/api/session")).status()).toBe(401);
  const authClient = createClient(
    fixture.url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  expect(
    (
      await authClient.auth.signInWithPassword({
        email,
        password: replacementPassword,
      })
    ).error,
  ).toBeNull();
  expect((await authClient.from("route_stops").select("id")).data).toEqual([]);
  await ownerContext.close();
});
