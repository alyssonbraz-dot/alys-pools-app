"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { T,useLanguage } from "./i18n";
import { Input } from "./form-controls";
type Person = {role:"owner"|"technician";
  email?: string;
  team_member_details?: { phone: string; notes: string } | null;
  id: string;
  display_name: string;
  access_state: string;
};
type Invite = {invited_role?:"owner"|"technician";
  id: string;
  user_id: string | null;
  email: string;
  display_name: string;
  state: string;
  expires_at: string;
};
type TeamData = {inviteReadiness?:{ready:boolean;issues:string[]};
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
 const {language}=useLanguage();const [inviteRole,setInviteRole]=useState<"owner"|"technician">("technician");
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
      role:inviteRole,language,confirm_owner:form.get("confirm_owner")==="on",
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
        <button className="btn btn-primary" onClick={() => {setInviteRole("technician");setShow(!show);}}>
          <T text="Add Technician" />
        </button><button type="button" className="btn btn-secondary" onClick={()=>{setInviteRole("owner");setShow(true);}}><T text="Add Administrator"/></button>
      </div>
      {error && (
        <p role="alert" className="notice">
          <T text={error}/>
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          <T text={notice}/>
        </p>
      )}
      {show && (
        <section className="panel form-section">
          <h2>
            <T text={inviteRole==='owner'?"Invite an administrator":"Invite a technician"} />
          </h2>
          {!data?.invitesEnabled && (
            <p className="notice">
              <T text="Invitations are not ready. Open Settings → System Health to see the required configuration." />
            </p>
          )}
          <form action={invite} className="form-grid">{inviteRole==='owner'&&<label className="check-setting full"><input type="checkbox" name="confirm_owner" required/><T text="I authorize this person to have Owner permissions for this organization."/></label>}
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
              {inviteRole!=="owner"&&data?.properties.map((p) => (
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
              <T text="The recipient creates their own password. Review the invited role before sending." />
            </p>
          </form>
        </section>
      )}
      {!data ? (
        <p role="status"><T text={"Loading team…"}/></p>
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
                      <td>{p.display_name}<small><T text={p.role==='owner'?"Owner":"Technician"}/></small></td>
                      <td>{p.email || invite?.email || "—"}</td>
                      <td>
                        <span className="status"><T text={p.access_state}/></span>
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
                            <T text={p.role==='owner'?"Edit administrator":"Edit & assign properties"} />
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
                  ? <T text="Expired"/>
                  : <T text={i.state}/>}
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
      {person.role!=="owner"&&properties.map((p) => (
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
      {person.role!=="owner"&&<button
        className="btn btn-primary"
        disabled={busy}
        onClick={() =>
          void onAction({ action: "assign", id: person.id, properties: ids })
        }
      >
        <T text="Save assignments" />
      </button>}
      <p className="note">
        <T text="Existing single active schedules follow reassignment. For a property without a schedule, set its service days in the customer profile. Multiple schedules require an explicit schedule edit." />
      </p>
    </div>
  );
}
