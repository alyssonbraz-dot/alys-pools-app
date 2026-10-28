import { z } from "zod";
import { getOperator } from "@/lib/auth";
import { apiError, boundedJson, json, sameOrigin } from "@/lib/http";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid origin." }, 403);
  try {
    const op = await getOperator();
    if (!op || !op.user.email) return json({ error: "Sign in required." }, 401);
    const input = z
      .object({
        current_password: z.string().min(1).max(128),
        password: z.string().min(16).max(128),
      })
      .parse(await boundedJson(request, 3000));
    const { error: verified } = await op.db.auth.signInWithPassword({
      email: op.user.email,
      password: input.current_password,
    });
    if (verified) return json({ error: "Current password is incorrect." }, 403);
    const { error } = await op.db.auth.updateUser({ password: input.password });
    if (error)
      return json(
        {
          error:
            "Password was not updated. Check your Auth security policy and sign in again before retrying.",
        },
        422,
      );
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
