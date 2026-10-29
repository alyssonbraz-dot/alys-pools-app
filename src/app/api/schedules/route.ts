import {customerValidationMessage,scheduleSaveMessage} from "@/lib/customer-errors";
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
    const parsed = scheduleSchema
      .safeExtend({
        id: z.uuid().optional(),
        service_notes: z.string().max(2000).default(""),
      })
      .safeParse(await boundedJson(request, 6000));
    if(!parsed.success)return json({error:"Review the fields below and try again.",fieldErrors:parsed.error.issues.map(i=>({path:i.path.join("."),message:customerValidationMessage(i.path.join("."))}))},422);
    const payload=parsed.data;
    const { data, error } = await op.db.rpc("save_service_schedule", {
      p_payload: payload,
    });
    if(error)return json({error:scheduleSaveMessage(error.message),fieldErrors:[{path:'days_of_week',message:scheduleSaveMessage(error.message)}]},error.code==='42501'?403:422);
    return json({ id: data });
  } catch (error) {
    return apiError(error);
  }
}
