import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { CustomerOnboarding } from "@/components/customer-onboarding";
import { ChemicalLedger } from "@/components/chemical-ledger";
import { History } from "@/components/field/history";
import { Panel } from "@/components/ui";
import { T, DateText } from "@/components/i18n";
import type { CustomerBundle } from "@/lib/onboarding";
import { floridaDay } from "@/lib/field/types";
export default async function CustomerProfile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; saved?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { db, user } = await requireManager();
  const { data: c } = await db
    .from("customers")
    .select("*,customer_details(*),customer_tags(tag)")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();
  const { data: properties, error } = await db
    .from("properties")
    .select("*,pools(*),recurring_schedules(*)")
    .eq("customer_id", id);
  if (error)
    throw new Error(
      "Customer configuration unavailable. Apply pending migrations first.",
    );
  const { data: contracts } = await db
    .from("contracts")
    .select("*")
    .eq("customer_id", id)
    .order("created_at");
  const { data: technicians } = await db
    .from("profiles")
    .select("id,display_name")
    .in("role", ["owner", "admin", "technician"]);
  const propertyIds = (properties ?? []).map((p) => p.id);
  const { data: upcoming } = propertyIds.length
    ? await db
        .from("route_stops")
        .select("id,property_id,service_date,status,technician_id")
        .in("property_id", propertyIds)
        .gte("service_date", floridaDay())
        .order("service_date")
        .limit(30)
    : { data: [] };
  const details = Array.isArray(c.customer_details)
    ? c.customer_details[0]
    : c.customer_details;
  const first = properties?.[0];
  const contract = contracts?.[0];
  const bundle = {
    request_id: crypto.randomUUID(),
    customer: {
      ...c,
      property_id: first?.id ?? null,
      service_address: first?.address ?? "",
      property_name: first?.name ?? "",
      latitude: first?.latitude ?? null,
      longitude: first?.longitude ?? null,
      tags: c.customer_tags.map((t: { tag: string }) => t.tag),
      billing_address: details?.billing_address ?? "",
      internal_notes: details?.internal_notes ?? "",
      monthly_price_cents: details?.monthly_price_cents ?? 0,
    },
    properties: (properties ?? []).map((p) => ({
      ...p,
      pools: p.pools,
      schedules: p.recurring_schedules.map((s: { end_on: string | null }) => ({
        ...s,
        end_on: s.end_on ?? "",
      })),
    })),
    agreement: contract ?? {
      source: "own",
      billing_model: "monthly",
      price_cents: details?.monthly_price_cents ?? 0,
      status: "active",
    },
  } as CustomerBundle;
  if (query.edit)
    return (
      <CustomerOnboarding
        initial={bundle}
        ownerId={user.id}
        technicians={technicians ?? []}
      />
    );
  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-kicker">CUSTOMER PROFILE</div>
          <h1>{c.name}</h1>
          <p>
            {c.email || "—"} · {c.phone || "—"}
          </p>
        </div>
        <div className="header-actions">
          <Link
            href={"/customers/" + id + "?edit=1"}
            className="btn btn-primary"
          >
            <T text="Edit customer & service" />
          </Link>
          <Link href="/customers" className="btn btn-secondary">
            <T text="All customers" />
          </Link>
        </div>
      </div>
      {query.saved && (
        <p className="notice" role="status">
          <T text="Customer and service saved successfully." />
        </p>
      )}
      <div className="profile-grid">
        <Panel title="Contact & agreement">
          <p>
            {c.status} ·{" "}
            {c.customer_tags.map((t: { tag: string }) => t.tag).join(", ")}
          </p>
          <p>{details?.billing_address || first?.address}</p>
          {(contracts ?? []).map((a) => (
            <p key={a.id}>
              {a.source === "own" ? "Own customer" : "Subcontract"} ·{" "}
              {a.billing_model} · ${(a.price_cents / 100).toFixed(2)} USD ·{" "}
              {a.status}
            </p>
          ))}
          {!contracts?.length && (
            <p className="note">
              <T text="No service agreement recorded. Profile price is not counted as verified MRR." />
            </p>
          )}
          <p>
            <T text="Email reports" />:{" "}
            {c.email_reports_enabled ? "Enabled" : "Disabled"}
          </p>
          <p className="note">
            {details?.internal_notes || "No internal notes."}
          </p>
        </Panel>
        <Panel title="Upcoming visits">
          {upcoming?.length ? (
            <>
              {upcoming.slice(0, 6).map((s) => (
                <p key={s.id}>
                  <DateText
                    value={s.service_date + "T12:00:00Z"}
                    options={{ dateStyle: "medium" }}
                  />{" "}
                  ·{" "}
                  {properties?.find((p) => p.id === s.property_id)?.name ||
                    "Property"}{" "}
                  ·{" "}
                  {
                    technicians?.find((t) => t.id === s.technician_id)
                      ?.display_name
                  }{" "}
                  · {s.status}
                </p>
              ))}
              {upcoming.length > 6 && (
                <details>
                  <summary>
                    <T text="More upcoming visits (up to 30)" />
                  </summary>
                  {upcoming.slice(6).map((s) => (
                    <p key={s.id}>
                      <Link
                        href={
                          "/route?date=" +
                          s.service_date +
                          "&technician=" +
                          s.technician_id
                        }
                      >
                        {s.service_date} · {s.status}
                      </Link>
                    </p>
                  ))}
                </details>
              )}
            </>
          ) : (
            <p>
              <T text="No upcoming visits." />
            </p>
          )}
        </Panel>
      </div>
      {properties?.map((p) => (
        <Panel key={p.id} title={p.name || p.address}>
          <p>
            {p.address} · {p.service_timezone}
          </p>
          <p className="note">{p.gate_notes}</p>
          <p className="note">
            {p.latitude == null
              ? "Missing coordinates"
              : `${p.latitude}, ${p.longitude} · ${p.location_confirmed ? "Confirmed" : "Not confirmed"}`}
          </p>
          <div className="profile-grid">
            {p.pools.map(
              (pool: {
                id: string;
                name: string;
                gallons: number;
                water_type: string;
                equipment_notes: string;
                checklist: string[];
              }) => (
                <div key={pool.id} className="info-box">
                  <strong>{pool.name}</strong>
                  <p>
                    {pool.gallons.toLocaleString()} gal · {pool.water_type}
                  </p>
                  <p className="note">{pool.equipment_notes}</p>
                  <p className="note">{pool.checklist.join(" · ")}</p>
                </div>
              ),
            )}
          </div>
          {p.recurring_schedules.map(
            (s: {
              id: string;
              active: boolean;
              technician_id: string;
              days_of_week: number[];
              start_on: string;
              end_on: string | null;
              service_notes: string;
            }) => (
              <p key={s.id}>
                {s.active ? "Active" : "Paused"} ·{" "}
                {
                  technicians?.find((t) => t.id === s.technician_id)
                    ?.display_name
                }{" "}
                ·{" "}
                {s.days_of_week
                  .map(
                    (d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d],
                  )
                  .join(", ")}{" "}
                · {s.start_on} → {s.end_on || "No end date"} · {s.service_notes}
              </p>
            ),
          )}
          <ChemicalLedger propertyId={p.id} pools={p.pools} />
          <Link
            href={"/customers/" + id + "?edit=1"}
            className="btn btn-secondary"
          >
            <T text="Edit pools & schedules" />
          </Link>
        </Panel>
      ))}
      <History customerId={id} />
      <Link href="/pools" className="btn btn-secondary">
        <T text="Advanced Properties & Pools" />
      </Link>
    </>
  );
}
