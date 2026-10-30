import {customerValidationMessage} from "@/lib/customer-errors";
import { getOperator } from "@/lib/auth";
import { bundleSchema } from "@/lib/onboarding";
import { apiError, boundedJson, json, sameOrigin } from "@/lib/http";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid origin." }, 403);
  try {
    const op = await getOperator();
    if (!op || !["owner", "admin"].includes(op.profile.role))
      return json({ error: "Manager access required." }, 403);
    const parsed=bundleSchema.safeParse(await boundedJson(request,180000));
    if(!parsed.success)return json({error:"Review the fields below and try again.",fieldErrors:parsed.error.issues.map(i=>({path:i.path.join("."),message:customerValidationMessage(i.path.join("."))}))},422);
    const payload=parsed.data;
    const { data, error } = await op.db.rpc("save_customer_bundle", {
      p_payload: payload,
    });
    if(error){
      const detail=error.details?.match(/^ALYS_FIELD:([a-zA-Z0-9_.]+)$/)?.[1];
      const messages:Record<string,string>={"ALYS_SCHEDULE_CONFLICT":"This change would alter a visit in progress. Finish or skip that visit before changing these service terms.","ALYS_TECHNICIAN":"Select an active technician from this organization.","ALYS_WEEKDAYS":"Select between one and seven distinct service days.","ALYS_DATES":"The end date must be on or after the start date.","ALYS_REQUEST_REUSED":"This save request already completed with different data. Reload the customer before editing again."};
      const message=messages[error.message]??"The customer was not saved. Review the identified field and your access; no partial changes were committed.";
      return json({error:message,code:Object.hasOwn(messages,error.message)?error.message:'CUSTOMER_SAVE_REJECTED',fieldErrors:[{path:detail??'customer',message}]},error.code==='42501'?403:422);
    }
    return json({ id: data });
  } catch (error) {
    return apiError(error);
  }
}
