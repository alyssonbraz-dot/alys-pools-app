"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { T } from "./i18n";
import { Input } from "./form-controls";
type Person = {
  email?: string;
  team_member_details?: { phone: string; notes: string } | null;
  id: string;
  display_name: string;
  access_state: string;
};
type Invite = {
  id: string;
  user_id: string | null;
  email: string;
  display_name: string;
  state: string;
  expires_at: string;
};
type TeamData = {
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
    <>
      <div className="page-header">
        <div>
          <h1>
            <T text="Team & Technicians" />
          </h1>
          <p>
            <T text="Invite technicians, control access and assign service properties." />
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShow(!show)}>
          <T text="Add Technician" />
        </button>
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {show && (
        <section className="panel form-section">
          <h2>
            <T text="Invite a technician" />
          </h2>
          {!data?.invitesEnabled && (
            <p className="notice">
              <T text="Invitations are disabled until the verified sender and server configuration are ready." />
            </p>
          )}
          <form action={invite} className="form-grid">
            <Input
              label="First name"
              name="first_name"
              required
              maxLength={50}
            />
            <Input label="Last name" name="last_name" maxLength={49} />
            <Input label="Email" name="email" type="email" required />
            <Input label="Phone" name="phone" type="tel" />
            <Input label="Internal notes" name="notes" />
            <div className="full">
              {data?.properties.map((p) => (
                <label className="check-setting" key={p.id}>
                  <input name="properties" type="checkbox" value={p.id} />
                  {p.name || p.address}
                </label>
              ))}
            </div>
            <button
              className="btn btn-primary"
              disabled={busy || !data?.invitesEnabled}
            >
              <T text="Send secure invitation" />
            </button>
            <p className="note full">
              <T text="Role is always Technician. The recipient creates their own password; no shared password is generated. Assign properties below after the account is created." />
            </p>
          </form>
        </section>
      )}
      {!data ? (
        <p role="status">Loading team…</p>
      ) : (
        <>
          <div className="panel table-wrap">
            <table className="data-table team-table">
              <thead>
                <tr>
                  {[
                    "Technician",
                    "Email",
                    "Status",
                    "Assigned pools",
                    "Today’s stops",
                    "Actions",
                  ].map((h) => (
                    <th key={h}>
                      <T text={h} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.people.map((p) => {
                  const invite = data.invites.find((i) => i.user_id === p.id);
                  const ids = data.assignments
                    .filter((a) => a.technician_id === p.id && a.active)
                    .map((a) => a.property_id);
                  return (
                    <tr key={p.id}>
                      <td>{p.display_name}</td>
                      <td>{p.email || invite?.email || "—"}</td>
                      <td>
                        <span className="status">{p.access_state}</span>
                      </td>
                      <td>{data.poolCounts[p.id] ?? 0}</td>
                      <td>
                        {
                          data.stops.filter((s) => s.technician_id === p.id)
                            .length
                        }
                      </td>
                      <td>
                        <div className="table-actions">
                          <Link
                            className="btn btn-secondary"
                            href={"/route?technician=" + p.id}
                          >
                            <T text="View Route" />
                          </Link>
                          <Link
                            className="btn btn-secondary"
                            href={"/history?technician_id=" + p.id}
                          >
                            <T text="History" />
                          </Link>
                          {p.access_state !== "invited" && (
                            <button
                              disabled={busy}
                              className="btn btn-secondary"
                              onClick={() =>
                                void action({
                                  action: "access",
                                  id: p.id,
                                  state:
                                    p.access_state === "active"
                                      ? "suspended"
                                      : "active",
                                })
                              }
                            >
                              <T
                                text={
                                  p.access_state === "active"
                                    ? "Suspend Access"
                                    : "Reactivate"
                                }
                              />
                            </button>
                          )}
                          {p.access_state !== "invited" && (
                            <button
                              disabled={busy}
                              className="btn btn-danger"
                              onClick={() =>
                                void action({
                                  action: "access",
                                  id: p.id,
                                  state: "inactive",
                                })
                              }
                            >
                              <T text="Set inactive" />
                            </button>
                          )}
                        </div>
                        <details>
                          <summary>
                            <T text="Edit & assign properties" />
                          </summary>
                          <TechnicianEditor
                            person={p}
                            properties={data.properties}
                            selected={ids}
                            busy={busy}
                            onAction={action}
                          />
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!data.people.length && (
              <p className="empty">
                <T text="No technicians yet. Invite your first team member." />
              </p>
            )}
          </div>
          <section className="panel form-section">
            <h2>
              <T text="Invitations" />
            </h2>
            {data.invites.map((i) => (
              <div className="record" key={i.id}>
                <strong>{i.display_name}</strong> · {i.email} ·{" "}
                {Date.parse(i.expires_at) < Date.parse(data.now) &&
                i.state !== "accepted"
                  ? "Expired"
                  : i.state}
                <div className="table-actions">
                  {!["revoked", "accepted"].includes(i.state) && (
                    <>
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
                        className="btn btn-danger"
                        disabled={busy}
                        onClick={() =>
                          void action({ action: "revoke", id: i.id })
                        }
                      >
                        <T text="Revoke Invitation" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </>
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
      {properties.map((p) => (
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
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={() =>
          void onAction({ action: "assign", id: person.id, properties: ids })
        }
      >
        <T text="Save assignments" />
      </button>
      <p className="note">
        <T text="Existing single active schedules follow reassignment. For a property without a schedule, set its service days in the customer profile. Multiple schedules require an explicit schedule edit." />
      </p>
    </div>
  );
}
