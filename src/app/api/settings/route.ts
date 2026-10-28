import { z } from "zod";
import { getOperator } from "@/lib/auth";
import { defaultsSchema } from "@/lib/company-settings";
import { apiError, boundedJson, json, sameOrigin } from "@/lib/http";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid origin." }, 403);
  try {
    const op = await getOperator();
    if (!op || op.profile.role !== "owner")
      return json({ error: "Owner required." }, 403);
    const input = z
      .object({
        name: z.string().trim().min(2).max(100),
        defaults: defaultsSchema,
      })
      .parse(await boundedJson(request, 16000));
    const { error } = await op.db.rpc("save_company_settings", {
      p_name: input.name,
      p_settings: { service_defaults: input.defaults },
    });
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
