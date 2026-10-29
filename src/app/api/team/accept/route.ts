import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { administration, tokenDigest } from "@/lib/team/server";
import { supabase } from "@/lib/supabase/server";
import { apiError, boundedJson, json, sameOrigin } from "@/lib/http";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid origin." }, 403);
  try {
    const input = z
      .object({
        invitation: z.uuid(),
        token_hash: z.string().min(32).max(256),
        password: z.string().min(16).max(128),
      })
      .parse(await boundedJson(request, 3000));
    const admin = administration();
    const { data: invite } = await admin
      .from("team_invitations")
      .select("*")
      .eq("id", input.invitation)
      .single();
    const digest = tokenDigest(input.token_hash);
    if (
      !invite ||
      !invite.token_digest ||
      invite.token_digest.length !== digest.length ||
      !timingSafeEqual(Buffer.from(invite.token_digest), Buffer.from(digest)) ||
      !["sent", "failed", "prepared"].includes(invite.state) ||
      Date.parse(invite.expires_at) < Date.now()
    )
      return json({ error: "Invitation is invalid, revoked or expired." }, 410);
    const db = await supabase();
    let {
      data: { user },
    } = await db.auth.getUser();
    if (user?.id !== invite.user_id) {
      const { data, error } = await db.auth.verifyOtp({
        type: "invite",
        token_hash: input.token_hash,
      });
      if (error || !data.user || data.user.id !== invite.user_id)
        return json(
          {
            error:
              "Invitation could not be verified. Request a new invitation.",
          },
          410,
        );
      user = data.user;
    }
    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id,role,access_state")
      .eq("id", user!.id)
      .single();
    if (
      !profile ||
      profile.role !== invite.invited_role ||
      profile.organization_id !== invite.organization_id ||
      profile.access_state !== "invited"
    )
      return json({ error: "This invitation cannot change the account." }, 403);
    const { error: passwordError } = await db.auth.updateUser({
      password: input.password,
    });
    if (passwordError)
      return json(
        {
          error:
            "Password was not accepted. Choose a strong unique password and retry.",
        },
        422,
      );
    const { data, error } = await admin.rpc("accept_team_invitation", {
      p_id: invite.id,
      p_user: user!.id,
    });
    if (error || !data)
      return json(
        { error: "Invitation changed. Contact the owner before continuing." },
        409,
      );
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
