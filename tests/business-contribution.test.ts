import { describe, it, expect } from "vitest";
import { contribution, isLegacy } from "@/lib/business/contribution";
import { navigationFor, navigationActive } from "@/lib/business/navigation";
import { plannedStops, type Input } from "@/lib/finance/model";
import { emptyConfig, emptyRecords } from "@/lib/finance/schema";
function fixture(month = "2026-02"): Input & { ownerIds: string[] } {
  const config = emptyConfig();
  config.terms[0].rate_cents = 2500;
  return {
    month,
    ownerIds: ["owner"],
    config,
    configKnown: true,
    records: emptyRecords(),
    stops: [],
    visits: [],
    sources: {
      captured_at: "2026-02-01",
      historical_unverified: false,
      customers: [
        { id: "c", name: "Fictional owned customer", status: "active" },
      ],
      properties: [{ id: "pr", customer_id: "c", address: "Fictional Street" }],
      pools: [{ id: "p", property_id: "pr", name: "Pool", status: "active" }],
      contracts: [
        {
          id: "ct",
          customer_id: "c",
          source: "own",
          billing_model: "monthly",
          price_cents: 14000,
          status: "active",
        },
      ],
      schedules: [
        {
          id: "s",
          property_id: "pr",
          technician_id: "tech",
          days_of_week: [1],
          start_on: "2026-01-01",
          end_on: null,
          active: true,
        },
      ],
      technicians: [
        { id: "owner", display_name: "Fictional owner" },
        { id: "tech", display_name: "Fictional technician" },
      ],
    },
  };
}
function completed(i: ReturnType<typeof fixture>, count = 2) {
  i.stops = plannedStops(i.month, i.sources, [])
    .slice(0, count)
    .map((s, n) => ({ ...s, id: "stop" + n, status: "completed" }));
  i.visits = i.stops.map((st) => ({
    id: "v" + st.id,
    route_stop_id: st.id,
    technician_id: st.technician_id,
    terms: { ...i.config.terms[0] },
    termsKnown: true,
  }));
  return i;
}
describe("V3 simple contribution", () => {
  it("computes 140 - 4×25 = 40 (28.57%) without any expense fields", () => {
    const r = contribution(fixture());
    expect(r.ownedMrr).toBe(14000);
    expect(r.estimatedContribution).toBe(4000);
    expect(r.customers[0].forecast).toMatchObject({
      technicianPayments: 10000,
      contribution: 4000,
      margin: 2857,
    });
    expect(r.delegatedCustomers).toBe(1);
  });
  it("counts five-visit months by real recurrence", () => {
    const r = contribution(fixture("2026-03"));
    expect(r.customers[0].expectedVisits).toBe(5);
    expect(r.estimatedContribution).toBe(1500);
  });
  it("keeps completed visits and expected visits separate without duplicating completions", () => {
    const i = completed(fixture());
    i.visits.push(i.visits[0]);
    const r = contribution(i);
    expect(r.customers[0].expectedVisits).toBe(4);
    expect(r.customers[0].completedVisits).toBe(2);
    expect(r.customers[0].completed.technicianPayments).toBe(5000);
    expect(r.workload.find((t) => t.id === "tech")!.completed).toBe(2);
  });
  it("does not multiply customer revenue or stop payments by pools/spas", () => {
    const i = fixture();
    i.sources.pools.push({ ...i.sources.pools[0], id: "spa", name: "Spa" });
    const r = contribution(i);
    expect(r.ownedMrr).toBe(14000);
    expect(r.estimatedContribution).toBe(4000);
    expect(r.workload.find((t) => t.id === "tech")!.pools).toBe(2);
  });
  it("keeps solo owner labor unpriced even with an inherited 25 default", () => {
    const i = fixture();
    i.sources.schedules[0].technician_id = "owner";
    const r = contribution(i);
    expect(r.delegatedCustomers).toBe(0);
    expect(r.estimatedContribution).toBeNull();
    expect(r.beforeOwnerLabor).toBe(14000);
    expect(r.customers[0].forecast.ownerLabor).toBeNull();
  });
  it("allows explicit owner labor and customer overrides do not override personal owner labor", () => {
    const i = fixture();
    i.sources.schedules[0].technician_id = "owner";
    i.config.terms.push({
      ...i.config.terms[0],
      scope: "technician",
      target: "owner",
      rate_cents: 3000,
    });
    i.config.terms.push({
      ...i.config.terms[0],
      scope: "contract",
      target: "ct",
      rate_cents: 1000,
    });
    const r = contribution(i);
    expect(r.customers[0].forecast.ownerLabor).toBe(12000);
    expect(r.estimatedContribution).toBe(2000);
  });
  it("customer rate wins over technician rate for delegated work", () => {
    const i = fixture();
    i.config.terms.push({
      ...i.config.terms[0],
      scope: "technician",
      target: "tech",
      rate_cents: 3000,
    });
    i.config.terms.push({
      ...i.config.terms[0],
      scope: "contract",
      target: "ct",
      rate_cents: 2000,
    });
    expect(contribution(i).estimatedContribution).toBe(6000);
  });
  it("retains captured historical rates after a default change", () => {
    const i = completed(fixture());
    i.config.terms[0].rate_cents = 3000;
    const r = contribution(i);
    expect(r.customers[0].forecast.technicianPayments).toBe(12000);
    expect(r.customers[0].completed.technicianPayments).toBe(5000);
    expect(r.customers[0].rate).toBe(3000);
    expect(r.customers[0].mixedRates).toBe(false);
  });
  it("missing rate and missing contract are unknown, never zero", () => {
    const i = fixture();
    i.config.terms[0].rate_cents = null;
    expect(contribution(i).estimatedContribution).toBeNull();
    i.sources.contracts = [];
    expect(contribution(i).customers[0].monthlyRevenue).toBeNull();
    expect(contribution(i).ownedMrr).toBe(0);
  });
  it("ignores chemical/fuel/company costs entirely, without changing old records", () => {
    const i = fixture();
    i.config.costs[0].cents = 50000;
    i.records.direct = [
      {
        id: "x",
        pool_id: "p",
        basis: "forecast",
        category: "chemicals",
        cents: 3000,
        label: "Legacy assumption",
      },
    ];
    const before = structuredClone(i);
    expect(contribution(i).estimatedContribution).toBe(4000);
    expect(i).toEqual(before);
  });
  it("excludes outside subcontract customers and keeps mixed owned customers", () => {
    const i = fixture();
    i.sources.contracts[0].source = "subcontract";
    expect(contribution(i).ownedCustomers).toBe(0);
    expect(contribution(i).ownedMrr).toBe(0);
    expect(isLegacy([{ source: "subcontract" }, { source: "own" }])).toBe(
      false,
    );
  });
  it("uses normal per-visit rate for extra stops without requiring another cost field", () => {
    const i = completed(fixture(), 1);
    i.stops[0].schedule_id = null;
    expect(contribution(i).customers[0].completed.technicianPayments).toBe(
      2500,
    );
  });
  it("preserves pre-existing monthly payment agreements", () => {
    const i = fixture();
    i.config.terms[0].model = "monthly";
    i.config.terms[0].rate_cents = 9000;
    expect(contribution(i).estimatedContribution).toBe(5000);
  });
  it("never prices an offline or unconfirmed draft as a completed visit", () => {
    const i = completed(fixture(), 1);
    i.visits = [];
    expect(contribution(i).customers[0].completedVisits).toBe(0);
    expect(contribution(i).customers[0].completed.technicianPayments).toBe(0);
  });
  it("owns five destinations; technician owns only Today/History/More", () => {
    expect(navigationFor("owner").map((t) => t.label)).toEqual([
      "Home",
      "Customers",
      "Route",
      "Team",
      "More",
    ]);
    expect(navigationFor("technician").map((t) => t.label)).toEqual([
      "Today",
      "History",
      "More",
    ]);
    expect(navigationActive("/visit/id", "/stops", true)).toBe(true);
    expect(navigationActive("/maps", "/more", true)).toBe(true);
    expect(navigationActive("/team", "/more", false)).toBe(false);
  });
});

it("reassignment mid-month does not generate a second visit for an already completed occurrence", () => {
  const i = completed(fixture(), 2);
  i.sources.schedules[0].technician_id = "owner";
  const report = contribution(i);
  expect(report.customers[0].expectedVisits).toBe(4);
  expect(report.delegatedCustomers).toBe(0);
  expect(report.customers[0].forecast.technicianPayments).toBe(5000);
});

it("keeps technician amounts due after a customer becomes inactive, while excluding it from current MRR", () => {
  const i = completed(fixture());
  i.sources.customers[0].status = "inactive";
  const report = contribution(i);
  expect(report.ownedCustomers).toBe(0);
  expect(report.ownedMrr).toBe(0);
  expect(report.customers[0].completed.technicianPayments).toBe(5000);
  expect(report.customers[0].monthlyRevenue).toBeNull();
  expect(report.estimatedContribution).toBeNull();
});
it("does not invent zero contribution when confirmed work lacks historical property context", () => {
  const i = completed(fixture());
  i.sources.properties = [];
  expect(contribution(i).estimatedContribution).toBeNull();
});

it("keeps an active received subcontract out of the primary product even if it has an inactive owned agreement", () => {
  expect(
    isLegacy([
      { source: "subcontract", status: "active" },
      { source: "own", status: "inactive" },
    ]),
  ).toBe(true);
});
