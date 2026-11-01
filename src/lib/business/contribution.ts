import {
  allocate,
  fraction,
  monthDays,
  plannedStops,
  ratio,
  type Input,
} from "@/lib/finance/model";
import type { FinanceConfig } from "@/lib/finance/schema";
type Term = FinanceConfig["terms"][number];
export type BusinessCustomer = {
  id: string;
  name: string;
  active: boolean;
  monthlyRevenue: number | null;
  expectedVisits: number;
  completedVisits: number;
  delegated: boolean;
  technicians: string[];
  poolIds: string[];
  rate: number | null;
  mixedRates: boolean;
  forecast: Contribution;
  completed: Contribution;
};
export type Contribution = {
  technicianPayments: number | null;
  ownerLabor: number | null;
  unpricedOwnerVisits: number;
  unpricedTechnicianVisits: number;
  beforeOwnerLabor: number | null;
  contribution: number | null;
  margin: number | null;
};
export type BusinessReport = {
  month: string;
  ownedCustomers: number;
  delegatedCustomers: number;
  ownedMrr: number;
  estimatedContribution: number | null;
  averageContribution: number | null;
  beforeOwnerLabor: number | null;
  customers: BusinessCustomer[];
  workload: {
    id: string;
    name: string;
    role: string;
    pools: number;
    expected: number;
    completed: number;
    payment: number | null;
    rate: number | null;
  }[];
  warnings: string[];
  archivedFinancials: boolean;
};
export function isLegacy(contracts: { source: string; status?: string }[]) {
  const active = contracts.filter((c) => c.status === "active");
  const relevant = active.length ? active : contracts;
  return (
    relevant.some((c) => c.source === "subcontract") &&
    !relevant.some((c) => c.source === "own")
  );
}

const blank = (): Contribution => ({
  technicianPayments: 0,
  ownerLabor: 0,
  unpricedOwnerVisits: 0,
  unpricedTechnicianVisits: 0,
  beforeOwnerLabor: null,
  contribution: null,
  margin: null,
});
export function contribution(
  input: Input & { ownerIds: string[]; archivedFinancials?: boolean },
): BusinessReport {
  const { sources: s, config, month, ownerIds } = input,
    first = month + "-01",
    last = monthDays(month).at(-1)!;
  const owners = new Set(ownerIds),
    allContracts = s.contracts.filter((c) => c.status === "active");
  const confirmedIds = new Set(input.visits.map((v) => v.route_stop_id));
  const propertyOwners = new Map(
    s.properties.map((p) => [p.id, p.customer_id]),
  );
  const confirmedCustomers = new Set(
    input.stops
      .filter(
        (st) => st.service_date.startsWith(month) && confirmedIds.has(st.id),
      )
      .map((st) => propertyOwners.get(st.property_id)),
  );
  const activeCustomers = s.customers.filter(
    (c) =>
      (c.status === "active" || confirmedCustomers.has(c.id)) &&
      !isLegacy(s.contracts.filter((a) => a.customer_id === c.id)),
  );
  const propertyCustomer = new Map(
    s.properties.map((p) => [p.id, p.customer_id]),
  );
  const ownedIds = new Set(activeCustomers.map((c) => c.id));
  const actualStopIds = new Set(input.stops.map((st) => st.id));
  const planned = plannedStops(month, s, input.stops).filter(
    (st) =>
      ownedIds.has(propertyCustomer.get(st.property_id) ?? "") &&
      (s.customers.find((c) => c.id === propertyCustomer.get(st.property_id))
        ?.status === "active" ||
        confirmedIds.has(st.id)) &&
      (actualStopIds.has(st.id) ||
        !input.stops.some(
          (real) =>
            real.service_date === st.service_date &&
            real.property_id === st.property_id &&
            real.schedule_id === st.schedule_id,
        )),
  );
  const visitMap = new Map(input.visits.map((v) => [v.route_stop_id, v]));
  const completed = input.stops.filter(
    (st) =>
      st.service_date.startsWith(month) &&
      visitMap.has(st.id) &&
      ownedIds.has(propertyCustomer.get(st.property_id) ?? ""),
  );
  const customerMap = new Map<string, BusinessCustomer>();
  for (const c of activeCustomers) {
    const contracts = allContracts.filter(
      (a) => a.customer_id === c.id && a.source === "own",
    );
    const monthly = contracts.filter((a) => a.billing_model === "monthly");
    const pools = s.pools
      .filter(
        (p) =>
          p.status === "active" && propertyCustomer.get(p.property_id) === c.id,
      )
      .map((p) => p.id);
    const schedules = s.schedules.filter(
      (sc) =>
        sc.active &&
        sc.start_on <= last &&
        (!sc.end_on || sc.end_on >= first) &&
        propertyCustomer.get(sc.property_id) === c.id,
    );
    const techs = [
      ...new Set(
        schedules.length
          ? schedules.map((sc) => sc.technician_id)
          : planned
              .filter((st) => propertyCustomer.get(st.property_id) === c.id)
              .map((st) => st.technician_id),
      ),
    ];
    customerMap.set(c.id, {
      id: c.id,
      name: c.name,
      active: c.status === "active",
      monthlyRevenue:
        c.status !== "active"
          ? (input.records.receipts.find((r) => r.customer_id === c.id)
              ?.cents ?? null)
          : monthly.length
            ? monthly.reduce((n, a) => n + a.price_cents, 0)
            : null,
      expectedVisits: 0,
      completedVisits: 0,
      delegated: techs.some((t) => !owners.has(t)),
      technicians: techs,
      poolIds: pools,
      rate: null,
      mixedRates: false,
      forecast: blank(),
      completed: blank(),
    });
  }
  const work = new Map<string, BusinessReport["workload"][number]>();
  for (const t of s.technicians) {
    const schedules = s.schedules.filter(
      (sc) =>
        sc.technician_id === t.id &&
        sc.active &&
        sc.start_on <= last &&
        (!sc.end_on || sc.end_on >= first) &&
        ownedIds.has(propertyCustomer.get(sc.property_id) ?? ""),
    );
    const properties = new Set(schedules.map((sc) => sc.property_id));
    const explicit = config.terms.find(
      (v) => v.scope === "technician" && v.target === t.id,
    );
    const term = explicit ?? config.terms.find((t) => t.scope === "default")!;
    work.set(t.id, {
      id: t.id,
      name: t.display_name,
      role: owners.has(t.id) ? "owner" : "technician",
      pools: s.pools.filter(
        (p) => p.status === "active" && properties.has(p.property_id),
      ).length,
      expected: 0,
      completed: 0,
      payment: 0,
      rate: owners.has(t.id) && !explicit ? null : term.rate_cents,
    });
  }
  const resolve = (customer: string, tech: string) => {
    const personal = config.terms.find(
      (t) => t.scope === "technician" && t.target === tech,
    );
    if (owners.has(tech) && personal)
      return { term: personal, ambiguous: false };
    const ids = allContracts
      .filter((c) => c.customer_id === customer && c.source === "own")
      .map((c) => c.id);
    const specific = config.terms.filter(
      (t) => t.scope === "contract" && ids.includes(t.target),
    );
    const distinct = new Set(
      specific.map((t) =>
        [t.model, t.rate_cents, t.extra_visit_cents].join(":"),
      ),
    );
    return {
      term:
        specific[0] ??
        config.terms.find(
          (t) => t.scope === "technician" && t.target === tech,
        ) ??
        config.terms.find((t) => t.scope === "default")!,
      ambiguous: distinct.size > 1,
    };
  };
  const rateSets = new Map<string, Set<number>>();
  for (const basis of ["forecast", "completed"] as const) {
    const events = basis === "forecast" ? planned : completed;
    const monthly = new Map<
      string,
      {
        rate: number | null;
        pairs: Map<
          string,
          { customer: string; tech: string; owner: boolean; weight: number }
        >;
      }
    >();
    const monthlyAssign = (
      customer: string,
      tech: string,
      term: Term,
      weight: number,
    ) => {
      if (term.model !== "monthly") return;
      const key =
        term.scope +
        ":" +
        term.target +
        (term.scope === "contract" ? "" : ":" + tech);
      const group = monthly.get(key) ?? {
        rate: term.rate_cents,
        pairs: new Map<
          string,
          { customer: string; tech: string; owner: boolean; weight: number }
        >(),
      };
      const pairKey = customer + ":" + tech;
      const pair = group.pairs.get(pairKey) ?? {
        customer,
        tech,
        owner: owners.has(tech),
        weight: 0,
      };
      pair.weight += weight;
      group.pairs.set(pairKey, pair);
      monthly.set(key, group);
    };
    const charge = (
      c: BusinessCustomer,
      tech: string,
      amount: number | null,
      owner: boolean,
    ) => {
      const m = c[basis];
      const key = owner ? "ownerLabor" : "technicianPayments";
      if (amount === null) m[key] = null;
      else if (m[key] !== null) m[key]! += amount;
      if (basis === "completed") {
        const w = work.get(tech);
        if (w) {
          if (amount === null) w.payment = null;
          else if (w.payment !== null) w.payment += amount;
        }
      }
    };
    for (const stop of events) {
      const c = customerMap.get(propertyCustomer.get(stop.property_id)!)!;
      const visit = visitMap.get(stop.id);
      const tech =
        basis === "completed" ? visit!.technician_id : stop.technician_id;
      const resolved = resolve(c.id, tech);
      const term =
        basis === "completed" && visit?.terms ? visit.terms : resolved.term;
      const owner = owners.has(tech);
      const explicitlyPriced =
        term.scope === "technician" && term.target === tech;
      c[basis === "forecast" ? "expectedVisits" : "completedVisits"]++;
      const w = work.get(tech);
      if (w) w[basis === "forecast" ? "expected" : "completed"]++;
      if (owner && !explicitlyPriced) {
        c[basis].unpricedOwnerVisits++;
        c[basis].ownerLabor = null;
        continue;
      }
      const unknown =
        resolved.ambiguous ||
        (basis === "completed" && visit?.termsKnown === false);
      const rates = rateSets.get(c.id) ?? new Set<number>();
      if (basis === "forecast" && term.rate_cents !== null)
        rates.add(term.rate_cents);
      rateSets.set(c.id, rates);
      let amount =
        term.model === "monthly"
          ? 0
          : stop.schedule_id === null
            ? (term.extra_visit_cents ?? term.rate_cents)
            : term.rate_cents;
      const additional =
        input.records.additional.find((x) => x.stop_id === stop.id)?.count ?? 0;
      if (additional) {
        if (term.additional_service_cents === null) amount = null;
        else if (amount !== null)
          amount += additional * term.additional_service_cents;
      }
      if (unknown) amount = null;
      if (amount === null && !owner) c[basis].unpricedTechnicianVisits++;
      charge(c, tech, amount, owner);
      if (term.model === "monthly") monthlyAssign(c.id, tech, term, 1);
    }
    // Preserve optional pre-existing monthly payout agreements; never turn them into per-visit rates.
    for (const sc of s.schedules.filter(
      (sc) =>
        sc.active && sc.start_on <= last && (!sc.end_on || sc.end_on >= first),
    )) {
      const customer = propertyCustomer.get(sc.property_id);
      if (!customerMap.has(customer ?? "")) continue;
      const { term } = resolve(customer!, sc.technician_id);
      if (
        term.model === "monthly" &&
        (!owners.has(sc.technician_id) ||
          (term.scope === "technician" && term.target === sc.technician_id))
      )
        monthlyAssign(customer!, sc.technician_id, term, 0);
    }
    for (const group of monthly.values()) {
      const pairs = [...group.pairs.values()].sort((a, b) =>
        (a.customer + a.tech).localeCompare(b.customer + b.tech),
      );
      const weights = pairs.map((p) => p.weight);
      const shares = allocate(
        group.rate ?? 0,
        weights.some(Boolean) ? weights : pairs.map(() => 1),
      );
      pairs.forEach((p, i) =>
        charge(
          customerMap.get(p.customer)!,
          p.tech,
          group.rate === null ? null : shares[i],
          p.owner,
        ),
      );
    }
  }
  const customers = [...customerMap.values()];
  for (const c of customers) {
    const rates = [...(rateSets.get(c.id) ?? [])];
    c.rate = rates.length === 1 ? rates[0] : null;
    c.mixedRates = rates.length > 1;
    for (const basis of ["forecast", "completed"] as const) {
      const m = c[basis];
      m.beforeOwnerLabor =
        c.monthlyRevenue === null || m.technicianPayments === null
          ? null
          : c.monthlyRevenue - m.technicianPayments;
      m.contribution =
        m.beforeOwnerLabor === null || m.ownerLabor === null
          ? null
          : m.beforeOwnerLabor - m.ownerLabor;
      m.margin =
        m.contribution === null || !c.monthlyRevenue
          ? null
          : ratio(m.contribution, c.monthlyRevenue);
    }
  }
  const total = (key: "contribution" | "beforeOwnerLabor") =>
    customers.some((c) => c.forecast[key] === null)
      ? null
      : customers.reduce((n, c) => n + c.forecast[key]!, 0);
  const missingWork = input.stops.some(
    (st) =>
      st.service_date.startsWith(month) &&
      confirmedIds.has(st.id) &&
      !propertyCustomer.has(st.property_id),
  );
  const estimatedContribution = missingWork ? null : total("contribution");
  const warnings: string[] = [];
  if (missingWork)
    warnings.push(
      "Some confirmed work is missing period context. Review the historical sources.",
    );
  if (customers.some((c) => c.forecast.unpricedOwnerVisits))
    warnings.push(
      "Owner labor is unpriced. Revenue before your labor is not contribution or net profit.",
    );
  if (customers.some((c) => c.forecast.unpricedTechnicianVisits))
    warnings.push(
      "Set a per-visit payment for delegated work to estimate contribution.",
    );
  if (s.historical_unverified)
    warnings.push(
      "Historical schedules were not captured. Expected visits use the available source data.",
    );
  return {
    month,
    ownedCustomers: customers.filter((c) => c.active).length,
    delegatedCustomers: customers.filter((c) => c.active && c.delegated).length,
    ownedMrr: customers
      .filter(
        (c) =>
          c.active &&
          s.schedules.some(
            (sc) =>
              sc.active &&
              sc.start_on <= last &&
              (!sc.end_on || sc.end_on >= first) &&
              propertyCustomer.get(sc.property_id) === c.id,
          ),
      )
      .reduce((n, c) => n + (c.monthlyRevenue ?? 0), 0),
    estimatedContribution,
    averageContribution:
      estimatedContribution === null || !customers.length
        ? null
        : (estimatedContribution < 0 ? -1 : 1) *
          fraction(Math.abs(estimatedContribution), 1, customers.length),
    beforeOwnerLabor: missingWork ? null : total("beforeOwnerLabor"),
    customers,
    workload: [...work.values()].filter(
      (w) => w.pools || w.expected || w.completed || owners.has(w.id),
    ),
    warnings,
    archivedFinancials: input.archivedFinancials ?? false,
  };
}
