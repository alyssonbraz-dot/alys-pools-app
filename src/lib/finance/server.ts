import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows, forIds } from "@/lib/pagination";
import {
  calculate,
  type Sources,
  type Stop,
  type Completed,
  type Report,
} from "./model";
import {
  configSchema,
  recordsSchema,
  emptyConfig,
  emptyRecords,
  termSchema,
} from "./schema";
export async function liveSources(
  db: SupabaseClient,
  month: string,
): Promise<Sources> {
  const [pools, properties, customers, contracts, schedules, technicians] =
    await Promise.all([
      allRows((a, b) =>
        db
          .from("pools")
          .select("id,property_id,name,status")
          .order("id")
          .range(a, b),
      ),
      allRows((a, b) =>
        db
          .from("properties")
          .select("id,customer_id,address")
          .order("id")
          .range(a, b),
      ),
      allRows((a, b) =>
        db.from("customers").select("id,name,status").order("id").range(a, b),
      ),
      allRows((a, b) =>
        db
          .from("contracts")
          .select("id,customer_id,source,billing_model,price_cents,status")
          .order("id")
          .range(a, b),
      ),
      allRows((a, b) =>
        db
          .from("recurring_schedules")
          .select(
            "id,property_id,technician_id,days_of_week,start_on,end_on,active",
          )
          .order("id")
          .range(a, b),
      ),
      allRows((a, b) =>
        db
          .from("profiles")
          .select("id,display_name")
          .in("role", ["owner", "admin", "technician"])
          .order("id")
          .range(a, b),
      ),
    ]);
  const current = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/New_York",
  })
    .format(new Date())
    .slice(0, 7);
  return {
    pools,
    properties,
    customers,
    contracts,
    schedules,
    technicians,
    captured_at: new Date().toISOString(),
    historical_unverified: month < current,
  };
}
export async function loadFinance(db: SupabaseClient, month: string) {
  const [source, version, latest, records, closed] = await Promise.all([
    db
      .from("finance_period_sources")
      .select("payload")
      .eq("month", month + "-01")
      .maybeSingle(),
    db
      .from("finance_config_versions")
      .select("id,payload,effective_month")
      .lte("effective_month", month + "-01")
      .order("effective_month", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("finance_config_versions")
      .select("id")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("finance_record_versions")
      .select("id,payload")
      .eq("month", month + "-01")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("finance_closed_periods")
      .select("payload,created_at")
      .eq("month", month + "-01")
      .maybeSingle(),
  ]);
  if ([source, version, latest, records, closed].some((x) => x.error))
    throw new Error("Finance unavailable. Apply the local finance migration.");
  // Current open periods reuse live customer/contract/schedule data. Closing freezes every input.
  const current = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/New_York",
  })
    .format(new Date())
    .slice(0, 7);
  const sources =
    (closed.data?.payload?.sources as Sources) ??
    (month === current
      ? await liveSources(db, month)
      : ((source.data?.payload as Sources) ?? (await liveSources(db, month))));
  const cfg = closed.data?.payload?.config ?? version.data?.payload;
  const config = cfg ? configSchema.parse(cfg) : emptyConfig();
  const actuals = recordsSchema.parse(
    closed.data?.payload?.records ?? records.data?.payload ?? emptyRecords(),
  );
  const start = month + "-01",
    end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)
      .toISOString()
      .slice(0, 10);
  const stops = (await allRows((a, b) =>
    db
      .from("route_stops")
      .select("id,property_id,technician_id,service_date,status,schedule_id")
      .gte("service_date", start)
      .lt("service_date", end)
      .order("id")
      .range(a, b),
  )) as Stop[];
  const ids = stops.map((s) => s.id),
    visits: Completed[] = [];
  for (let i = 0; i < ids.length; i += 100)
    visits.push(
      ...((await allRows((a, b) =>
        db
          .from("visits")
          .select("id,route_stop_id,technician_id")
          .in("route_stop_id", ids.slice(i, i + 100))
          .order("id")
          .range(a, b),
      )) as Completed[]),
    );
  const terms = await forIds(
    visits.map((v) => v.id),
    (ids, a, b) =>
      db
        .from("finance_visit_terms")
        .select("visit_id,payload")
        .in("visit_id", ids)
        .order("visit_id")
        .range(a, b),
  );
  for (const visit of visits) {
    const snapshot = terms.find((t) => t.visit_id === visit.id);
    visit.termsKnown = !!snapshot;
    if (snapshot) visit.terms = termSchema.parse(snapshot.payload);
  }
  const report =
    (closed.data?.payload?.report as Report) ??
    calculate({
      month,
      sources,
      config,
      records: actuals,
      stops,
      visits,
      configKnown: !!cfg,
    });
  return {
    month,
    sources,
    config,
    records: actuals,
    report,
    config_id: version.data?.id ?? null,
    latest_config_id: latest.data?.id ?? null,
    records_id: records.data?.id ?? null,
    sourceSaved: !!source.data,
    closed: !!closed.data,
    closed_at: closed.data?.created_at ?? null,
    stops,
    visits,
  };
}
export function validateRecordsOwnership(
  records: ReturnType<typeof recordsSchema.parse>,
  sources: Sources,
  config: ReturnType<typeof configSchema.parse>,
  stops: Stop[],
) {
  const customers = new Set(sources.customers.map((c) => c.id)),
    pools = new Set(sources.pools.map((p) => p.id));
  if (
    records.receipts.some((r) => !customers.has(r.customer_id)) ||
    records.company.some(
      (r) => !config.costs.some((c) => c.id === r.category),
    ) ||
    records.direct_complete.some((id) => !pools.has(id)) ||
    records.additional.some((r) => !stops.some((s) => s.id === r.stop_id))
  )
    throw new Error("Invalid financial reference.");
  for (const e of records.direct) {
    if (!pools.has(e.pool_id)) throw new Error("Invalid pool.");
    if (e.category === "other") continue;
    const p = sources.pools.find((p) => p.id === e.pool_id)!,
      property = sources.properties.find((pr) => pr.id === p.property_id)!;
    const contracts = sources.contracts.filter(
      (c) => c.customer_id === property.customer_id && c.status === "active",
    );
    const techs = new Set([
      ...stops
        .filter((s) => s.property_id === property.id)
        .map((s) => s.technician_id),
      ...sources.schedules
        .filter((s) => s.property_id === property.id && s.active)
        .map((s) => s.technician_id),
    ]);
    const possible = [...techs].map(
      (tech) =>
        config.terms.find(
          (t) =>
            t.scope === "contract" && contracts.some((c) => c.id === t.target),
        ) ??
        config.terms.find(
          (t) => t.scope === "technician" && t.target === tech,
        ) ??
        config.terms.find((t) => t.scope === "default")!,
    );
    if (!possible.length)
      possible.push(config.terms.find((t) => t.scope === "default")!);
    if (possible.every((t) => t[e.category as "chemicals"] === "technician"))
      throw new Error("This expense is covered by the technician payout.");
  }
}
