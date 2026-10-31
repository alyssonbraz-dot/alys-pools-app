import { describe, it, expect } from "vitest";
import {
  calculate,
  allocate,
  marginBand,
  plannedStops,
  type Input,
  type Sources,
} from "@/lib/finance/model";
import {
  emptyConfig,
  emptyRecords,
  parseMoney,
  configSchema,
  recordsSchema,
} from "@/lib/finance/schema";
function input(month = "2026-02"): Input {
  const config = emptyConfig();
  config.costs.forEach((c) => (c.cents = 0));
  config.processing_bps = 0;
  config.processing_fixed_cents = 0;
  config.terms[0].rate_cents = 2500;
  config.terms[0].extra_visit_cents = 3000;
  config.terms[0].additional_service_cents = 1000;
  const sources: Sources = {
    captured_at: "2026-02-01",
    historical_unverified: false,
    pools: [
      { id: "pool1", property_id: "prop1", name: "Pool One", status: "active" },
    ],
    properties: [
      { id: "prop1", customer_id: "client1", address: "Fictional Place" },
    ],
    customers: [{ id: "client1", name: "Fictional client", status: "active" }],
    contracts: [
      {
        id: "contract1",
        customer_id: "client1",
        source: "own",
        billing_model: "monthly",
        price_cents: 14000,
        status: "active",
      },
    ],
    schedules: [
      {
        id: "schedule1",
        property_id: "prop1",
        technician_id: "tech1",
        days_of_week: [1],
        start_on: "2026-01-01",
        end_on: null,
        active: true,
      },
    ],
    technicians: [{ id: "tech1", display_name: "Fictional Tech" }],
  };
  return {
    month,
    sources,
    config,
    records: emptyRecords(),
    stops: [],
    visits: [],
    configKnown: true,
  };
}
function complete(i: Input, n = 4) {
  i.stops = plannedStops(i.month, i.sources, [])
    .slice(0, n)
    .map((s, n) => ({ ...s, id: "stop" + n, status: "completed" }));
  i.visits = i.stops.map((s) => ({
    id: "visit" + s.id,
    route_stop_id: s.id,
    technician_id: s.technician_id,
  }));
  return i;
}
describe("V2.4 precise financial calculations", () => {
  it("140 monthly, 4 x 25 payouts: 40 contribution, 28.57% before ALYS costs", () => {
    const r = calculate(input());
    expect(r.forecast).toMatchObject({
      revenue: 14000,
      technician: 10000,
      contribution: 4000,
      profit: 4000,
      margin: 2857,
      visits: 4,
    });
    expect(r.pools[0].classification).toBe("Healthy");
  });
  it("counts five Mondays and leap years using the calendar", () => {
    const i = input("2026-03");
    expect(calculate(i).forecast.technician).toBe(12500);
    expect(plannedStops("2028-02", i.sources, [])).toHaveLength(4);
    i.sources.schedules[0].days_of_week = [2];
    expect(plannedStops("2028-02", i.sources, [])).toHaveLength(5);
  });
  it("respects recurrence boundaries, duplicate weekdays and skipped stops", () => {
    const i = input();
    i.sources.schedules[0].start_on = "2026-02-09";
    i.sources.schedules[0].end_on = "2026-02-20";
    i.sources.schedules[0].days_of_week = [1, 1];
    const stops = plannedStops(i.month, i.sources, []);
    expect(stops).toHaveLength(2);
    expect(
      plannedStops(i.month, i.sources, [{ ...stops[0], status: "skipped" }]),
    ).toHaveLength(1);
  });
  it("pays only server-confirmed visits, deduplicating repeated completion records", () => {
    const i = complete(input(), 2);
    i.visits.push(i.visits[0]);
    const r = calculate(i);
    expect(r.recorded.technician).toBe(5000);
    expect(r.recorded.visits).toBe(2);
    expect(r.forecast.visits).toBe(4);
  });
  it("splits a multi-pool stop without duplicating contract or technician costs", () => {
    const i = complete(input());
    i.sources.pools.push({ ...i.sources.pools[0], id: "pool2" });
    const r = calculate(i);
    expect(r.forecast.revenue).toBe(14000);
    expect(r.forecast.technician).toBe(10000);
    expect(r.recorded.technician).toBe(10000);
    expect(r.pools.map((p) => p.forecast.technician)).toEqual([5000, 5000]);
    expect(r.forecast.visits).toBe(4);
  });
  it("keeps the captured payout when current-month terms change", () => {
    const i = complete(input(), 1);
    i.visits[0].terms = { ...i.config.terms[0] };
    i.visits[0].termsKnown = true;
    i.config.terms[0].rate_cents = 2700;
    const r = calculate(i);
    expect(r.recorded.technician).toBe(2500);
    expect(r.forecast.technician).toBe(10800);
  });
  it("reconciles odd cents and overhead by either allocation rule", () => {
    expect(allocate(101, [1, 1, 1])).toEqual([34, 34, 33]);
    for (const allocation of ["revenue", "pools"] as const) {
      const i = input();
      i.config.allocation = allocation;
      i.config.costs[0].cents = 101;
      i.sources.pools.push({ ...i.sources.pools[0], id: "pool2" });
      const r = calculate(i);
      expect(r.pools.reduce((n, p) => n + p.forecast.overhead!, 0)).toBe(101);
      expect(r.forecast.overhead).toBe(101);
    }
  });
  it("does not treat missing costs or receipts as zero", () => {
    const i = complete(input());
    i.config.costs[0].cents = null;
    const r = calculate(i);
    expect(r.forecast.profit).toBeNull();
    expect(r.recorded.revenue).toBeNull();
    expect(r.recorded.profit).toBeNull();
    expect(r.recorded.technician).toBe(10000);
  });
  it("requires confirmation of direct ALYS expenses, while technician expenses are included in rate", () => {
    const i = input();
    expect(calculate(i).forecast.direct).toBe(0);
    i.config.terms[0].chemicals = "alys";
    expect(calculate(i).forecast.direct).toBeNull();
    i.records.direct_complete = ["pool1"];
    expect(calculate(i).forecast.direct).toBe(0);
    i.records.direct = [
      {
        id: "expense",
        pool_id: "pool1",
        category: "chemicals",
        label: "Chlorine",
        cents: 2300,
        basis: "forecast",
      },
    ];
    expect(calculate(i).forecast.direct).toBe(2300);
    expect(calculate(i).recorded.direct).toBe(0);
  });
  it("charges explicit extra visit and additional-service rates once", () => {
    const i = complete(input(), 1);
    i.stops[0].schedule_id = null;
    i.records.additional = [{ stop_id: i.stops[0].id, count: 2 }];
    const r = calculate(i);
    expect(r.recorded.technician).toBe(5000);
  });
  it("monthly contract override charges once across two technicians and pools", () => {
    const i = complete(input());
    i.sources.technicians.push({ id: "tech2", display_name: "Second tech" });
    i.sources.schedules.push({
      ...i.sources.schedules[0],
      id: "sc2",
      technician_id: "tech2",
      days_of_week: [2],
    });
    i.config.terms.push({
      ...i.config.terms[0],
      scope: "contract",
      target: "contract1",
      model: "monthly",
      rate_cents: 10000,
    });
    const r = calculate(i);
    expect(r.forecast.technician).toBe(10000);
    expect(r.byTechnician.reduce((n, t) => n + t.forecast.technician!, 0)).toBe(
      10000,
    );
    expect(r.recorded.technician).toBe(10000);
  });
  it("fixed monthly technician terms accrue even before the first completed visit", () => {
    const i = input();
    i.config.terms[0].model = "monthly";
    i.config.terms[0].rate_cents = 9000;
    expect(calculate(i).recorded.technician).toBe(9000);
  });
  it("attributes actual payouts using the completing technician, with exact company reconciliation", () => {
    const i = complete(input());
    i.sources.technicians.push({ id: "tech2", display_name: "Second tech" });
    i.visits[0].technician_id = "tech2";
    i.config.terms.push({
      ...i.config.terms[0],
      scope: "technician",
      target: "tech2",
      rate_cents: 3000,
    });
    const r = calculate(i);
    expect(r.recorded.technician).toBe(10500);
    expect(
      r.byTechnician.find((t) => t.id === "tech2")!.recorded.technician,
    ).toBe(3000);
    expect(r.byTechnician.reduce((n, t) => n + t.recorded.technician!, 0)).toBe(
      10500,
    );
  });
  it("separates subcontract per-visit income from own MRR", () => {
    const i = input();
    i.sources.contracts[0] = {
      ...i.sources.contracts[0],
      source: "subcontract",
      billing_model: "per_visit",
      price_cents: 4000,
    };
    const r = calculate(i);
    expect(r.ownMrr).toBe(0);
    expect(r.subcontractForecast).toBe(16000);
    expect(r.forecast.revenue).toBe(16000);
  });
  it("never guesses fixed-contract recognition or missing payout terms", () => {
    const i = input();
    i.sources.contracts[0].billing_model = "fixed_contract";
    i.config.terms[0].rate_cents = null;
    expect(calculate(i).forecast.revenue).toBeNull();
    expect(calculate(i).forecast.technician).toBeNull();
  });
  it("recorded receipts and expense totals replace revisions, and processing uses actual transactions", () => {
    const i = complete(input());
    i.records.receipts = [
      { customer_id: "client1", cents: 14000, transactions: 1 },
    ];
    i.records.company = i.config.costs.map((c) => ({
      category: c.id,
      cents: 0,
    }));
    i.config.processing_bps = 290;
    i.config.processing_fixed_cents = 30;
    const r = calculate(i);
    expect(r.recorded.processing).toBe(436);
    expect(r.recorded.profit).toBe(3564);
    expect(calculate(i)).toEqual(r);
  });
  it("retains unallocated overhead when there are no eligible pools", () => {
    const i = input();
    i.sources.pools = [];
    i.sources.schedules = [];
    i.config.costs[0].cents = 10000;
    const r = calculate(i);
    expect(r.forecast.profit).toBe(-10000);
    expect(r.unallocatedForecast).toBe(10000);
  });
  it("rounds all configured margin boundaries correctly, including loss and zero revenue", () => {
    const c = emptyConfig();
    expect(
      [-1, 0, 1499, 1500, 2499, 2500, 3499, 3500, 4499, 4500].map(
        (v) => marginBand(v, c).label,
      ),
    ).toEqual([
      "Loss",
      "Critical",
      "Critical",
      "Low",
      "Low",
      "Healthy",
      "Healthy",
      "Very Good",
      "Very Good",
      "Excellent",
    ]);
    expect(marginBand(null, c).label).toBe("Not configured");
    c.bands[0].minimum_bps = 100;
    expect(configSchema.safeParse(c).success).toBe(false);
  });
  it("parses locale decimals exactly and rejects floating point precision and duplicate records", () => {
    expect(parseMoney("140,25")).toBe(14025);
    expect(parseMoney("0.29")).toBe(29);
    expect(parseMoney("")).toBeNull();
    expect(() => parseMoney("1.001")).toThrow();
    const c = emptyConfig();
    c.costs.push(c.costs[0]);
    expect(configSchema.safeParse(c).success).toBe(false);
    const r = emptyRecords();
    r.company = [
      { category: "one", cents: 10 },
      { category: "one", cents: 10 },
    ];
    expect(recordsSchema.safeParse(r).success).toBe(false);
  });
});

it("does not silently count orphaned period stops as zero technician cost", () => {
  const i = complete(input(), 1);
  i.sources.properties = [];
  i.sources.pools = [];
  const report = calculate(i);
  expect(report.recorded.technician).toBeNull();
  expect(report.recorded.profit).toBeNull();
  expect(report.warnings.join()).toContain("missing from period sources");
});
it("rounds negative profit per visit to cents with symmetric half-up rounding", () => {
  const i = complete(input(), 2);
  i.config.terms[0].rate_cents = 0;
  i.records.receipts = [{ customer_id: "client1", cents: 0, transactions: 0 }];
  i.records.company = i.config.costs.map((c) => ({
    category: c.id,
    cents: c.id === "0" ? 5 : 0,
  }));
  expect(calculate(i).recorded.perVisit).toBe(-3);
});
