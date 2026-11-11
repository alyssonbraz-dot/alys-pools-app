import { z } from "zod";
import { getOperator } from "@/lib/auth";
import { boundedJson, json, sameOrigin } from "@/lib/http";
import { administration } from "@/lib/team/server";
import { configSchema, monthSchema, recordsSchema } from "@/lib/finance/schema";
import {
  loadFinance,
  liveSources,
  validateRecordsOwnership,
} from "@/lib/finance/server";
export async function GET(request: Request) {
  const op = await getOperator();
  if (!op || op.profile.role !== "owner")
    return json({ error: "Owner required." }, 403);
  const month = monthSchema.safeParse(
    new URL(request.url).searchParams.get("month"),
  );
  if (!month.success) return json({ error: "Invalid month." }, 400);
  try {
    const data = await loadFinance(op.db, month.data);
    const { data: history, error } = await op.db
      .from("finance_closed_periods")
      .select("month,payload")
      .order("month", { ascending: false })
      .limit(12);
    if (error) throw error;
    return json({
      ...data,
      history: (history ?? []).map((h) => ({
        month: h.month.slice(0, 7),
        forecast: h.payload.report.forecast,
        recorded: h.payload.report.recorded,
        pools: h.payload.report.pools.map(
          (p: { id: string; forecast: unknown; recorded: unknown }) => ({
            id: p.id,
            forecast: p.forecast,
            recorded: p.recorded,
          }),
        ),
      })),
    });
  } catch {
    return json(
      {
        error:
          "Finance unavailable. Check the finance migration and server configuration.",
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
        action: z.enum(["open", "config", "records", "close"]),
        month: monthSchema,
        id: z.uuid(),
        expected: z.uuid().nullable().default(null),
        payload: z.unknown(),
      })
      .parse(await boundedJson(request, 300000));
    const data = await loadFinance(op.db, body.month);
    let payload: unknown;
    if (body.action === "config") {
      payload = configSchema.parse(body.payload);
      const cfg = payload as z.infer<typeof configSchema>;
      for (const t of cfg.terms)
        if (
          (t.scope === "technician" &&
            !data.sources.technicians.some((x) => x.id === t.target)) ||
          (t.scope === "contract" &&
            !data.sources.contracts.some((x) => x.id === t.target))
        )
          return json({ error: "Invalid terms scope." }, 400);
    } else if (body.action === "records") {
      payload = recordsSchema.parse(body.payload);
      validateRecordsOwnership(
        payload as z.infer<typeof recordsSchema>,
        data.sources,
        data.config,
        data.stops,
      );
    } else if (body.action === "open") {
      payload = await liveSources(op.db, body.month);
    } else {
      const current = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/New_York",
      })
        .format(new Date())
        .slice(0, 7);
      if (body.month >= current)
        return json({ error: "Only previous months can be closed." }, 400);
      if (data.report.recorded.profit === null || !data.sourceSaved)
        return json(
          {
            error:
              "Complete recorded revenue, costs and period sources before closing.",
          },
          400,
        );
      payload = {
        report: data.report,
        sources: data.sources,
        config: data.config,
        records: data.records,
        config_id: data.config_id,
      };
    }
    const { error } = await administration().rpc("write_finance", {
      p_org: op.profile.organization_id,
      p_actor: op.user.id,
      p_id: body.id,
      p_action: body.action,
      p_month: body.month + "-01",
      p_payload: payload,
      p_expected: body.expected,
    });
    if (error)
      return json(
        {
          error:
            error.code === "40001"
              ? "Finance changed in another tab. Reload before saving."
              : "Unable to save. Historical settings and closed periods are protected.",
        },
        error.code === "40001" ? 409 : 400,
      );
    return json({ ok: true });
  } catch (e) {
    return json(
      {
        error:
          e instanceof z.ZodError
            ? "Check financial values and duplicate records."
            : e instanceof Error &&
                [
                  "This expense is covered by the technician payout.",
                  "Invalid financial reference.",
                  "Invalid pool.",
                ].includes(e.message)
              ? e.message
              : "Unable to save financial data.",
      },
      400,
    );
  }
}
