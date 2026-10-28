import { getOperator } from "@/lib/auth";
import { bundleSchema } from "@/lib/onboarding";
import { apiError, boundedJson, json, sameOrigin } from "@/lib/http";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid origin." }, 403);
  try {
    const op = await getOperator();
    if (!op || !["owner", "admin"].includes(op.profile.role))
      return json({ error: "Manager access required." }, 403);
    const payload = bundleSchema.parse(await boundedJson(request, 180000));
    const { data, error } = await op.db.rpc("save_customer_bundle", {
      p_payload: payload,
    });
    if (error)
      return json(
        {
          error:
            error.code === "22023"
              ? "Check the schedule and required fields. Finish any in-progress visit before changing its schedule."
              : "The customer was not saved. Check access and linked records; no partial changes were committed.",
        },
        422,
      );
    return json({ id: data });
  } catch (error) {
    return apiError(error);
  }
}
