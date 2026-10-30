"use client";
import {displayDose,fahrenheitToCelsius,readableNumber} from "@/lib/units";
import Link from "next/link";
import { DateText, T, useLanguage,NumberText } from "./i18n";
import {
  CHEMISTRY_COLUMNS,
  outsideRange,
  type LedgerRow,
} from "@/lib/chemistry-table";
export function ChemicalTables({ rows }: { rows: LedgerRow[] }) {
  const {t}=useLanguage();return (
    <>
      <div
        className="chemistry-scroll"
        tabIndex={0}
        role="region"
        aria-label={t("Water chemistry table")}
      >
        <table className="chemistry-table">
          <thead>
            <tr>
              <th>
                <T text="Date" />
              </th>
              {CHEMISTRY_COLUMNS.map(([key, label]) => (
                <th
                  key={key}
                  title={t(
                    key === "ph"
                      ? "pH"
                      : key === "temperature_f"
                        ? "Degrees Fahrenheit"
                        : "Parts per million"
                  )}
                >
                  <T text={key==='temperature_f'?"Water °F / °C":label}/>
                </th>
              ))}
              <th>
                <T text="Technician" />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.visit_id + ":" + (r.pool_id ?? i)}>
                <th>
                  <DateText
                    value={r.completed_at}
                    options={{
                      month: "short",
                      day: "numeric",
                      year: "2-digit",timeZone:r.service_timezone??"America/New_York",
                    }}
                  />
                  {r.pool_name && <small>{r.pool_name}</small>}
                  {r.can_view_visit && (
                    <Link href={"/history?visit_id=" + r.visit_id}>
                      <T text="Details" />
                    </Link>
                  )}
                </th>
                {CHEMISTRY_COLUMNS.map(([key]) => (
                  <td
                    key={key}
                    className={
                      outsideRange(r.readings[key], r.reference_ranges?.[key])
                        ? "reading-warning"
                        : undefined
                    }
                    title={t(
                      r.reference_ranges?.[key]
                        ? `Configured range: ${r.reference_ranges[key]!.min}–${r.reference_ranges[key]!.max}`
                        : "No target range configured"
                    )}
                  >
                    {r.readings[key]===undefined?'—':key==='temperature_f'?`${r.unit_system==='metric'?readableNumber(fahrenheitToCelsius(r.readings[key]!)):r.readings[key]} ${r.unit_system==='metric'?'°C':'°F'}`:r.readings[key]}
                  </td>
                ))}
                <td>{r.technician_name || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        <T text="Readings in ppm, except pH and water temperature (°F). Missing values are not zero. Amber marks a value outside this pool’s configured range." />
      </p>
      <div
        className="chemistry-scroll"
        tabIndex={0}
        role="region"
        aria-label={t("Chemical dosage table")}
      >
        <table className="chemistry-table">
          <thead>
            <tr>
              {["Date", "Chemical", "Quantity", "Unit", "Technician"].map(
                (h) => (
                  <th key={h}>
                    <T text={h} />
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((r, ri) =>
              r.dosages.map((stored, i) => {const d=displayDose(stored,r.unit_system??'imperial');return (
                <tr key={r.visit_id + ":" + ri + ":" + i}>
                  <th>
                    <DateText
                      value={r.completed_at}
                      options={{ month: "short", day: "numeric",timeZone:r.service_timezone??"America/New_York" }}
                    />
                    {r.pool_name && <small>{r.pool_name}</small>}
                  </th>
                  <td><T text={d.product}/></td>
                  <td><NumberText value={readableNumber(d.quantity)}/></td>
                  <td><T text={d.unit}/></td>
                  <td>{r.technician_name || "—"}</td>
                </tr>
              );}),
            )}
          </tbody>
        </table>
        {!rows.some((r) => r.dosages.length) && (
          <p className="note">
            <T text="No chemicals added" />
          </p>
        )}
      </div>
    </>
  );
}
