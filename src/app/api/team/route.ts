import { z } from "zod";
import { getOperator } from "@/lib/auth";
import { apiError, boundedJson, json, sameOrigin } from "@/lib/http";
import { administration, tokenDigest } from "@/lib/team/server";
import { emailConfiguration } from "@/lib/email/config";
import { sendReport } from "@/lib/email/provider";
import { escapeHtml } from "@/lib/email/report";
const command = z.object({
  action: z.enum(["invite", "resend", "revoke", "access", "assign", "edit"]),
  id: z.uuid(),
  email: z.email().max(254).optional(),
  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().max(49).default(""),
  phone: z.string().max(30).default(""),
  notes: z.string().max(2000).default(""),
  state: z.enum(["active", "suspended", "inactive"]).optional(),
  properties: z.array(z.uuid()).max(200).default([]),
});
export async function GET() {
  try {
    const op = await getOperator();
    if (!op || op.profile.role !== "owner")
      return json({ error: "Owner access required." }, 403);
    const { db } = op;
    const [people, invites, assignments, properties, stops, pools, schedules] =
      await Promise.all([
        db
          .from("profiles")
          .select(
            "id,display_name,role,access_state,team_member_details(phone,notes)",
          )
          .eq("role", "technician"),
        db
          .from("team_invitations")
          .select("id,email,display_name,phone,notes,user_id,state,expires_at")
          .order("created_at", { ascending: false })
          .limit(200),
        db
          .from("technician_property_assignments")
          .select("technician_id,property_id,active"),
        db.from("properties").select("id,name,address,customer_id"),
        db
          .from("route_stops")
          .select("id,property_id,technician_id,service_date,status")
          .eq(
            "service_date",
            new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/New_York",
            }).format(new Date()),
          ),
        db.from("pools").select("id,property_id").eq("status", "active"),
        db
          .from("recurring_schedules")
          .select("property_id,technician_id")
          .eq("active", true),
      ]);
    const { data: contacts, error: contactsError } =
      await db.rpc("team_contacts");
    if (contactsError) throw contactsError;
    if (
      [people, invites, assignments, properties, stops, pools, schedules].some(
        (r) => r.error,
      )
    )
      throw new Error("Team query failed");
    const effective = [
      ...(assignments.data ?? []).filter((a) => a.active),
      ...(schedules.data ?? []).map((s) => ({ ...s, active: true })),
    ];
    const selected = [
      ...new Map(
        effective.map((a) => [a.technician_id + ":" + a.property_id, a]),
      ).values(),
    ];
    const poolCounts = Object.fromEntries(
      (people.data ?? []).map((person) => {
        const properties = new Set([
          ...selected
            .filter((a) => a.technician_id === person.id)
            .map((a) => a.property_id),
          ...(stops.data ?? [])
            .filter(
              (s) => s.technician_id === person.id && s.status !== "skipped",
            )
            .map((s) => s.property_id),
        ]);
        return [
          person.id,
          (pools.data ?? []).filter((pool) => properties.has(pool.property_id))
            .length,
        ];
      }),
    );
    return json({
      poolCounts,
      now: new Date().toISOString(),
      people: people.data?.map((p) => ({
        ...p,
        team_member_details: (Array.isArray(p.team_member_details)
          ? p.team_member_details[0]
          : p.team_member_details) ?? {
          phone: invites.data?.find((i) => i.user_id === p.id)?.phone ?? "",
          notes: invites.data?.find((i) => i.user_id === p.id)?.notes ?? "",
        },
        email:
          contacts?.find((c: { id: string; email: string }) => c.id === p.id)
            ?.email ?? "",
      })),
      invites: invites.data,
      assignments: selected,
      properties: properties.data,
      stops: stops.data,
      pools: pools.data,
      invitesEnabled: process.env.TEAM_INVITES_ENABLED === "true",
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid origin." }, 403);
  try {
    const op = await getOperator();
    if (!op || op.profile.role !== "owner")
      return json({ error: "Owner access required." }, 403);
    const input = command.parse(await boundedJson(request, 15000));
    if (input.action === "edit") {
      const { error } = await op.db.rpc("edit_technician", {
        p_id: input.id,
        p_name: [input.first_name, input.last_name].filter(Boolean).join(" "),
        p_phone: input.phone,
        p_notes: input.notes,
      });
      if (error) throw error;
      return json({ ok: true });
    }
    if (input.action === "access") {
      if (!input.state) return json({ error: "Status required." }, 422);
      const { error } = await op.db.rpc("set_technician_access", {
        p_id: input.id,
        p_state: input.state,
        p_name: input.first_name
          ? [input.first_name, input.last_name].filter(Boolean).join(" ")
          : null,
      });
      if (error) throw error;
      return json({ ok: true });
    }
    if (input.action === "assign") {
      const { error } = await op.db.rpc("assign_technician_properties", {
        p_id: input.id,
        p_properties: input.properties,
      });
      if (error)
        return json(
          {
            error:
              "Assignment not saved. Finish in-progress stops; for properties with multiple schedules, edit the specific schedule in the customer profile.",
          },
          422,
        );
      return json({ ok: true });
    }
    const admin = administration();
    if (input.action === "revoke") {
      const { data, error } = await admin
        .from("team_invitations")
        .update({ state: "revoked" })
        .eq("id", input.id)
        .eq("organization_id", op.profile.organization_id)
        .in("state", ["prepared", "sent", "failed"])
        .select("user_id");
      if (error || !data?.length) throw new Error("Invitation unavailable");
      return json({ ok: true });
    }
    // Invitation sending is independently disabled until the sender and Auth expiry
    // configuration have been reviewed. No Auth account is created while disabled.
    const delivery = emailConfiguration({
      ...process.env,
      EMAIL_DELIVERY_ENABLED: "true",
    });
    if (process.env.TEAM_INVITES_ENABLED !== "true" || !delivery)
      return json(
        {
          error:
            "Team invitations are disabled. Verify the sender and configure TEAM_INVITES_ENABLED on the server.",
        },
        503,
      );
    const org = op.profile.organization_id;
    let { data: invite } = await admin
      .from("team_invitations")
      .select("*")
      .eq("id", input.id)
      .eq("organization_id", org)
      .maybeSingle();
    if (
      invite?.send_payload &&
      Date.now() - Date.parse(invite.created_at) > 22 * 3600000
    )
      return json(
        {
          error:
            "This invitation is outside the safe resend window. Reconcile provider acceptance and revoke it before creating a new invitation.",
        },
        409,
      );
    if (
      invite &&
      input.action === "invite" &&
      input.email &&
      input.email.toLowerCase() !== invite.email
    )
      return json(
        { error: "Invitation ID is already bound to another recipient." },
        409,
      );
    if (input.action === "resend") {
      if (!invite || invite.state === "accepted" || invite.state === "revoked")
        return json(
          {
            error:
              "Invitation cannot be resent. Create a new invitation after reviewing the existing account.",
          },
          409,
        );
      // Reuse the frozen message within the provider's deduplication window. Do not
      // replace its OTP or payload after a possibly accepted provider request.
      if (Date.now() - Date.parse(invite.created_at) > 22 * 3600000)
        return json(
          {
            error:
              "Revoke this invitation and create a new one; its safe resend window has expired.",
          },
          409,
        );
    } else if (!invite) {
      if (!input.email || !input.first_name)
        return json({ error: "Name and email required." }, 422);
      const { data: prior } = await admin
        .from("team_invitations")
        .select("id")
        .eq("organization_id", org)
        .eq("email", input.email.toLowerCase())
        .in("state", ["prepared", "sent", "failed"])
        .limit(1);
      if (prior?.length)
        return json(
          {
            error:
              "An invitation already exists. Use Resend or Revoke on that invitation.",
          },
          409,
        );
      const { data, error } = await admin
        .from("team_invitations")
        .insert({
          id: input.id,
          requested_by: op.user.id,
          organization_id: org,
          email: input.email.toLowerCase(),
          display_name: [input.first_name, input.last_name]
            .filter(Boolean)
            .join(" "),
          phone: input.phone,
          notes: input.notes,
        })
        .select("*")
        .single();
      if (error) throw error;
      invite = data;
    }
    if (
      !invite ||
      ["revoked", "accepted"].includes(invite.state) ||
      Date.parse(invite.expires_at) < Date.now()
    )
      return json({ error: "Invitation unavailable or expired." }, 409);
    const { data: claimed, error: claimError } = await admin.rpc(
      "claim_team_delivery",
      { p_id: invite.id, p_org: org },
    );
    if (claimError || !claimed?.length)
      return json(
        { error: "Invitation is being processed. Wait before retrying." },
        409,
      );
    invite = claimed[0];
    if (!invite.send_payload) {
      const { data: memberships, error: identityError } = await admin.rpc(
        "team_identity",
        { p_email: invite.email },
      );
      if (identityError) throw identityError;
      if (
        memberships?.some(
          (member: {
            organization_id: string;
            role: string;
            access_state: string;
          }) =>
            member.organization_id !== org ||
            member.role !== "technician" ||
            member.access_state !== "invited",
        )
      )
        return json(
          {
            error:
              "This email already has a membership. No account or role was changed.",
          },
          409,
        );
      const { data, error } = await admin.auth.admin.generateLink({
        type: "invite",
        email: invite.email,
      });
      if (error || !data.user || !data.properties?.hashed_token)
        return json(
          {
            error:
              "Cannot create invitation. The email may already belong to an account; no role was changed.",
          },
          409,
        );
      const { data: existing } = await admin
        .from("profiles")
        .select("id,organization_id,role,access_state")
        .eq("id", data.user.id)
        .maybeSingle();
      if (
        existing &&
        (existing.organization_id !== org ||
          existing.role !== "technician" ||
          existing.access_state !== "invited")
      )
        return json(
          {
            error:
              "This account already has a membership. No role was changed.",
          },
          409,
        );
      if (!existing) {
        const { error: profileError } = await admin.from("profiles").insert({
          id: data.user.id,
          organization_id: org,
          role: "technician",
          access_state: "invited",
          display_name: invite.display_name,
        });
        if (profileError) throw profileError;
      }
      const origin = request.headers.get("origin")!;
      const link =
        origin +
        "/join#" +
        new URLSearchParams({
          invitation: invite.id,
          token_hash: data.properties.hashed_token,
        });
      const payload = {
        from: delivery.from,
        to: [invite.email],
        subject: "Your ALYS technician invitation",
        html: `<h1>Join ALYS Pool Services</h1><p>Create your own password to accept your technician invitation.</p><p><a href="${escapeHtml(link)}">Accept invitation</a></p><p>This link expires and can only be accepted once.</p>`,
        text: `Create your own password to join ALYS: ${link}`,
        attachments: [],
      };
      const { data: frozenRows, error: freezeError } = await admin
        .from("team_invitations")
        .update({
          user_id: data.user.id,
          token_digest: tokenDigest(data.properties.hashed_token),
          send_payload: payload,
        })
        .eq("id", invite.id)
        .eq("claim_token", invite.claim_token)
        .in("state", ["prepared", "failed"])
        .select("id");
      if (freezeError || !frozenRows?.length)
        return json(
          { error: "Invitation changed before delivery. No message was sent." },
          409,
        );
      invite = { ...invite, user_id: data.user.id, send_payload: payload };
    }
    if (input.properties.length) {
      const { error: assignmentError } = await op.db.rpc(
        "assign_technician_properties",
        { p_id: invite.user_id, p_properties: input.properties },
      );
      if (assignmentError)
        return json(
          {
            error:
              "Account prepared, but assignment needs review in the customer profile. Retry this invitation after correcting the schedule.",
          },
          422,
        );
    }
    const { data: currentInvitation } = await admin
      .from("team_invitations")
      .select("id")
      .eq("id", invite.id)
      .eq("claim_token", invite.claim_token)
      .in("state", ["prepared", "failed", "sent"])
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!currentInvitation)
      return json(
        {
          error:
            "Invitation was revoked, expired or is being processed elsewhere.",
        },
        409,
      );
    try {
      const receipt = await sendReport(
        invite.send_payload,
        "alys-invite-" + invite.id,
        delivery.apiKey,
      );
      const { error: recordError } = await admin
        .from("team_invitations")
        .update({
          state: "sent",
          provider_id: receipt,
          locked_until: null,
          claim_token: null,
        })
        .eq("id", invite.id)
        .eq("claim_token", invite.claim_token)
        .in("state", ["prepared", "failed", "sent"]);
      if (recordError)
        return json(
          {
            error:
              "Provider acceptance is uncertain in the local record. Review this invitation and retry the same job.",
          },
          503,
        );
      return json({ ok: true, accepted: true });
    } catch {
      await admin
        .from("team_invitations")
        .update({ state: "failed", locked_until: null, claim_token: null })
        .eq("id", invite.id)
        .eq("claim_token", invite.claim_token)
        .in("state", ["prepared", "failed", "sent"]);
      return json(
        {
          error:
            "Invitation delivery failed or is uncertain. Use Resend on this same invitation; do not create a duplicate.",
        },
        503,
      );
    }
  } catch (e) {
    return apiError(e);
  }
}
