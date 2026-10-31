import {
  emptyConfig,
  emptyRecords,
  type FinanceConfig,
  type FinanceRecords,
} from "./schema";
export type Sources = {
  captured_at: string;
  historical_unverified: boolean;
  pools: { id: string; property_id: string; name: string; status: string }[];
  properties: { id: string; customer_id: string; address: string }[];
  customers: { id: string; name: string; status: string }[];
  contracts: {
    id: string;
    customer_id: string;
    source: string;
    billing_model: string;
    price_cents: number;
    status: string;
  }[];
  schedules: {
    id: string;
    property_id: string;
    technician_id: string;
    days_of_week: number[];
    start_on: string;
    end_on: string | null;
    active: boolean;
  }[];
  technicians: { id: string; display_name: string }[];
};
export type Stop = {
  id: string;
  property_id: string;
  technician_id: string;
  service_date: string;
  status: string;
  schedule_id: string | null;
};
export type Completed = {
  id: string;
  route_stop_id: string;
  technician_id: string;
  terms?: FinanceConfig["terms"][number];
  termsKnown?: boolean;
};
export type Input = {
  month: string;
  sources: Sources;
  config: FinanceConfig;
  records: FinanceRecords;
  stops: Stop[];
  visits: Completed[];
  configKnown: boolean;
};
export type Metrics = {
  revenue: number | null;
  technician: number | null;
  direct: number | null;
  processing: number | null;
  overhead: number | null;
  contribution: number | null;
  profit: number | null;
  margin: number | null;
  perVisit: number | null;
  knownRevenue: number;
  knownTechnician: number;
  knownDirect: number;
  knownOverhead: number;
  visits: number;
};
export type PoolResult = {
  id: string;
  name: string;
  customer_id: string;
  customer: string;
  address: string;
  technicians: string[];
  planned: number;
  completed: number;
  rates: string[];
  warnings: string[];
  forecast: Metrics;
  recorded: Metrics;
  classification: string;
  recommendation: string;
};
export type Report = {
  month: string;
  currency: "USD";
  configKnown: boolean;
  historical_unverified: boolean;
  captured_at: string;
  ownMrr: number;
  subcontractMonthly: number;
  subcontractForecast: number;
  forecast: Metrics;
  recorded: Metrics;
  pools: PoolResult[];
  byClient: {
    id: string;
    name: string;
    forecast: Metrics;
    recorded: Metrics;
  }[];
  byTechnician: {
    id: string;
    name: string;
    forecast: Metrics;
    recorded: Metrics;
  }[];
  unallocatedForecast: number;
  unallocatedRecorded: number;
  warnings: string[];
};
export function ratio(n: number, d: number) {
  if (d === 0) return null;
  const sign = n < 0 ? -1 : 1;
  return (
    sign * Number((BigInt(Math.abs(n)) * 10000n + BigInt(d) / 2n) / BigInt(d))
  );
}
export function fraction(n: number, numerator: number, denominator: number) {
  return Number(
    (BigInt(n) * BigInt(numerator) + BigInt(denominator) / 2n) /
      BigInt(denominator),
  );
}
/** Largest remainder allocation: deterministic, integer cents, exact reconciliation. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  const parts = weights.map((w, i) => ({
    i,
    value: Number((BigInt(total) * BigInt(w)) / BigInt(sum)),
    rem: (BigInt(total) * BigInt(w)) % BigInt(sum),
  }));
  let left = total - parts.reduce((n, p) => n + p.value, 0);
  for (const p of [...parts].sort((a, b) =>
    a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1,
  )) {
    if (!left) break;
    p.value++;
    left--;
  }
  return parts.sort((a, b) => a.i - b.i).map((p) => p.value);
}
export function monthDays(month: string) {
  const days: string[] = [];
  const date = new Date(month + "-01T12:00:00Z");
  while (date.toISOString().startsWith(month)) {
    days.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return days;
}
export function plannedStops(month: string, s: Sources, stops: Stop[]): Stop[] {
  const result = new Map<string, Stop>();
  for (const schedule of s.schedules) {
    if (!schedule.active) continue;
    for (const date of monthDays(month)) {
      if (
        date < schedule.start_on ||
        (schedule.end_on && date > schedule.end_on) ||
        !schedule.days_of_week.includes(
          new Date(date + "T12:00:00Z").getUTCDay(),
        )
      )
        continue;
      const key = schedule.property_id + schedule.technician_id + date;
      result.set(key, {
        id: key,
        property_id: schedule.property_id,
        technician_id: schedule.technician_id,
        service_date: date,
        status: "pending",
        schedule_id: schedule.id,
      });
    }
  }
  for (const stop of stops) {
    if (!stop.service_date.startsWith(month)) continue;
    const key = stop.property_id + stop.technician_id + stop.service_date;
    if (stop.status === "skipped") result.delete(key);
    else result.set(key, stop);
  }
  return [...result.values()];
}
const blank = (): Metrics => ({
  revenue: 0,
  technician: 0,
  direct: 0,
  processing: 0,
  overhead: 0,
  contribution: 0,
  profit: 0,
  margin: null,
  perVisit: null,
  knownRevenue: 0,
  knownTechnician: 0,
  knownDirect: 0,
  knownOverhead: 0,
  visits: 0,
});
function finish(m: Metrics) {
  m.knownRevenue = m.revenue ?? m.knownRevenue;
  m.knownTechnician = m.technician ?? m.knownTechnician;
  m.knownDirect = m.direct ?? m.knownDirect;
  m.knownOverhead = m.overhead ?? m.knownOverhead;
  m.contribution =
    m.revenue === null ||
    m.technician === null ||
    m.direct === null ||
    m.processing === null
      ? null
      : m.revenue - m.technician - m.direct - m.processing;
  m.profit =
    m.contribution === null || m.overhead === null
      ? null
      : m.contribution - m.overhead;
  m.margin =
    m.profit === null || !m.revenue ? null : ratio(m.profit, m.revenue);
  m.perVisit =
    m.profit === null || !m.visits
      ? null
      : fraction(Math.abs(m.profit), 1, m.visits) * (m.profit < 0 ? -1 : 1);
  return m;
}
function sum(rows: Metrics[]): Metrics {
  const m = blank();
  for (const key of [
    "revenue",
    "technician",
    "direct",
    "processing",
    "overhead",
  ] as const)
    m[key] = rows.some((r) => r[key] === null)
      ? null
      : rows.reduce((n, r) => n + r[key]!, 0);
  for (const key of [
    "knownRevenue",
    "knownTechnician",
    "knownDirect",
    "knownOverhead",
    "visits",
  ] as const)
    m[key] = rows.reduce((n, r) => n + r[key], 0);
  return finish(m);
}
export function marginBand(margin: number | null, config: FinanceConfig) {
  if (margin === null) return { label: "Not configured", action: "Review" };
  if (margin < 0) return { label: "Loss", action: "Review" };
  return (
    [...config.bands]
      .sort((a, b) => b.minimum_bps - a.minimum_bps)
      .find((b) => margin >= b.minimum_bps) ?? {
      label: "Not configured",
      action: "Review",
    }
  );
}
export function calculate(input: Input): Report {
  const { month, sources: s, stops, visits, configKnown } = input,
    config = input.config ?? emptyConfig(),
    records = input.records ?? emptyRecords();
  const planned = plannedStops(month, s, stops),
    visitMap = new Map(visits.map((v) => [v.route_stop_id, v]));
  const completed = stops.filter(
    (st) => visitMap.has(st.id) && st.service_date.startsWith(month),
  );
  const activeCustomers = new Set(
    s.customers.filter((c) => c.status === "active").map((c) => c.id),
  );
  const pools: PoolResult[] = s.pools
    .filter(
      (p) =>
        (p.status === "active" &&
          activeCustomers.has(
            s.properties.find((pr) => pr.id === p.property_id)?.customer_id ??
              "",
          )) ||
        completed.some((st) => st.property_id === p.property_id),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => {
      const prop = s.properties.find((x) => x.id === p.property_id)!;
      return {
        id: p.id,
        name: p.name,
        customer_id: prop.customer_id,
        customer:
          s.customers.find((c) => c.id === prop.customer_id)?.name ?? "—",
        address: prop.address,
        technicians: [],
        planned: 0,
        completed: 0,
        rates: [],
        warnings: [],
        forecast: blank(),
        recorded: blank(),
        classification: "Not configured",
        recommendation: "Review",
      };
    });
  const warn = (p: PoolResult, message: string) => {
    if (!p.warnings.includes(message)) p.warnings.push(message);
  };
  const techLedger = new Map<
    string,
    Map<string, { visits: number; payout: number | null; knownPayout: number }>
  >();
  let ownMrr = 0,
    subcontractMonthly = 0,
    subcontractForecast = 0;
  for (const customer of s.customers) {
    const ps = pools.filter((p) => p.customer_id === customer.id);
    if (!ps.length) continue;
    const contracts = s.contracts.filter(
      (c) => c.customer_id === customer.id && c.status === "active",
    );
    const props = s.properties
      .filter((p) => p.customer_id === customer.id)
      .map((p) => p.id);
    const forecastVisits = planned.filter((st) =>
      props.includes(st.property_id),
    ).length;
    let forecast = 0,
      known = true;
    if (!contracts.length) known = false;
    for (const c of contracts) {
      if (c.billing_model === "monthly") {
        forecast += c.price_cents;
        if (c.source === "own") ownMrr += c.price_cents;
        else subcontractMonthly += c.price_cents;
      } else if (c.billing_model === "per_visit")
        forecast += c.price_cents * forecastVisits;
      else known = false;
      if (c.source === "subcontract")
        subcontractForecast +=
          c.billing_model === "monthly"
            ? c.price_cents
            : c.billing_model === "per_visit"
              ? c.price_cents * forecastVisits
              : 0;
    }
    const recorded = records.receipts.find(
      (r) => r.customer_id === customer.id,
    );
    const weights = ps.map(() => 1),
      fa = allocate(forecast, weights),
      ra = allocate(recorded?.cents ?? 0, weights);
    let pf: number | null = null,
      pr: number | null = null;
    if (
      config.processing_bps !== null &&
      config.processing_fixed_cents !== null
    ) {
      pf =
        fraction(forecast, config.processing_bps, 10000) +
        config.processing_fixed_cents * contracts.length;
      if (
        recorded?.cents !== null &&
        recorded?.cents !== undefined &&
        recorded.transactions !== null
      )
        pr =
          fraction(recorded.cents, config.processing_bps, 10000) +
          config.processing_fixed_cents * recorded.transactions;
    }
    const fpa = allocate(pf ?? 0, weights),
      rpa = allocate(pr ?? 0, weights);
    ps.forEach((p, i) => {
      p.forecast.revenue = known ? fa[i] : null;
      p.forecast.knownRevenue = fa[i];
      p.recorded.revenue = recorded?.cents == null ? null : ra[i];
      p.forecast.processing = pf === null ? null : fpa[i];
      p.recorded.processing = pr === null ? null : rpa[i];
      if (!known) warn(p, "Contract revenue is incomplete.");
    });
  }
  // One service charge per property stop, split across pools with exact cents.
  const resolveTerm = (propertyId: string, tech: string) => {
    const customer = s.properties.find((p) => p.id === propertyId)?.customer_id;
    const contracts = s.contracts.filter(
      (c) => c.customer_id === customer && c.status === "active",
    );
    const overrides = config.terms.filter(
      (t) => t.scope === "contract" && contracts.some((c) => c.id === t.target),
    );
    return {
      term:
        overrides[0] ??
        config.terms.find(
          (t) => t.scope === "technician" && t.target === tech,
        ) ??
        config.terms.find((t) => t.scope === "default")!,
      ambiguous: overrides.length > 1,
    };
  };
  const getLedger = (pool: string, basis: string, tech: string) => {
    const key = pool + ":" + basis;
    const ledger =
      techLedger.get(key) ??
      new Map<
        string,
        { visits: number; payout: number | null; knownPayout: number }
      >();
    const item = ledger.get(tech) ?? { visits: 0, payout: 0, knownPayout: 0 };
    ledger.set(tech, item);
    techLedger.set(key, ledger);
    return item;
  };
  const addPayout = (
    p: PoolResult,
    basis: "forecast" | "recorded",
    tech: string,
    amount: number | null,
  ) => {
    const item = getLedger(p.id, basis, tech);
    if (!p.technicians.includes(tech)) p.technicians.push(tech);
    if (amount === null) {
      item.payout = null;
      p[basis].technician = null;
      warn(p, "Technician rate is not configured.");
    } else {
      item.knownPayout += amount;
      p[basis].knownTechnician += amount;
      if (item.payout !== null) item.payout += amount;
      if (p[basis].technician !== null) p[basis].technician! += amount;
    }
  };
  for (const basis of ["forecast", "recorded"] as const) {
    const events = [...(basis === "forecast" ? planned : completed)].sort(
      (a, b) =>
        a.service_date.localeCompare(b.service_date) ||
        a.id.localeCompare(b.id),
    );
    const monthly = new Map<
      string,
      {
        amount: number | null;
        snapshotted: boolean;
        pairs: Map<string, { pool: PoolResult; tech: string; weight: number }>;
      }
    >();
    const registerMonthly = (
      propertyId: string,
      tech: string,
      event: boolean,
      snapshot?: FinanceConfig["terms"][number],
    ) => {
      const resolved = resolveTerm(propertyId, tech);
      const term = snapshot ?? resolved.term,
        ambiguous = snapshot ? false : resolved.ambiguous;
      if (term.model !== "monthly") return;
      const key =
        term.scope +
        ":" +
        term.target +
        (term.scope === "contract" ? "" : ":" + tech);
      const group = monthly.get(key) ?? {
        amount: ambiguous ? null : term.rate_cents,
        snapshotted: false,
        pairs: new Map<
          string,
          { pool: PoolResult; tech: string; weight: number }
        >(),
      };
      if (snapshot && !group.snapshotted) {
        group.amount = snapshot.rate_cents;
        group.snapshotted = true;
      }
      for (const p of pools.filter(
        (p) => s.pools.find((x) => x.id === p.id)?.property_id === propertyId,
      )) {
        const pairKey = p.id + ":" + tech;
        const pair = group.pairs.get(pairKey) ?? { pool: p, tech, weight: 0 };
        if (event) pair.weight++;
        group.pairs.set(pairKey, pair);
      }
      monthly.set(key, group);
    };
    // Fixed monthly terms remain payable for assigned portfolios even in a no-visit month.
    for (const schedule of s.schedules.filter(
      (sc) =>
        sc.active &&
        sc.start_on <= monthDays(month).at(-1)! &&
        (!sc.end_on || sc.end_on >= month + "-01"),
    )) {
      const captured =
        basis === "recorded"
          ? events.find(
              (st) =>
                st.property_id === schedule.property_id &&
                visitMap.get(st.id)?.technician_id === schedule.technician_id &&
                visitMap.get(st.id)?.terms,
            )
          : undefined;
      registerMonthly(
        schedule.property_id,
        schedule.technician_id,
        false,
        captured ? visitMap.get(captured.id)?.terms : undefined,
      );
    }
    for (const stop of events) {
      const targets = pools.filter(
        (p) =>
          s.pools.find((x) => x.id === p.id)?.property_id === stop.property_id,
      );
      if (!targets.length) continue;
      const tech =
        basis === "recorded"
          ? visitMap.get(stop.id)!.technician_id
          : stop.technician_id;
      const resolved = resolveTerm(stop.property_id, tech),
        snapshot =
          basis === "recorded" ? visitMap.get(stop.id)?.terms : undefined;
      const term = snapshot ?? resolved.term,
        ambiguous = snapshot ? false : resolved.ambiguous,
        extra = stop.schedule_id === null,
        count =
          records.additional.find((a) => a.stop_id === stop.id)?.count ?? 0;
      let charge = extra
        ? term.extra_visit_cents
        : term.model === "monthly"
          ? 0
          : term.rate_cents;
      if (count) {
        if (term.additional_service_cents === null) charge = null;
        else if (charge !== null)
          charge += term.additional_service_cents * count;
      }
      if (
        ambiguous ||
        (basis === "recorded" && visitMap.get(stop.id)?.termsKnown === false)
      )
        charge = null;
      const parts = allocate(
        charge ?? 0,
        targets.map(() => 1),
      );
      targets.forEach((p, i) => {
        getLedger(p.id, basis, tech).visits++;
        p[basis].visits++;
        if (basis === "forecast") p.planned++;
        else p.completed++;
        addPayout(p, basis, tech, charge === null ? null : parts[i]);
        const rate = term.model + ":" + (term.rate_cents ?? "unknown");
        if (!p.rates.includes(rate)) p.rates.push(rate);
        if (ambiguous)
          warn(p, "Multiple contract payout overrides require review.");
        if (
          ["chemicals", "fuel", "vehicle", "tools"].some(
            (k) => term[k as "chemicals"] === "alys",
          ) &&
          !records.direct_complete.includes(p.id)
        ) {
          p[basis].direct = null;
          warn(p, "ALYS-paid direct expenses need confirmation.");
        }
      });
      if (!extra) registerMonthly(stop.property_id, tech, true, snapshot);
    }
    for (const group of monthly.values()) {
      const pairs = [...group.pairs.values()];
      const weights = pairs.map((p) => p.weight);
      const parts = allocate(
        group.amount ?? 0,
        weights.some(Boolean) ? weights : pairs.map(() => 1),
      );
      pairs.forEach((pair, i) =>
        addPayout(
          pair.pool,
          basis,
          pair.tech,
          group.amount === null ? null : parts[i],
        ),
      );
    }
  }
  for (const p of pools)
    for (const basis of ["forecast", "recorded"] as const) {
      for (const e of records.direct.filter(
        (e) => e.pool_id === p.id && e.basis === basis,
      )) {
        p[basis].knownDirect += e.cents;
        if (p[basis].direct !== null) p[basis].direct! += e.cents;
      }
      if (!configKnown) {
        p[basis].technician = null;
        p[basis].processing = null;
        p[basis].direct = null;
        warn(p, "Business costs and payout terms are not configured.");
      }
    }
  const overhead = (basis: "forecast" | "recorded") => {
    let total = 0,
      complete = configKnown;
    for (const c of config.costs) {
      const amount =
        basis === "forecast"
          ? c.cents
          : records.company.find((e) => e.category === c.id)?.cents;
      if (amount === null || amount === undefined) {
        complete = false;
        continue;
      }
      total +=
        basis === "forecast" && c.model === "per_visit"
          ? amount * planned.length
          : amount;
    }
    return { total, complete };
  };
  const fo = overhead("forecast"),
    ro = overhead("recorded");
  const weights = pools.map((p) =>
    config.allocation === "pools" ? 1 : p.forecast.knownRevenue,
  );
  const allocationKnown =
    config.allocation !== "revenue" ||
    pools.every((p) => p.forecast.revenue !== null);
  const weightTotal = allocationKnown ? weights.reduce((a, b) => a + b, 0) : 0;
  const fa = allocate(fo.total, weightTotal ? weights : weights.map(() => 0)),
    ra = allocate(ro.total, weightTotal ? weights : weights.map(() => 0));
  pools.forEach((p, i) => {
    for (const [basis, o, a] of [
      ["forecast", fo, fa],
      ["recorded", ro, ra],
    ] as const) {
      p[basis].knownOverhead = a[i];
      p[basis].overhead = o.complete && weightTotal > 0 ? a[i] : null;
      finish(p[basis]);
    }
    const band = marginBand(p.forecast.margin, config);
    p.classification = band.label;
    p.recommendation = band.action;
  });
  const forecast = sum(pools.map((p) => p.forecast)),
    recorded = sum(pools.map((p) => p.recorded));
  forecast.overhead = fo.complete ? fo.total : null;
  forecast.knownOverhead = fo.total;
  recorded.overhead = ro.complete ? ro.total : null;
  recorded.knownOverhead = ro.total;
  // Company visit count is stops, never pool count. Allocations reconcile to company expense.
  forecast.visits = planned.length;
  recorded.visits = completed.length;
  if (!configKnown) {
    forecast.technician = null;
    forecast.direct = null;
    forecast.processing = null;
    recorded.technician = null;
    recorded.direct = null;
    recorded.processing = null;
  }
  const missingForecast = planned.some(
    (st) =>
      !pools.some(
        (p) =>
          s.pools.find((x) => x.id === p.id)?.property_id === st.property_id,
      ),
  );
  const missingRecorded = completed.some(
    (st) =>
      !pools.some(
        (p) =>
          s.pools.find((x) => x.id === p.id)?.property_id === st.property_id,
      ),
  );
  if (missingForecast) {
    forecast.technician = null;
    forecast.direct = null;
  }
  if (missingRecorded) {
    recorded.technician = null;
    recorded.direct = null;
  }
  finish(forecast);
  finish(recorded);
  const warnings: string[] = [];
  if (missingForecast || missingRecorded)
    warnings.push(
      "Some stops are missing from period sources. Recapture sources and review before closing.",
    );
  if (!configKnown)
    warnings.push("Business costs and payout terms are not configured.");
  if (s.historical_unverified)
    warnings.push(
      "Historical source data was not captured in this period. Treat these figures as a current-source estimate.",
    );
  if (!weightTotal && (fo.total || ro.total))
    warnings.push(
      "Company overhead is unallocated. Configure pool or revenue allocation.",
    );
  if (!pools.length)
    warnings.push("No eligible pools. Company costs are still included.");
  return {
    month,
    currency: "USD",
    configKnown,
    historical_unverified: s.historical_unverified,
    captured_at: s.captured_at,
    ownMrr,
    subcontractMonthly,
    subcontractForecast,
    forecast,
    recorded,
    pools,
    byClient: s.customers
      .filter((c) => pools.some((p) => p.customer_id === c.id))
      .map((c) => {
        const forecast = sum(
            pools.filter((p) => p.customer_id === c.id).map((p) => p.forecast),
          ),
          recorded = sum(
            pools.filter((p) => p.customer_id === c.id).map((p) => p.recorded),
          );
        const properties = s.properties
          .filter((p) => p.customer_id === c.id)
          .map((p) => p.id);
        forecast.visits = planned.filter((st) =>
          properties.includes(st.property_id),
        ).length;
        recorded.visits = completed.filter((st) =>
          properties.includes(st.property_id),
        ).length;
        finish(forecast);
        finish(recorded);
        return { id: c.id, name: c.name, forecast, recorded };
      }),
    byTechnician: s.technicians
      .filter((t) => pools.some((p) => p.technicians.includes(t.id)))
      .map((t) => {
        const shares = (basis: "forecast" | "recorded") =>
          pools.map((p) => {
            const ledger = techLedger.get(p.id + ":" + basis);
            const entries = [...(ledger?.entries() ?? [])].sort(([a], [b]) =>
              a.localeCompare(b),
            );
            const index = entries.findIndex(([id]) => id === t.id);
            if (index < 0) return blank();
            const counts = entries.map(([, v]) => v.visits);
            const weights = counts.some(Boolean)
              ? counts
              : entries.map(() => 1);
            const copy = { ...p[basis] };
            for (const k of [
              "revenue",
              "direct",
              "processing",
              "overhead",
              "knownRevenue",
              "knownDirect",
              "knownOverhead",
            ] as const)
              if (copy[k] !== null)
                copy[k] = allocate(copy[k]!, weights)[index];
            copy.technician =
              p[basis].technician === null ? null : entries[index][1].payout;
            copy.knownTechnician = entries[index][1].knownPayout;
            copy.visits = entries[index][1].visits;
            return finish(copy);
          });
        const forecast = sum(shares("forecast")),
          recorded = sum(shares("recorded"));
        forecast.visits = planned.filter(
          (st) => st.technician_id === t.id,
        ).length;
        recorded.visits = completed.filter(
          (st) => visitMap.get(st.id)?.technician_id === t.id,
        ).length;
        finish(forecast);
        finish(recorded);
        return { id: t.id, name: t.display_name, forecast, recorded };
      }),
    unallocatedForecast: weightTotal ? 0 : fo.total,
    unallocatedRecorded: weightTotal ? 0 : ro.total,
    warnings,
  };
}
