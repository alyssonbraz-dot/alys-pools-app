import { beforeEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { operator, admin, load } = vi.hoisted(() => ({
  operator: vi.fn(),
  admin: vi.fn(),
  load: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getOperator: operator }));
vi.mock("@/lib/team/server", () => ({ administration: admin }));
vi.mock("@/lib/finance/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/finance/server")>()),
  loadFinance: load,
}));
import { GET, POST } from "@/app/api/finance/route";
import { validateRecordsOwnership } from "@/lib/finance/server";
import { emptyConfig, emptyRecords } from "@/lib/finance/schema";
beforeEach(() => vi.clearAllMocks());
const request = () =>
  new Request("http://localhost/api/finance", {
    method: "POST",
    headers: { origin: "http://localhost", "content-type": "application/json" },
    body: JSON.stringify({
      action: "config",
      month: "2026-10",
      id: crypto.randomUUID(),
      payload: emptyConfig(),
    }),
  });
it.each([
  null,
  { profile: { role: "technician" } },
  { profile: { role: "admin" } },
])(
  "rejects financial reads and writes before querying or invoking privileged RPC: %j",
  async (value) => {
    operator.mockResolvedValue(value);
    expect(
      (await GET(new Request("http://localhost/api/finance?month=2026-10")))
        .status,
    ).toBe(403);
    expect((await POST(request())).status).toBe(403);
    expect(load).not.toHaveBeenCalled();
    expect(admin).not.toHaveBeenCalled();
  },
);
it("rejects cross-origin mutation", async () => {
  const r = new Request(request(), {
    headers: { origin: "https://hostile.example" },
  });
  expect((await POST(r)).status).toBe(403);
  expect(operator).not.toHaveBeenCalled();
});
it("rejects unrelated tenant/pool references and technician-paid costs", () => {
  const sources = {
    captured_at: "",
    historical_unverified: false,
    pools: [{ id: "p", name: "Pool", property_id: "pr", status: "active" }],
    properties: [{ id: "pr", customer_id: "c", address: "Fictional" }],
    customers: [{ id: "c", name: "Client", status: "active" }],
    contracts: [],
    schedules: [],
    technicians: [],
  };
  const records = emptyRecords();
  records.direct = [
    {
      id: "e",
      pool_id: "p",
      category: "chemicals",
      cents: 1200,
      basis: "recorded",
      label: "Chlorine",
    },
  ];
  expect(() =>
    validateRecordsOwnership(records, sources, emptyConfig(), []),
  ).toThrow("covered by the technician");
  const config = emptyConfig();
  config.terms[0].chemicals = "alys";
  expect(() =>
    validateRecordsOwnership(records, sources, config, []),
  ).not.toThrow();
  records.direct[0].pool_id = "foreign-pool";
  expect(() => validateRecordsOwnership(records, sources, config, [])).toThrow(
    "Invalid pool",
  );
});
