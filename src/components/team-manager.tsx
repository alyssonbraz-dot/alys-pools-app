"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { T, useLanguage } from "./i18n";
import {
  BusinessHeader,
  BusinessCard,
  Money,
  useBusiness,
  currentMonth,
} from "./business/ui";
import { PaymentRate } from "./business/payment-rate";
import { Input } from "./form-controls";
type Person = {
  role: "owner" | "technician";
  email?: string;
  team_member_details?: { phone: string; notes: string } | null;
  id: string;
  display_name: string;
  access_state: string;
};
type Invite = {
  invited_role?: "owner" | "technician";
  id: string;
  user_id: string | null;
  email: string;
  display_name: string;
  state: string;
  expires_at: string;
};
type TeamData = {
  inviteReadiness?: { ready: boolean; issues: string[] };
  poolCounts: Record<string, number>;
  now: string;
  people: Person[];
  invites: Invite[];
  assignments: {
    technician_id: string;
    property_id: string;
    active: boolean;
  }[];
  properties: {
    id: string;
    name: string;
    address: string;
    customer_id: string;
  }[];
  stops: { technician_id: string; status: string }[];
  pools: { id: string; property_id: string }[];
  invitesEnabled: boolean;
};
async function call(body?: unknown) {
  const r = await fetch("/api/team", {
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error);
  return result;
}
export function TeamManager() {
  const business = useBusiness(currentMonth());
  const { language } = useLanguage();
  const [inviteRole, setInviteRole] = useState<"owner" | "technician">(
    "technician",
  );
  const [data, setData] = useState<TeamData | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false);
  async function reload() {
    setData(await call());
  }
  useEffect(() => {
    let active = true;
    call()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function action(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await call(body);
      setNotice(
        "Changes saved. Invitation acceptance is separate from provider acceptance.",
      );
      await reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function invite(form: FormData) {
    const ok = await action({
      action: "invite",
      role: inviteRole,
      language,
      confirm_owner: form.get("confirm_owner") === "on",
      id: crypto.randomUUID(),
      first_name: form.get("first_name"),
      last_name: form.get("last_name"),
      email: form.get("email"),
      phone: form.get("phone"),
      notes: form.get("notes"),
      properties: form.getAll("properties"),
    });
    if (ok) setShow(false);
  }
  return (
    <div className="business-page team-v3">
      <BusinessHeader
        title="Team"
        subtitle={
          <T text="Serve customers yourself. Delegate when you’re ready." />
        }
        action={
          <button
            className="btn btn-primary"
            onClick={() => {
              setInviteRole("technician");
              setShow((v) => !v);
            }}
          >
            <T text="Add Technician" />
          </button>
        }
      />
      {error && (
        <p role="alert" className="notice">
          <T text={error} />
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          <T text={notice} />
        </p>
      )}
      {show && (
        <BusinessCard
          title={
            inviteRole === "owner"
              ? "Invite an administrator"
              : "Invite a technician"
          }
        >
          {!data?.invitesEnabled && (
            <p className="note">
              <T text="Invitations are not ready. Open Settings → System Health to see the required configuration." />
            </p>
          )}
          <form action={invite} className="form-grid">
            {inviteRole === "owner" && (
              <label className="check-setting full">
                <input type="checkbox" name="confirm_owner" required />
                <T text="I authorize this person to have Owner permissions for this organization." />
              </label>
            )}
            <Input
              label="First name"
              name="first_name"
              required
              maxLength={50}
            />
            <Input label="Last name" name="last_name" maxLength={49} />
            <Input label="Email" name="email" type="email" required />
            <details className="business-details full">
              <summary>
                <T text="Contact & assignments (optional)" />
              </summary>
              <Input label="Phone" name="phone" type="tel" />
              <Input label="Internal notes" name="notes" />
              {inviteRole !== "owner" &&
                data?.properties.map((p) => (
                  <label className="check-setting" key={p.id}>
                    <input name="properties" type="checkbox" value={p.id} />
                    {p.name || p.address}
                  </label>
                ))}
            </details>
            <button
              className="btn btn-primary"
              disabled={busy || !data?.invitesEnabled}
            >
              <T text="Send secure invitation" />
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShow(false)}
            >
              <T text="Cancel" />
            </button>
            <p className="note full">
              <T text="The recipient creates their own password. Review the invited role before sending." />
            </p>
          </form>
        </BusinessCard>
      )}
      {!data ? (
        <p role="status">
          <T text="Loading team…" />
        </p>
      ) : (
        <>
          <div className="business-team-list">
            {data.people
              .filter((p) => p.role === "technician")
              .map((p) => {
                const work = business.data?.report.workload.find(
                  (w) => w.id === p.id,
                );
                const ids = data.assignments
                  .filter((a) => a.technician_id === p.id && a.active)
                  .map((a) => a.property_id);
                return (
                  <BusinessCard key={p.id}>
                    <div className="business-inline">
                      <div>
                        <h2>{p.display_name}</h2>
                        <small>
                          <T text={p.access_state} />
                        </small>
                      </div>
                      <Link
                        className="btn btn-secondary"
                        href={"/route?technician=" + p.id}
                      >
                        <T text="View Route" />
                      </Link>
                    </div>
                    <div className="team-workload">
                      <div>
                        <strong>
                          {work?.pools ?? data.poolCounts[p.id] ?? 0}
                        </strong>
                        <span>
                          <T text="Assigned pools" />
                        </span>
                      </div>
                      <div>
                        <strong>
                          {
                            data.stops.filter(
                              (s) =>
                                s.technician_id === p.id &&
                                !["completed", "skipped"].includes(s.status),
                            ).length
                          }
                        </strong>
                        <span>
                          <T text="Remaining today" />
                        </span>
                      </div>
                      <div>
                        <strong>{work?.completed ?? "—"}</strong>
                        <span>
                          <T text="Confirmed this month" />
                        </span>
                      </div>
                    </div>
                    <div className="business-inline">
                      <T text="Due from completed visits" />
                      <strong>
                        <Money cents={work?.payment ?? null} />
                      </strong>
                    </div>
                    <details className="business-details">
                      <summary>
                        <T text="Payment per visit" /> ·{" "}
                        <Money cents={work?.rate ?? null} />
                      </summary>
                      {business.data ? (
                        <PaymentRate
                          key={business.data.latest_config_id ?? "new"}
                          target="technician"
                          targetId={p.id}
                          data={business.data}
                          onSaved={business.reload}
                        />
                      ) : (
                        <p className="note">
                          <T text={business.error ?? "Loading contribution…"} />
                        </p>
                      )}
                    </details>
                    <details className="business-details">
                      <summary>
                        <T text="Manage technician" />
                      </summary>
                      <p>{p.email}</p>
                      <TechnicianEditor
                        person={p}
                        properties={data.properties}
                        selected={ids}
                        busy={busy}
                        onAction={action}
                      />
                      {p.access_state !== "invited" && (
                        <details className="business-details">
                          <summary>
                            <T text="Manage technician login" />
                          </summary>
                          <TechnicianCredentials person={p} onSaved={reload} />
                        </details>
                      )}
                      <Link href={"/history?technician_id=" + p.id}>
                        <T text="History" /> →
                      </Link>
                    </details>
                  </BusinessCard>
                );
              })}
          </div>
          {!data.people.some((p) => p.role === "technician") && (
            <BusinessCard title="Your business starts with you">
              <p>
                <T text="Keep serving your own customers. Add a technician when you’re ready to grow." />
              </p>
            </BusinessCard>
          )}
          <details className="business-details business-card">
            <summary>
              <T text="My labor (optional)" />
            </summary>
            <p className="note">
              <T text="Owner labor is unpriced until explicitly configured. It is never assumed free." />
            </p>
            {business.data &&
              data.people
                .filter((p) => p.role === "owner")
                .map((p) => (
                  <div key={p.id}>
                    <h3>{p.display_name}</h3>
                    <PaymentRate
                      key={p.id + business.data!.latest_config_id}
                      ownerLabor
                      target="technician"
                      targetId={p.id}
                      data={business.data!}
                      onSaved={business.reload}
                    />
                  </div>
                ))}
          </details>
          <details className="business-details business-card">
            <summary>
              <T text="Invitations" /> (
              {
                data.invites.filter(
                  (i) => !["accepted", "revoked"].includes(i.state),
                ).length
              }
              )
            </summary>
            {data.invites.length ? (
              data.invites.map((i) => (
                <div className="record" key={i.id}>
                  <strong>{i.display_name}</strong>
                  <p>
                    {i.email} ·{" "}
                    <T
                      text={
                        Date.parse(i.expires_at) < Date.parse(data.now) &&
                        i.state !== "accepted"
                          ? "Expired"
                          : i.state
                      }
                    />
                  </p>
                  {!["revoked", "accepted"].includes(i.state) && (
                    <div className="business-actions">
                      <button
                        className="btn btn-secondary"
                        disabled={busy || !data.invitesEnabled}
                        onClick={() =>
                          void action({ action: "resend", id: i.id })
                        }
                      >
                        <T text="Resend Invitation" />
                      </button>
                      <button
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          void action({ action: "revoke", id: i.id })
                        }
                      >
                        <T text="Revoke Invitation" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="note">
                <T text="No pending invitations." />
              </p>
            )}
          </details>
          <details className="business-details business-card">
            <summary>
              <T text="Administrator access" />
            </summary>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setInviteRole("owner");
                setShow(true);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <T text="Add Administrator" />
            </button>
            {data.people
              .filter((p) => p.role === "owner")
              .map((p) => (
                <details className="business-details" key={p.id}>
                  <summary>{p.display_name}</summary>
                  <TechnicianEditor
                    person={p}
                    properties={data.properties}
                    selected={[]}
                    busy={busy}
                    onAction={action}
                  />
                </details>
              ))}
          </details>
        </>
      )}
    </div>
  );
}
function TechnicianCredentials({
  person,
  onSaved,
}: {
  person: Person;
  onSaved: () => Promise<void>;
}) {
  const [email, setEmail] = useState(person.email ?? ""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [ownerPassword, setOwnerPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/team/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: person.id,
          current_password: ownerPassword,
          ...(email.trim().toLowerCase() !== person.email?.toLowerCase()
            ? { email: email.trim() }
            : {}),
          ...(password ? { password } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPassword("");
      setConfirmation("");
      setOwnerPassword("");
      setMessage(
        data.audit_pending
          ? "Login saved. Audit confirmation needs review in server administration."
          : "Technician login updated. Share the new credentials securely.",
      );
      await onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="team-editor" onSubmit={save}>
      <p className="note">
        <T text="Existing passwords cannot be viewed. Set a new password or edit the technician login email." />
      </p>
      <Input
        label="Login email"
        type="email"
        required
        maxLength={254}
        autoComplete="off"
        disabled={busy}
        value={email}
        onChange={setEmail}
      />
      <Input
        label="New password (at least 16 characters)"
        type="password"
        minLength={16}
        maxLength={128}
        autoComplete="new-password"
        disabled={busy}
        value={password}
        onChange={setPassword}
      />
      <Input
        label="Confirm new password"
        type="password"
        minLength={16}
        maxLength={128}
        autoComplete="new-password"
        required={!!password}
        disabled={busy}
        value={confirmation}
        onChange={setConfirmation}
      />
      <Input
        label="Your current administrator password"
        type="password"
        required
        maxLength={128}
        autoComplete="current-password"
        disabled={busy}
        value={ownerPassword}
        onChange={setOwnerPassword}
      />
      <p className="note">
        <T text="No email is sent. This changes future sign-ins; suspend access to block an existing session." />
      </p>
      {error && (
        <p className="notice" role="alert">
          <T text={error} />
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          <T text={message} />
        </p>
      )}
      <button
        className="btn btn-primary"
        disabled={
          busy ||
          (!password &&
            email.trim().toLowerCase() === person.email?.toLowerCase())
        }
      >
        <T text={busy ? "Saving…" : "Save technician login"} />
      </button>
    </form>
  );
}
function TechnicianEditor({
  person,
  properties,
  selected,
  busy,
  onAction,
}: {
  person: Person;
  properties: TeamData["properties"];
  selected: string[];
  busy: boolean;
  onAction: (body: unknown) => Promise<boolean>;
}) {
  const [ids, setIds] = useState(selected),
    [name, setName] = useState(person.display_name),
    [phone, setPhone] = useState(person.team_member_details?.phone ?? ""),
    [notes, setNotes] = useState(person.team_member_details?.notes ?? "");
  return (
    <div className="team-editor">
      <Input label="Display name" value={name} onChange={setName} />
      <Input label="Phone" value={phone} onChange={setPhone} />
      <Input label="Internal notes" value={notes} onChange={setNotes} />
      <button
        className="btn btn-secondary"
        disabled={busy || person.access_state === "invited"}
        onClick={() =>
          void onAction({
            action: "edit",
            id: person.id,
            state: person.access_state,
            first_name: name,
            phone,
            notes,
          })
        }
      >
        <T text="Save name" />
      </button>
      {person.role !== "owner" &&
        properties.map((p) => (
          <label className="check-setting" key={p.id}>
            <input
              type="checkbox"
              checked={ids.includes(p.id)}
              onChange={(e) =>
                setIds(
                  e.target.checked
                    ? [...ids, p.id]
                    : ids.filter((id) => id !== p.id),
                )
              }
            />
            {p.name || p.address}
          </label>
        ))}
      {person.role !== "owner" && (
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() =>
            void onAction({ action: "assign", id: person.id, properties: ids })
          }
        >
          <T text="Save assignments" />
        </button>
      )}
      <p className="note">
        <T text="Existing single active schedules follow reassignment. For a property without a schedule, set its service days in the customer profile. Multiple schedules require an explicit schedule edit." />
      </p>
    </div>
  );
}
