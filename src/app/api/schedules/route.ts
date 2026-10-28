import { getOperator } from "@/lib/auth";
import { apiError, boundedJson, json, sameOrigin } from "@/lib/http";
import { scheduleSchema } from "@/lib/validation";
import { z } from "zod";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid origin." }, 403);
  try {
    const op = await getOperator();
    if (!op || !["owner", "admin"].includes(op.profile.role))
      return json({ error: "Manager required." }, 403);
    const payload = scheduleSchema
      .safeExtend({
        id: z.uuid().optional(),
        service_notes: z.string().max(2000).default(""),
      })
      .parse(await boundedJson(request, 6000));
    const { data, error } = await op.db.rpc("save_service_schedule", {
      p_payload: payload,
    });
    if (error)
      return json(
        {
          error:
            "Schedule not saved. Check the technician and finish or skip in-progress visits first.",
        },
        422,
      );
    return json({ id: data });
  } catch (error) {
    return apiError(error);
  }
}
