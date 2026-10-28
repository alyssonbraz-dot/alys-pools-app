import { getOperator } from "@/lib/auth";
import { json, apiError } from "@/lib/http";
import { z } from "zod";
export async function GET(request: Request) {
  try {
    const op = await getOperator();
    if (!op) return json({ error: "Sign in required." }, 401);
    const p = new URL(request.url).searchParams;
    const query = z
      .object({
        property_id: z.uuid(),
        pool_id: z.uuid().nullable(),
        period: z.enum(["7", "30", "90", "all"]),
        offset: z.coerce.number().int().min(0).max(1000000),
      })
      .parse({
        property_id: p.get("property_id"),
        pool_id: p.get("pool_id"),
        period: p.get("period") ?? "30",
        offset: p.get("offset") ?? 0,
      });
    const { data, error } = await op.db.rpc("chemistry_ledger", {
      p_property: query.property_id,
      p_pool: query.pool_id,
      p_days: query.period === "all" ? null : Number(query.period),
      p_offset: query.offset,
    });
    if (error)
      return json(
        { error: "Chemical history is unavailable for this property." },
        403,
      );
    return json({
      rows: data?.slice(0, 50) ?? [],
      hasMore: (data?.length ?? 0) > 50,
    });
  } catch (e) {
    return apiError(e);
  }
}
