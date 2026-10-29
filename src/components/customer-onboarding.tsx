"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { T } from "./i18n";
import {
  DEFAULT_CHECKLIST,
  READING_LABELS,
  floridaDay,
} from "@/lib/field/types";
import type { ReadingKey } from "@/lib/field/types";
import type { CustomerBundle } from "@/lib/onboarding";
import { Input } from "./form-controls";
import {litersToGallons,gallonsToLiters,effectiveUnits} from "@/lib/units";
import { LocationPicker } from "./location-picker";
import type { CompanyDefaults } from "@/lib/company-settings";
type Pool = CustomerBundle["properties"][number]["pools"][number];
function newPool(): Pool {
  return {
    name: "Pool",
    gallons: 15000,
    type: "residential",
    water_type: "chlorine",
    status: "active",
    checklist: [...DEFAULT_CHECKLIST],
    required_readings: ["fc", "ph"],
    photo_required: true,
    photo_scope_required: false,
    equipment_notes: "",
    reference_ranges: {},
  };
}
function newProperty(tech: string): CustomerBundle["properties"][number] {
  return {
    country_code:"US",unit_system:"inherit",
    name: "",
    address: "",
    gate_notes: "",
    latitude: null,
    longitude: null,
    location_confirmed: false,
    service_timezone: "America/New_York",
    pools: [newPool()],
    schedules: [
      {
        technician_id: tech,
        days_of_week: [new Date(floridaDay() + "T12:00Z").getUTCDay()],
        start_on: floridaDay(),
        end_on: "",
        active: true,
        service_notes: "",
      },
    ],
  };
}
export function CustomerOnboarding({
  technicians,
  ownerId,
  initial,
  defaults,
}: {
  defaults?: CompanyDefaults;
  technicians: { id: string; display_name: string }[];
  ownerId: string;
  initial?: CustomerBundle;
}) {
  const router = useRouter();
  const [data, setData] = useState<CustomerBundle>(
    () =>
      initial ?? {
        request_id: crypto.randomUUID(),
        customer: {
          property_id: null,
          first_name: "",
          last_name: "",
          email: "",
          phone: "",
          status: "active",
          service_address: "",
          property_name: "",
          billing_address: "",
          internal_notes: "",
          monthly_price_cents: 0,
          service_frequency: 1,
          assigned_technician_id: ownerId,
          tags: [],
          email_reports_enabled: false,
          latitude: null,
          longitude: null,
        },
        properties: [
          {
            ...newProperty(ownerId),
            service_timezone:defaults?.timeZone??"America/New_York",
            pools: [
              {
                ...newPool(),
                ...(defaults
                  ? {
                      checklist: defaults.checklist,
                      required_readings: defaults.required_readings,
                      photo_required: defaults.photo_required,
                      reference_ranges: defaults.reference_ranges,
                    }
                  : {}),
              },
            ],
          },
        ],
        agreement: {
          source: "own",
          billing_model: "monthly",
          price_cents: 0,
          status: "active",
        },
      },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function applyDefaults(p: ReturnType<typeof newProperty>) {
    if(defaults)p.service_timezone=defaults.timeZone;
    if (defaults)
      for (const pool of p.pools)
        Object.assign(pool, {
          checklist: [...defaults.checklist],
          required_readings: [...defaults.required_readings],
          photo_required: defaults.photo_required,
          reference_ranges: structuredClone(defaults.reference_ranges),
        });
    return p;
  }
  function change(fn: (copy: CustomerBundle) => void) {
    setData((previous) => {
      const copy = structuredClone(previous);
      fn(copy);
      return copy;
    });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const first = data.properties[0];
    const payload = {
      ...data,
      customer: {
        ...data.customer,
        property_id: first.id ?? null,
        service_address: first.address,
        property_name: first.name,
        latitude: first.latitude,
        longitude: first.longitude,
        monthly_price_cents: data.agreement.price_cents,
        assigned_technician_id: first.schedules[0]?.technician_id ?? null,
        service_frequency: first.schedules[0]?.days_of_week.length || 1,
      },
    };
    try {
      const response = await fetch("/api/customers/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.push("/customers/" + result.id + "?saved=1");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  function customerField(
    key:
      | "first_name"
      | "last_name"
      | "email"
      | "phone"
      | "billing_address"
      | "internal_notes",
    label: string,
    type = "text",
    required = false,
  ) {
    return (
      <Input
        label={label}
        value={data.customer[key]}
        type={type}
        required={required}
        maxLength={key === "internal_notes" ? 3000 : 300}
        onChange={(v) =>
          change((c) => {
            c.customer[key] = v;
          })
        }
      />
    );
  }
  return (
    <form onSubmit={save} className="onboarding">
      <div className="page-header">
        <div>
          <h1>
            <T text={initial ? "Edit customer & service" : "Add Customer"} />
          </h1>
          <p>
            <T text="Contact, pools and recurring service in one place." />
          </p>
        </div>
        <Link
          href={initial ? "/customers/" + initial.customer.id : "/customers"}
          className="btn btn-secondary"
        >
          <T text="Cancel" />
        </Link>
      </div>
      {error && (
        <p role="alert" className="notice">
          <T text={error}/>
        </p>
      )}
      <fieldset disabled={busy} className="onboarding-body">
        <section className="panel form-section">
          <h2>
            01 · <T text="Customer information" />
          </h2>
          <div className="form-grid">
            {customerField("first_name", "First name", "text", true)}
            {customerField("last_name", "Last name")}
            {customerField("email", "Email", "email")}
            {customerField("phone", "Phone", "tel")}
            <label className="form-field">
              <T text="Status" />
              <select
                value={data.customer.status}
                onChange={(e) =>
                  change((c) => {
                    c.customer.status = e.target.value as "active";
                  })
                }
              >
                {["active", "lead", "inactive"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <Input
              label="Tags (comma separated)"
              value={data.customer.tags.join(", ")}
              onChange={(v) =>
                change((c) => {
                  c.customer.tags = v
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean);
                })
              }
            />
            {customerField("billing_address", "Billing address (if different)")}
            {customerField("internal_notes", "Internal notes")}
          </div>
        </section>
        {data.properties.map((property, pi) => (
          <section className="panel form-section" key={pi}>
            <h2>
              02 · <T text="Property" /> {pi + 1}
            </h2>
            <div className="form-grid">
              <Input
                label="Property name (optional)"
                value={property.name}
                onChange={(v) =>
                  change((c) => {
                    c.properties[pi].name = v;
                  })
                }
              />
              <Input
                label="Service address"
                required
                value={property.address}
                onChange={(v) =>
                  change((c) => {
                    c.properties[pi].address = v;
                    c.properties[pi].location_confirmed = false;
                  })
                }
              />
              <Input
                label="Gate / access instructions"
                value={property.gate_notes}
                maxLength={1000}
                onChange={(v) =>
                  change((c) => {
                    c.properties[pi].gate_notes = v;
                  })
                }
              />
              <label className="form-field"><T text="Country"/><select value={property.country_code??'US'} onChange={e=>change(c=>{c.properties[pi].country_code=e.target.value as 'US';c.properties[pi].service_timezone=e.target.value==='BR'?'America/Sao_Paulo':'America/New_York';c.properties[pi].location_confirmed=false;})}><option value="US"><T text={"United States · ZIP"}/></option><option value="BR"><T text={"Brazil · CEP"}/></option></select></label>
              <label className="form-field"><T text="Property units"/><select value={property.unit_system??'inherit'} onChange={e=>change(c=>{c.properties[pi].unit_system=e.target.value as 'metric';})}><option value="inherit"><T text={"Company default"}/></option><option value="imperial"><T text={"Imperial"}/></option><option value="metric"><T text={"Metric"}/></option></select></label>
              <Input
                label="Service timezone"
                value={property.service_timezone}
                onChange={(v) =>
                  change((c) => {
                    c.properties[pi].service_timezone = v;
                  })
                }
              />
            </div>
            <LocationPicker
              countryCode={property.country_code??"US"}
              address={property.address}
              latitude={property.latitude}
              longitude={property.longitude}
              confirmed={property.location_confirmed}
              onChange={(lat, lng, confirmed) =>
                change((c) => {
                  Object.assign(c.properties[pi], {
                    latitude: lat,
                    longitude: lng,
                    location_confirmed: confirmed,
                  });
                })
              }
              onAddress={(address) =>
                change((c) => {
                  c.properties[pi].address = address;
                  c.properties[pi].location_confirmed = false;
                })
              }
            />
            <h2>
              03 · <T text="Pools & spas" />
            </h2>
            {property.pools.map((pool, wi) => (
              <fieldset className="pool-editor" key={wi}>
                <legend>
                  {pool.name || "Pool"} · {wi + 1}
                </legend>
                <div className="form-grid">
                  <Input
                    label="Pool / spa name"
                    required
                    maxLength={100}
                    value={pool.name}
                    onChange={(v) =>
                      change((c) => {
                        c.properties[pi].pools[wi].name = v;
                      })
                    }
                  />
                  <Input
                    label={effectiveUnits(property.unit_system,defaults?.unit_system)==="metric"?"Liters":"Gallons"}
                    type="number"
                    required
                    min={1}
                    max={10000000}
                    value={effectiveUnits(property.unit_system,defaults?.unit_system)==="metric"?Number(gallonsToLiters(pool.gallons).toFixed(2)):pool.gallons}
                    onChange={(v) =>
                      change((c) => {
                        c.properties[pi].pools[wi].gallons = effectiveUnits(property.unit_system,defaults?.unit_system)==="metric"?litersToGallons(Number(v)):Number(v);
                      })
                    }
                  />
                  <label className="form-field">
                    <T text="Type" />
                    <select
                      value={pool.type}
                      onChange={(e) =>
                        change((c) => {
                          c.properties[pi].pools[wi].type = e.target
                            .value as Pool["type"];
                        })
                      }
                    >
                      {["residential", "commercial", "spa"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <T text="Sanitizer" />
                    <select
                      value={pool.water_type}
                      onChange={(e) =>
                        change((c) => {
                          c.properties[pi].pools[wi].water_type = e.target
                            .value as Pool["water_type"];
                        })
                      }
                    >
                      {["chlorine", "salt", "bromine", "other"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <Input
                    label="Equipment notes"
                    maxLength={2000}
                    value={pool.equipment_notes}
                    onChange={(v) =>
                      change((c) => {
                        c.properties[pi].pools[wi].equipment_notes = v;
                      })
                    }
                  />
                  <label className="form-field">
                    <T text="Custom checklist (one task per line)" />
                    <textarea
                      value={pool.checklist.join("\n")}
                      required
                      onChange={(e) =>
                        change((c) => {
                          c.properties[pi].pools[wi].checklist =
                            e.target.value.split("\n");
                        })
                      }
                    />
                  </label>
                </div>
                <div className="checkbox-row">
                  {Object.entries(READING_LABELS).map(([key, label]) => (
                    <label className="check-setting" key={key}>
                      <input
                        type="checkbox"
                        checked={pool.required_readings.includes(
                          key as ReadingKey,
                        )}
                        onChange={(e) =>
                          change((c) => {
                            const p = c.properties[pi].pools[wi];
                            p.required_readings = e.target.checked
                              ? [...p.required_readings, key as ReadingKey]
                              : p.required_readings.filter((k) => k !== key);
                          })
                        }
                      />
                      <T text={label} />
                    </label>
                  ))}
                  <label className="check-setting">
                    <input
                      type="checkbox"
                      checked={pool.photo_required}
                      onChange={(e) =>
                        change((c) => {
                          c.properties[pi].pools[wi].photo_required =
                            e.target.checked;
                          if (!e.target.checked)
                            c.properties[pi].pools[wi].photo_scope_required =
                              false;
                        })
                      }
                    />
                    <T text="Require service photo" />
                  </label>
                  <label className="check-setting">
                    <input
                      type="checkbox"
                      checked={pool.photo_scope_required}
                      onChange={(e) =>
                        change((c) => {
                          c.properties[pi].pools[wi].photo_scope_required =
                            e.target.checked;
                          if (e.target.checked)
                            c.properties[pi].pools[wi].photo_required = true;
                        })
                      }
                    />
                    <T text="Require a photo assigned to this pool / spa" />
                  </label>
                </div>
                <details>
                  <summary>
                    <T text="Configure reference ranges (optional)" />
                  </summary>
                  <p className="note">
                    <T text="Set targets appropriate to this body of water. Blank means no configured warning." />
                  </p>
                  {Object.entries(READING_LABELS).map(([key, label]) => (
                    <div className="range-editor" key={key}>
                      <span><T text={label}/></span>
                      {(["min", "max"] as const).map((bound) => (
                        <Input
                          key={bound}
                          label={bound}
                          type="number"
                          step="any"
                          value={
                            pool.reference_ranges[key as ReadingKey]?.[bound] ??
                            ""
                          }
                          onChange={(v) =>
                            change((c) => {
                              const ranges =
                                c.properties[pi].pools[wi].reference_ranges;
                              if (v === "") {
                                delete ranges[key as ReadingKey];
                              } else
                                ranges[key as ReadingKey] = {
                                  ...(ranges[key as ReadingKey] ?? {
                                    min: Number(v),
                                    max: Number(v),
                                  }),
                                  [bound]: Number(v),
                                };
                            })
                          }
                        />
                      ))}
                    </div>
                  ))}
                </details>
              </fieldset>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                change((c) => {
                  c.properties[pi].pools.push(
                    applyDefaults(newProperty(ownerId)).pools[0],
                  );
                })
              }
            >
              <T text="Add Another Pool / Spa" />
            </button>
            <h2>
              04 · <T text="Service schedule" />
            </h2>
            {property.schedules.map((sc, si) => (
              <fieldset key={si}>
                <legend>
                  <T text="Recurring service" /> · {si + 1}
                </legend>
                <div className="form-grid">
                  <label className="form-field">
                    <T text="Assigned technician" />
                    <select
                      required
                      value={sc.technician_id}
                      onChange={(e) =>
                        change((c) => {
                          c.properties[pi].schedules[si].technician_id =
                            e.target.value;
                        })
                      }
                    >
                      {technicians.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Input
                    label="Visits per week (from weekdays)"
                    value={sc.days_of_week.length}
                    readOnly
                  />
                  <Input
                    label="Service start date"
                    type="date"
                    required
                    value={sc.start_on}
                    onChange={(v) =>
                      change((c) => {
                        c.properties[pi].schedules[si].start_on = v;
                      })
                    }
                  />
                  <Input
                    label="Service end date (optional)"
                    type="date"
                    value={sc.end_on}
                    onChange={(v) =>
                      change((c) => {
                        c.properties[pi].schedules[si].end_on = v;
                      })
                    }
                  />
                  <Input
                    label="Service notes"
                    maxLength={2000}
                    value={sc.service_notes}
                    onChange={(v) =>
                      change((c) => {
                        c.properties[pi].schedules[si].service_notes = v;
                      })
                    }
                  />
                </div>
                <div className="checkbox-row">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (d, di) => (
                      <label className="check-setting" key={d}>
                        <input
                          type="checkbox"
                          checked={sc.days_of_week.includes(di)}
                          onChange={(e) =>
                            change((c) => {
                              const s = c.properties[pi].schedules[si];
                              s.days_of_week = e.target.checked
                                ? [...s.days_of_week, di].sort()
                                : s.days_of_week.filter((n) => n !== di);
                            })
                          }
                        />
                        <T text={d} />
                      </label>
                    ),
                  )}
                  <label className="check-setting">
                    <input
                      type="checkbox"
                      checked={sc.active}
                      onChange={(e) =>
                        change((c) => {
                          c.properties[pi].schedules[si].active =
                            e.target.checked;
                        })
                      }
                    />
                    <T text="Active (uncheck to pause)" />
                  </label>
                </div>
              </fieldset>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                change((c) => {
                  c.properties[pi].schedules.push({
                    ...newProperty(ownerId).schedules[0],
                    active: false,
                  });
                })
              }
            >
              <T text="Add schedule / technician" />
            </button>
          </section>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            change((c) => {
              c.properties.push(applyDefaults(newProperty(ownerId)));
            })
          }
        >
          <T text="Add Another Property" />
        </button>
        <section className="panel form-section">
          <h2>
            <T text="Service agreement & reports" />
          </h2>
          <div className="form-grid">
            <label className="form-field">
              <T text="Service source" />
              <select
                value={data.agreement.source}
                onChange={(e) =>
                  change((c) => {
                    c.agreement.source = e.target.value as "own";
                    if (c.agreement.source === "own")
                      c.agreement.billing_model = "monthly";
                  })
                }
              >
                <option value="own"><T text={"Own customer"}/></option>
                <option value="subcontract"><T text={"Subcontract"}/></option>
              </select>
            </label>
            <label className="form-field">
              <T text="Billing model" />
              <select
                value={data.agreement.billing_model}
                disabled={data.agreement.source === "own"}
                onChange={(e) =>
                  change((c) => {
                    c.agreement.billing_model = e.target.value as "monthly";
                  })
                }
              >
                {["monthly", "per_visit", "fixed_contract"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <Input
              label={
                data.agreement.billing_model === "monthly"
                  ? "Monthly service price (USD)"
                  : "Agreed price (USD)"
              }
              type="number"
              min={0}
              step="0.01"
              value={data.agreement.price_cents / 100}
              onChange={(v) =>
                change((c) => {
                  c.agreement.price_cents = Math.round(Number(v) * 100);
                })
              }
            />
            <label className="check-setting">
              <input
                type="checkbox"
                checked={data.agreement.status === "active"}
                onChange={(e) =>
                  change((c) => {
                    c.agreement.status = e.target.checked
                      ? "active"
                      : "inactive";
                  })
                }
              />
              <T text="Active agreement" />
            </label>
            <label className="check-setting">
              <input
                type="checkbox"
                checked={data.customer.email_reports_enabled}
                onChange={(e) =>
                  change((c) => {
                    c.customer.email_reports_enabled = e.target.checked;
                  })
                }
              />
              <T text="Enable email reports" />
            </label>
          </div>
          <p className="note">
            <T text="One agreement per customer, not per pool. Subcontracts are excluded from own-customer MRR. No end date means recurring service continues until paused or changed." />
          </p>
        </section>
        <button className="btn btn-primary save-service" disabled={busy}>
          {busy ? (
            <T text="Saving…" />
          ) : (
            <T
              text={
                initial
                  ? "Save Customer & Service"
                  : "Save Customer & Activate Service"
              }
            />
          )}
        </button>
      </fieldset>
    </form>
  );
}
