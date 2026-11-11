import { it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
const { getOperator, loadBusiness, admin } = vi.hoisted(() => ({
  getOperator: vi.fn(),
  loadBusiness: vi.fn(),
  admin: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getOperator }));
vi.mock("@/lib/business/server", () => ({ loadBusiness }));
vi.mock("@/lib/team/server", () => ({ administration: admin }));
import { GET, POST } from "@/app/api/contribution/route";
beforeEach(() => vi.clearAllMocks());
const body = () =>
  new Request("http://localhost/api/contribution", {
    method: "POST",
    headers: { origin: "http://localhost", "content-type": "application/json" },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      month: "2026-10",
      expected: null,
      target: "technician",
      target_id: crypto.randomUUID(),
      rate_cents: 2500,
    }),
  });
it.each([
  null,
  { profile: { role: "technician" } },
  { profile: { role: "admin" } },
])("guards every contribution read and write server-side: %j", async (op) => {
  getOperator.mockResolvedValue(op);
  expect(
    (await GET(new Request("http://localhost/api/contribution?month=2026-10")))
      .status,
  ).toBe(403);
  expect((await POST(body())).status).toBe(403);
  expect(loadBusiness).not.toHaveBeenCalled();
  expect(admin).not.toHaveBeenCalled();
});
it("rejects cross-origin rate changes before looking up an operator", async () => {
  expect(
    (
      await POST(
        new Request(body(), { headers: { origin: "https://foreign.example" } }),
      )
    ).status,
  ).toBe(403);
  expect(getOperator).not.toHaveBeenCalled();
});
it("does not pass a cross-tenant technician or customer reference to a privileged writer", async () => {
  getOperator.mockResolvedValue({
    user: { id: "owner" },
    profile: { role: "owner" },
    db: {},
  });
  loadBusiness.mockResolvedValue({
    sources: { technicians: [], contracts: [] },
  });
  expect((await POST(body())).status).toBe(404);
  expect(admin).not.toHaveBeenCalled();
});
