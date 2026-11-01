import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { forIds } from "@/lib/pagination";
import { loadFinance } from "@/lib/finance/server";
import { contribution } from "./contribution";
export async function loadBusiness(
  db: SupabaseClient,
  month: string,
  ownerId: string,
) {
  const data = await loadFinance(db, month);
  const { data: roles, error } = await db.from("profiles").select("id,role");
  if (error) throw new Error("Team unavailable.");
  const legacy = await db
    .from("customer_profit_costs")
    .select("customer_id,technician_cost_per_visit_cents");
  if (legacy.error && !["42P01", "PGRST205"].includes(legacy.error.code))
    throw new Error("Legacy settings unavailable.");
  const config = structuredClone(data.config);
  const captured = await forIds(
    [
      ...new Set(
        data.visits
          .map((v) => v.finance_config_id)
          .filter((id): id is string => !!id),
      ),
    ],
    (ids, a, b) =>
      db
        .from("finance_config_versions")
        .select("id,payload")
        .in("id", ids)
        .order("id")
        .range(a, b),
  );
  const ownerIds = [
    ownerId,
    ...(roles ?? [])
      .filter((t) => t.role === "owner" || t.role === "admin")
      .map((t) => t.id),
  ];
  for (const visit of data.visits) {
    if (!ownerIds.includes(visit.technician_id)) continue;
    const personal = (
      captured.find((c) => c.id === visit.finance_config_id)?.payload.terms as
        | typeof config.terms
        | undefined
    )?.find(
      (t) => t.scope === "technician" && t.target === visit.technician_id,
    );
    if (personal) visit.terms = personal;
  }
  const report = contribution({
    month,
    sources: data.sources,
    config,
    records: data.records,
    stops: data.stops,
    visits: data.visits,
    configKnown: !!data.config_id,
    ownerIds: [
      ownerId,
      ...(roles ?? [])
        .filter((t) => t.role === "owner" || t.role === "admin")
        .map((t) => t.id),
    ],
    archivedFinancials: data.closed,
  });
  return {
    report,
    latest_config_id: data.latest_config_id,
    config_id: data.config_id,
    terms: data.config.terms,
    config: data.config,
    legacyRates: (legacy.data ?? [])
      .filter((r) => r.technician_cost_per_visit_cents > 0)
      .map((r) => ({
        customer_id: r.customer_id,
        rate_cents: r.technician_cost_per_visit_cents,
      })),
    sources: data.sources,
  };
}
