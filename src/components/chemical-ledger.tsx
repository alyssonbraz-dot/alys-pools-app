"use client";
import { useEffect, useState } from "react";
import { ChemicalTables } from "./chemical-tables";
import { T } from "./i18n";
import { chemistryCsv, type LedgerRow } from "@/lib/chemistry-table";
export function ChemicalLedger({
  propertyId,
  pools,
}: {
  propertyId: string;
  pools: { id: string; name: string }[];
}) {
  const [period, setPeriod] = useState("30"),
    [pool, setPool] = useState(""),
    [offset, setOffset] = useState(0),
    [rows, setRows] = useState<LedgerRow[]>([]),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const q = new URLSearchParams({
      property_id: propertyId,
      period,
      offset: String(offset),
    });
    if (pool) q.set("pool_id", pool);
    fetch("/api/chemistry?" + q, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (live) {
          setRows(d.rows);
          setMore(d.hasMore);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [propertyId, period, pool, offset]);
  function download(doses: boolean) {
    const url = URL.createObjectURL(
      new Blob([chemistryCsv(rows, doses)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = doses ? "alys-dosages-page.csv" : "alys-chemistry-page.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="chemical-ledger">
      <h3>
        <T text="Chemical history" />
      </h3>
      <div className="section-toolbar">
        <label className="form-field">
          <T text="Period" />
          <select
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setOffset(0);
              setLoading(true);
            }}
          >
            {[
              ["7", "Last 7 days"],
              ["30", "Last 30 days"],
              ["90", "Last 90 days"],
              ["all", "All history"],
            ].map(([v, t]) => (
              <option key={v} value={v}>
                <T text={t}/>
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <T text="Pool / spa" />
          <select
            value={pool}
            onChange={(e) => {
              setPool(e.target.value);
              setOffset(0);
              setLoading(true);
            }}
          >
            <option value=""><T text={"All pools"}/></option>
            {pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={loading || !rows.length}
          onClick={() => download(false)}
        >
          <T text="Export readings (this page)" />
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={loading || !rows.length}
          onClick={() => download(true)}
        >
          <T text="Export dosages (this page)" />
        </button>
      </div>
      {error ? (
        <p role="alert" className="notice">
          <T text={error}/>
        </p>
      ) : loading ? (
        <p role="status"><T text={"Loading history…"}/></p>
      ) : rows.length ? (
        <ChemicalTables rows={rows} />
      ) : (
        <p className="empty">
          <T text="No completed readings in this period." />
        </p>
      )}
      <div className="section-toolbar">
        <button
          className="btn btn-secondary"
          disabled={loading || !offset}
          onClick={() => {
            setOffset((n) => Math.max(0, n - 50));
            setLoading(true);
          }}
        ><T text={" Previous page "}/></button>
        <span><T text={"Page "}/>{offset / 50 + 1}</span>
        <button
          className="btn btn-secondary"
          disabled={loading || !more}
          onClick={() => {
            setOffset((n) => n + 50);
            setLoading(true);
          }}
        ><T text={" Next page "}/></button>
      </div>
    </section>
  );
}
