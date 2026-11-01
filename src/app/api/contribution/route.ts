import { z } from "zod";
import { getOperator } from "@/lib/auth";
import { boundedJson, json, sameOrigin } from "@/lib/http";
import { administration } from "@/lib/team/server";
import { loadBusiness } from "@/lib/business/server";
import { monthSchema } from "@/lib/finance/schema";
export async function GET(request: Request) {
  const op = await getOperator();
  if (!op || op.profile.role !== "owner")
    return json({ error: "Owner required." }, 403);
  const month = monthSchema.safeParse(
    new URL(request.url).searchParams.get("month"),
  );
  if (!month.success) return json({ error: "Invalid month." }, 400);
  try {
    const data = await loadBusiness(op.db, month.data, op.user.id);
    return json({
      report: data.report,
      latest_config_id: data.latest_config_id,
      terms: data.terms,
      legacyRates: data.legacyRates,
      customers: data.sources.customers,
      technicians: data.sources.technicians,
      contracts: data.sources.contracts,
    });
  } catch {
    return json(
      {
        error:
          "Contribution unavailable. Check your connection and migrations.",
      },
      503,
    );
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid origin." }, 403);
  const op = await getOperator();
  if (!op || op.profile.role !== "owner")
    return json({ error: "Owner required." }, 403);
  try {
    const body = z
      .object({
        id: z.uuid(),
        month: monthSchema,
        expected: z.uuid().nullable(),
        target: z.enum(["technician", "customer"]),
        target_id: z.uuid(),
        rate_cents: z.number().int().min(0).max(1000000000).nullable(),
      })
      .parse(await boundedJson(request, 3000));
    const data = await loadBusiness(op.db, body.month, op.user.id);
    let target = body.target_id;
    const scope = body.target === "technician" ? "technician" : "contract";
    if (body.target === "technician") {
      if (!data.sources.technicians.some((t) => t.id === target))
        return json({ error: "Technician unavailable." }, 404);
    } else {
      const contract = data.sources.contracts
        .filter(
          (c) =>
            c.customer_id === target &&
            c.source === "own" &&
            c.status === "active" &&
            c.billing_model === "monthly",
        )
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (!contract)
        return json(
          {
            error:
              "Add an owned monthly agreement before setting a customer payment.",
          },
          422,
        );
      target = contract.id;
    }
    const config = structuredClone(data.config);
    const old = config.terms.find(
      (t) => t.scope === scope && t.target === target,
    );
    config.terms = config.terms.filter(
      (t) => t.scope !== scope || t.target !== target,
    );
    if (body.rate_cents !== null)
      config.terms.push({
        ...(old ?? config.terms.find((t) => t.scope === "default")!),
        scope,
        target,
        model: "per_visit",
        rate_cents: body.rate_cents,
        extra_visit_cents: body.rate_cents,
      });
    const { error } = await administration().rpc("write_finance", {
      p_org: op.profile.organization_id,
      p_actor: op.user.id,
      p_id: body.id,
      p_action: "config",
      p_month: body.month + "-01",
      p_payload: config,
      p_expected: body.expected,
    });
    if (error)
      return json(
        {
          error:
            error.code === "40001"
              ? "Finance changed in another tab. Reload before saving."
              : "Historical configuration is locked. Select the current or a future month.",
        },
        error.code === "40001" ? 409 : 422,
      );
    return json({ ok: true });
  } catch {
    return json({ error: "Unable to save the per-visit payment." }, 400);
  }
}
