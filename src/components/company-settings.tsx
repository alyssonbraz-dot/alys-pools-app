"use client";
import { useState } from "react";
import { T } from "./i18n";
import { Input } from "./form-controls";
import { READING_LABELS, type ReadingKey } from "@/lib/field/types";
import type { CompanyDefaults } from "@/lib/company-settings";
export function CompanySettings({
  name,
  defaults,
}: {
  name: string;
  defaults: CompanyDefaults;
}) {
  const [company, setCompany] = useState(name),
    [data, setData] = useState(defaults),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: company, defaults: data }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMessage(
        "Defaults saved. Existing pools and schedules were not changed.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="settings-editor">
      <section id="company" className="panel form-section">
        <h2>
          <T text="Company Profile" />
        </h2>
        <Input
          label="Company name"
          value={company}
          onChange={setCompany}
          required
          maxLength={100}
        />
        <p className="note"><T text={"USD · ppm"}/></p>
      </section>
      <section id="service" className="panel form-section">
        <h2>
          <T text="Service Defaults" />
        </h2><div className="form-grid"><label className="form-field"><T text="Report language"/><select value={data.report_language} onChange={e=>setData({...data,report_language:e.target.value as 'pt'})}><option value="en"><T text={"English"}/></option><option value="pt"><T text={"Português"}/></option><option value="es"><T text={"Español"}/></option></select></label><label className="form-field"><T text="Default units"/><select value={data.unit_system} onChange={e=>setData({...data,unit_system:e.target.value as 'metric'})}><option value="imperial"><T text={"Imperial · gal / °F / fl oz / lb"}/></option><option value="metric"><T text={"Metric · L / °C / mL / kg"}/></option></select></label><Input label="Default service timezone" value={data.timeZone} onChange={v=>setData({...data,timeZone:v})}/></div>
        <label className="check-setting">
          <input
            type="checkbox"
            checked={data.photo_required}
            onChange={(e) =>
              setData({ ...data, photo_required: e.target.checked })
            }
          />
          <T text="Require a service photo for new pools" />
        </label>
        <div className="checkbox-row">
          {Object.entries(READING_LABELS).map(([key, label]) => (
            <label className="check-setting" key={key}>
              <input
                type="checkbox"
                checked={data.required_readings.includes(key as ReadingKey)}
                onChange={(e) =>
                  setData({
                    ...data,
                    required_readings: e.target.checked
                      ? [...data.required_readings, key as ReadingKey]
                      : data.required_readings.filter((k) => k !== key),
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </section>
      <section id="chemistry" className="panel form-section">
        <h2>
          <T text="Water Chemistry Defaults" />
        </h2>
        <p className="note">
          <T text="Optional reference ranges for new pools. Review each body of water before applying." />
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
                value={data.reference_ranges[key as ReadingKey]?.[bound] ?? ""}
                onChange={(v) => {
                  const ranges = { ...data.reference_ranges };
                  if (v === "") delete ranges[key as ReadingKey];
                  else
                    ranges[key as ReadingKey] = {
                      ...(ranges[key as ReadingKey] ?? {
                        min: Number(v),
                        max: Number(v),
                      }),
                      [bound]: Number(v),
                    };
                  setData({ ...data, reference_ranges: ranges });
                }}
              />
            ))}
          </div>
        ))}
      </section>
      <section id="checklist" className="panel form-section">
        <h2>
          <T text="Checklist Templates" />
        </h2>
        <label className="form-field">
          <T text="Default checklist (one task per line)" />
          <textarea
            value={data.checklist.join("\n")}
            required
            onChange={(e) =>
              setData({ ...data, checklist: e.target.value.split("\n") })
            }
          />
        </label>
      </section>
      <section id="notifications" className="panel form-section">
        <h2>
          <T text="Notifications" />
        </h2>
        <label className="check-setting">
          <input
            type="checkbox"
            checked={data.show_issue_reminders}
            onChange={(e) =>
              setData({ ...data, show_issue_reminders: e.target.checked })
            }
          />
          <T text="Show service issue reminders on this company dashboard" />
        </label>
        <p className="note">
          <T text="In-app reminders only. Push and SMS notifications are not configured." />
        </p>
      </section>
      {message && (
        <p className="notice" role="status">
          <T text={message}/>
        </p>
      )}
      <button className="btn btn-primary" disabled={busy}>
        <T text={busy ? "Saving…" : "Save company defaults"} />
      </button>
    </form>
  );
}
