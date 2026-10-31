"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { MobileHeader, ServiceCard } from "@/components/mobile/field-layout";
import { T, useLanguage, CurrencyText } from "@/components/i18n";
import {
  emptyConfig,
  parseMoney,
  type FinanceConfig,
  type FinanceRecords,
} from "@/lib/finance/schema";
import { marginBand, type Metrics, type PoolResult } from "@/lib/finance/model";
import type { loadFinance } from "@/lib/finance/server";
import "./finance.css";
type Data = Awaited<ReturnType<typeof loadFinance>> & {
  history: {
    month: string;
    forecast: Metrics;
    recorded: Metrics;
    pools: { id: string; forecast: Metrics; recorded: Metrics }[];
  }[];
};
type Basis = "forecast" | "recorded";
function Money({ value }: { value: number | null }) {
  return value === null ? (
    <span className="finance-missing">
      <T text="Not configured" />
    </span>
  ) : (
    <span className="finance-value">
      <CurrencyText value={value / 100} />
    </span>
  );
}
function Amount({
  value,
  onChange,
  label,
  disabled = false,
  percent = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  disabled?: boolean;
  percent?: boolean;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState({
    source: value,
    text: value === null ? "" : (value / 100).toFixed(2),
    error: "",
  });
  if (draft.source !== value)
    setDraft({
      source: value,
      text: value === null ? "" : (value / 100).toFixed(2),
      error: "",
    });
  return (
    <label className="finance-amount">
      <span>
        {t(label)}
        {percent ? " (%)" : ""}
      </span>
      <input
        inputMode="decimal"
        value={draft.text}
        aria-invalid={!!draft.error}
        disabled={disabled}
        placeholder={t("Not configured")}
        onChange={(e) => {
          const text = e.target.value;
          try {
            const parsed = parseMoney(text);
            setDraft({ source: parsed, text, error: "" });
            onChange(parsed);
          } catch {
            setDraft({
              ...draft,
              text,
              error: "Enter an amount with up to two decimals.",
            });
          }
        }}
      />
      {draft.error && <small role="alert">{t(draft.error)}</small>}
    </label>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <ServiceCard title={title}>{children}</ServiceCard>;
}
function MetricsCards({ metrics }: { metrics: Metrics }) {
  const items: [string, number | null][] = [
    ["Monthly Revenue", metrics.revenue],
    ["Technician Cost", metrics.technician],
    [
      "Company Expenses",
      metrics.overhead === null ||
      metrics.direct === null ||
      metrics.processing === null
        ? null
        : metrics.overhead + metrics.direct + metrics.processing,
    ],
    ["Contribution Margin", metrics.contribution],
    ["Operating Profit", metrics.profit],
    ["Profit per Visit", metrics.perVisit],
  ];
  return (
    <>
      <div className="finance-metrics">
        {items.map(([label, v]) => (
          <article
            key={label}
            className={label === "Operating Profit" ? "finance-profit" : ""}
          >
            <span>
              <T text={label} />
            </span>
            <strong>
              <Money value={v} />
            </strong>
          </article>
        ))}
      </div>
      <div className="finance-margin">
        <T text="Operating Margin" />
        <strong>
          {metrics.margin === null ? (
            <T text="Not configured" />
          ) : (
            (metrics.margin / 100).toFixed(2) + "%"
          )}
        </strong>
      </div>
    </>
  );
}
function Distribution({ metrics: m }: { metrics: Metrics }) {
  const rows: [string, number | null][] = [
    ["Technician Cost", m.technician],
    ["Direct expenses", m.direct],
    ["Processing fees", m.processing],
    ["Company operating expenses", m.overhead],
  ];
  const total = rows.reduce((n, [, v]) => n + (v ?? 0), 0);
  return (
    <div className="finance-distribution">
      {rows.map(([label, v]) => (
        <div key={label}>
          <div>
            <span>
              <T text={label} />
            </span>
            <Money value={v} />
          </div>
          <div className="finance-bar">
            <i
              style={{
                width: v === null || !total ? "0%" : `${(v / total) * 100}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
export function FinanceApp({
  screen,
  poolId,
}: {
  screen: "result" | "costs" | "pool";
  poolId?: string;
}) {
  const query = useSearchParams(),
    { t } = useLanguage();
  const current = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/New_York",
  })
    .format(new Date())
    .slice(0, 7);
  const [month, setMonth] = useState(
    /^20\d{2}-(0[1-9]|1[0-2])$/.test(query.get("month") ?? "")
      ? query.get("month")!
      : current,
  );
  const [loaded, setLoaded] = useState<{ key: string; value: Data } | null>(
      null,
    ),
    [config, setConfig] = useState<FinanceConfig>(emptyConfig),
    [records, setRecords] = useState<FinanceRecords | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0),
    [basis, setBasis] = useState<Basis>("forecast"),
    [sort, setSort] = useState("profit-desc"),
    [dirty, setDirty] = useState(false),
    [dirtyKind, setDirtyKind] = useState("");
  const requestKey = month + ":" + reload;
  const data = loaded?.key === requestKey ? loaded.value : null;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/finance?month=" + month, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        return v;
      })
      .then((v: Data) => {
        if (controller.signal.aborted) return;
        setLoaded({ key: requestKey, value: v });
        setConfig(v.config);
        setRecords(v.records);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [month, reload, requestKey]);
  function changeConfig(next: FinanceConfig) {
    setConfig(next);
    setDirtyKind("config");
    setDirty(true);
    setMessage("");
  }
  function changeRecords(next: FinanceRecords) {
    setRecords(next);
    setDirtyKind("records");
    setDirty(true);
    setMessage("");
  }
  async function save(action: "open" | "config" | "records" | "close") {
    if (
      !data ||
      busy ||
      document.querySelector(".finance-app [aria-invalid=true]")
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          month,
          id: crypto.randomUUID(),
          expected:
            action === "config" ? data.latest_config_id : data.records_id,
          payload:
            action === "config"
              ? config
              : action === "records"
                ? records
                : null,
        }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setDirty(false);
      setDirtyKind("");
      setMessage("Financial data saved.");
      setReload((n) => n + 1);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save financial data.",
      );
    } finally {
      setBusy(false);
    }
  }
  const pool = data?.report.pools.find((p) => p.id === poolId);
  const rows = [...(data?.report.pools ?? [])].sort((a, b) => {
    const key =
      sort === "margin" ? "margin" : sort === "cost" ? "technician" : "profit";
    const av = a[basis][key],
      bv = b[basis][key];
    if (av === null) return 1;
    if (bv === null) return -1;
    return sort === "profit-asc" ? av - bv : bv - av;
  });
  const locked = !!data?.closed;
  const title =
    screen === "costs"
      ? "Business Costs"
      : screen === "pool"
        ? "Pool Profitability"
        : "Profit Result";
  return (
    <div className="finance-app">
      <MobileHeader
        title={<T text={title} />}
        eyebrow="ALYS · OWNER"
        address={
          screen === "pool" ? pool?.customer : t("Company Profitability")
        }
      />
      <nav className="finance-tabs" aria-label={t("Finance")}>
        <Link href={"/finance?month=" + month}>
          <T text="Profit Result" />
        </Link>
        <Link href={"/finance/costs?month=" + month}>
          <T text="Business Costs" />
        </Link>
      </nav>
      <div className="finance-period">
        <label>
          <T text="Period" />
          <input
            type="month"
            value={month}
            disabled={dirty || busy}
            min="2020-01"
            max="2099-12"
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
              setMessage("");
              setError("");
            }}
          />
        </label>
        {screen !== "costs" && (
          <label>
            <T text="View" />
            <select
              value={basis}
              onChange={(e) => setBasis(e.target.value as Basis)}
            >
              <option value="forecast">{t("Forecast")}</option>
              <option value="recorded">{t("Recorded / accrued")}</option>
            </select>
          </label>
        )}
      </div>
      {error && (
        <div className="notice" role="alert">
          {t(error)}{" "}
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => {
              setError("");
              setDirty(false);
              setDirtyKind("");
              setReload((n) => n + 1);
            }}
          >
            {t("Reload")}
          </button>
        </div>
      )}
      {message && (
        <p className="notice" role="status">
          {t(message)}
        </p>
      )}
      {!data && !error && <p role="status">{t("Loading financial data…")}</p>}
      {data && records && (
        <>
          <p className="finance-context">
            <T
              text={
                locked
                  ? "Closed period · historical snapshot"
                  : basis === "forecast"
                    ? "Estimate · contracted revenue and calendar visits"
                    : "Recorded receipts · accrued technician payments"
              }
            />
            {dirty && (
              <>
                {" "}
                · <T text="Unsaved changes" />
              </>
            )}
          </p>
          {data.report.warnings.map((w) => (
            <p className="finance-warning" key={w}>
              <T text={w} />
            </p>
          ))}
          {screen === "costs" ? (
            <>
              <Section title="Monthly company costs">
                <p className="note">
                  <T text="Blank means not configured. Enter 0 only when confirmed. Amounts are USD; display follows your language." />
                </p>
                <fieldset disabled={locked || busy || dirtyKind === "records"}>
                  <label>
                    <T text="Allocate company costs by" />
                    <select
                      value={config.allocation}
                      onChange={(e) =>
                        changeConfig({
                          ...config,
                          allocation: e.target.value as "pools" | "revenue",
                        })
                      }
                    >
                      <option value="revenue">{t("Revenue")}</option>
                      <option value="pools">{t("Number of pools")}</option>
                    </select>
                  </label>
                  {config.costs.map((c, i) => (
                    <div className="finance-cost-row" key={c.id}>
                      <Amount
                        label={c.label}
                        value={c.cents}
                        onChange={(v) =>
                          changeConfig({
                            ...config,
                            costs: config.costs.map((x, n) =>
                              n === i ? { ...x, cents: v } : x,
                            ),
                          })
                        }
                      />
                      <select
                        aria-label={t("Cost model") + " " + c.label}
                        value={c.model}
                        onChange={(e) =>
                          changeConfig({
                            ...config,
                            costs: config.costs.map((x, n) =>
                              n === i
                                ? {
                                    ...x,
                                    model: e.target.value as
                                      | "monthly"
                                      | "per_visit",
                                  }
                                : x,
                            ),
                          })
                        }
                      >
                        <option value="monthly">{t("Monthly")}</option>
                        <option value="per_visit">
                          {t("Per company visit")}
                        </option>
                      </select>
                    </div>
                  ))}
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      const label = window.prompt(t("Cost name"));
                      if (label?.trim())
                        changeConfig({
                          ...config,
                          costs: [
                            ...config.costs,
                            {
                              id: crypto.randomUUID(),
                              label: label.trim(),
                              model: "monthly",
                              cents: null,
                            },
                          ],
                        });
                    }}
                  >
                    {t("Add company cost")}
                  </button>
                  <div className="finance-two">
                    <Amount
                      label="Processing percentage"
                      percent
                      value={config.processing_bps}
                      onChange={(v) =>
                        changeConfig({ ...config, processing_bps: v })
                      }
                    />
                    <Amount
                      label="Fixed fee per transaction"
                      value={config.processing_fixed_cents}
                      onChange={(v) =>
                        changeConfig({ ...config, processing_fixed_cents: v })
                      }
                    />
                  </div>
                </fieldset>
              </Section>
              <Section title="Technician & contract terms">
                <p className="note">
                  <T text="Contract overrides technician; technician overrides default. Payment is per property stop, shared across its pools. Extra stops use the extra-visit rate." />
                </p>
                <fieldset disabled={locked || busy || dirtyKind === "records"}>
                  {config.terms.map((term, i) => (
                    <div
                      className="finance-terms"
                      key={term.scope + term.target}
                    >
                      <h3>
                        <T
                          text={
                            term.scope === "default"
                              ? "Default terms"
                              : term.scope === "technician"
                                ? "Technician override"
                                : "Contract override"
                          }
                        />
                        {term.target && (
                          <>
                            {" "}
                            ·{" "}
                            {term.scope === "technician"
                              ? data.sources.technicians.find(
                                  (t) => t.id === term.target,
                                )?.display_name
                              : data.sources.customers.find(
                                  (c) =>
                                    c.id ===
                                    data.sources.contracts.find(
                                      (v) => v.id === term.target,
                                    )?.customer_id,
                                )?.name}
                          </>
                        )}
                      </h3>
                      <label>
                        <T text="Payment model" />
                        <select
                          value={term.model}
                          onChange={(e) =>
                            changeConfig({
                              ...config,
                              terms: config.terms.map((v, n) =>
                                n === i
                                  ? {
                                      ...v,
                                      model: e.target.value as
                                        | "per_visit"
                                        | "monthly",
                                    }
                                  : v,
                              ),
                            })
                          }
                        >
                          <option value="per_visit">
                            {t("Per completed visit")}
                          </option>
                          <option value="monthly">
                            {t("Monthly fixed payout")}
                          </option>
                        </select>
                      </label>
                      {(
                        [
                          "rate_cents",
                          "extra_visit_cents",
                          "additional_service_cents",
                        ] as const
                      ).map((key, n) => (
                        <Amount
                          key={key}
                          label={
                            [
                              "Base payout",
                              "Extra visit payout",
                              "Additional service payout",
                            ][n]
                          }
                          value={term[key]}
                          onChange={(value) =>
                            changeConfig({
                              ...config,
                              terms: config.terms.map((v, j) =>
                                j === i ? { ...v, [key]: value } : v,
                              ),
                            })
                          }
                        />
                      ))}
                      <div className="finance-two">
                        {(
                          ["chemicals", "fuel", "vehicle", "tools"] as const
                        ).map((key) => (
                          <label key={key}>
                            {t(key)}
                            <select
                              value={term[key]}
                              onChange={(e) =>
                                changeConfig({
                                  ...config,
                                  terms: config.terms.map((v, n) =>
                                    n === i
                                      ? {
                                          ...v,
                                          [key]: e.target.value as
                                            | "alys"
                                            | "technician",
                                        }
                                      : v,
                                  ),
                                })
                              }
                            >
                              <option value="technician">
                                {t("Technician pays")}
                              </option>
                              <option value="alys">{t("ALYS pays")}</option>
                            </select>
                          </label>
                        ))}
                      </div>
                      {term.scope !== "default" && (
                        <button
                          className="btn btn-secondary"
                          onClick={() =>
                            changeConfig({
                              ...config,
                              terms: config.terms.filter((_, n) => n !== i),
                            })
                          }
                        >
                          {t("Remove override")}
                        </button>
                      )}
                    </div>
                  ))}
                  <label>
                    <T text="Add payout override" />
                    <select
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const [scope, target] = e.target.value.split(":");
                        changeConfig({
                          ...config,
                          terms: [
                            ...config.terms,
                            {
                              ...config.terms[0],
                              scope: scope as "technician" | "contract",
                              target,
                            },
                          ],
                        });
                      }}
                    >
                      <option value="">
                        {t("Select technician or contract")}
                      </option>
                      {data.sources.technicians
                        .filter(
                          (v) =>
                            !config.terms.some(
                              (t) =>
                                t.scope === "technician" && t.target === v.id,
                            ),
                        )
                        .map((v) => (
                          <option value={"technician:" + v.id} key={v.id}>
                            {v.display_name}
                          </option>
                        ))}
                      {data.sources.contracts
                        .filter(
                          (v) =>
                            v.status === "active" &&
                            !config.terms.some(
                              (t) =>
                                t.scope === "contract" && t.target === v.id,
                            ),
                        )
                        .map((v) => (
                          <option value={"contract:" + v.id} key={v.id}>
                            {t("Contract")} ·{" "}
                            {
                              data.sources.customers.find(
                                (c) => c.id === v.customer_id,
                              )?.name
                            }{" "}
                            · {v.id.slice(0, 6)}
                          </option>
                        ))}
                    </select>
                  </label>
                </fieldset>
              </Section>
              <Section title="Margin recommendations">
                <fieldset disabled={locked || busy || dirtyKind === "records"}>
                  {config.bands.map((b, i) => (
                    <div className="finance-band" key={i}>
                      <Amount
                        label={b.label}
                        percent
                        value={b.minimum_bps}
                        onChange={(v) => {
                          if (v !== null)
                            changeConfig({
                              ...config,
                              bands: config.bands.map((x, n) =>
                                n === i ? { ...x, minimum_bps: v } : x,
                              ),
                            });
                        }}
                      />
                      <label>
                        <T text="Recommendation" />
                        <select
                          value={b.action}
                          onChange={(e) =>
                            changeConfig({
                              ...config,
                              bands: config.bands.map((x, n) =>
                                n === i
                                  ? {
                                      ...x,
                                      action: e.target.value as
                                        | "Review"
                                        | "Adjust price"
                                        | "Maintain",
                                    }
                                  : x,
                              ),
                            })
                          }
                        >
                          {["Review", "Adjust price", "Maintain"].map((v) => (
                            <option key={v} value={v}>
                              {t(v)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))}
                  <p className="note">
                    <T text="Negative margins are Loss. Recommendations never cancel a contract." />
                  </p>
                </fieldset>
              </Section>
              <button
                className="btn btn-primary finance-save"
                disabled={
                  locked || busy || month < current || dirtyKind === "records"
                }
                onClick={() => save("config")}
              >
                {t("Save configuration for this month onward")}
              </button>
              {month < current && (
                <p className="note">
                  <T text="Historical configuration is locked. Select the current or a future month." />
                </p>
              )}
              <Section title="Recorded monthly totals">
                <p className="note">
                  <T text="Enter full totals, not increments. Saving creates a revision. Technician payouts come from confirmed visits; do not enter them again here." />
                </p>
                <fieldset disabled={locked || busy || dirtyKind === "config"}>
                  {config.costs.map((c) => (
                    <Amount
                      key={c.id}
                      label={c.label}
                      value={
                        records.company.find((v) => v.category === c.id)
                          ?.cents ?? null
                      }
                      onChange={(v) =>
                        changeRecords({
                          ...records,
                          company: [
                            ...records.company.filter(
                              (x) => x.category !== c.id,
                            ),
                            { category: c.id, cents: v },
                          ],
                        })
                      }
                    />
                  ))}
                  {data.sources.customers
                    .filter((c) =>
                      data.report.pools.some((p) => p.customer_id === c.id),
                    )
                    .map((c) => (
                      <div className="finance-receipt" key={c.id}>
                        <h3>{c.name}</h3>
                        <Amount
                          label="Receipts collected"
                          value={
                            records.receipts.find((x) => x.customer_id === c.id)
                              ?.cents ?? null
                          }
                          onChange={(v) =>
                            changeRecords({
                              ...records,
                              receipts: [
                                ...records.receipts.filter(
                                  (x) => x.customer_id !== c.id,
                                ),
                                {
                                  customer_id: c.id,
                                  cents: v,
                                  transactions:
                                    records.receipts.find(
                                      (x) => x.customer_id === c.id,
                                    )?.transactions ?? null,
                                },
                              ],
                            })
                          }
                        />
                        <label>
                          <T text="Transactions" />
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={
                              records.receipts.find(
                                (x) => x.customer_id === c.id,
                              )?.transactions ?? ""
                            }
                            onChange={(e) =>
                              changeRecords({
                                ...records,
                                receipts: [
                                  ...records.receipts.filter(
                                    (x) => x.customer_id !== c.id,
                                  ),
                                  {
                                    customer_id: c.id,
                                    cents:
                                      records.receipts.find(
                                        (x) => x.customer_id === c.id,
                                      )?.cents ?? null,
                                    transactions:
                                      e.target.value === ""
                                        ? null
                                        : Number(e.target.value),
                                  },
                                ],
                              })
                            }
                          />
                        </label>
                      </div>
                    ))}
                </fieldset>
              </Section>
              <DirectEditor
                data={data}
                records={records}
                setRecords={changeRecords}
                disabled={locked || busy || dirtyKind === "config"}
              />
              <Section title="Additional services">
                <p className="note">
                  <T text="Extra visits are detected from stops without a recurring schedule. Record only additional service units here." />
                </p>
                <fieldset disabled={locked || busy || dirtyKind === "config"}>
                  {data.stops
                    .filter((s) =>
                      data.visits.some((v) => v.route_stop_id === s.id),
                    )
                    .map((s) => (
                      <label key={s.id}>
                        {s.service_date} ·{" "}
                        {
                          data.sources.properties.find(
                            (p) => p.id === s.property_id,
                          )?.address
                        }
                        <input
                          type="number"
                          min="0"
                          step="1"
                          aria-label={
                            t("Additional service units") +
                            " " +
                            s.id.slice(0, 6)
                          }
                          value={
                            records.additional.find((a) => a.stop_id === s.id)
                              ?.count ?? 0
                          }
                          onChange={(e) =>
                            changeRecords({
                              ...records,
                              additional: [
                                ...records.additional.filter(
                                  (a) => a.stop_id !== s.id,
                                ),
                                ...(Number(e.target.value) > 0
                                  ? [
                                      {
                                        stop_id: s.id,
                                        count: Number(e.target.value),
                                      },
                                    ]
                                  : []),
                              ],
                            })
                          }
                        />
                      </label>
                    ))}
                </fieldset>
              </Section>
              <button
                className="btn btn-primary finance-save"
                disabled={locked || busy || dirtyKind === "config"}
                onClick={() => save("records")}
              >
                {t("Save recorded totals & expenses")}
              </button>
            </>
          ) : screen === "pool" ? (
            pool ? (
              <PoolDetail pool={pool} data={data} basis={basis} month={month} />
            ) : (
              <p className="notice">
                <T text="Pool is not included in this period." />
              </p>
            )
          ) : (
            <>
              <MetricsCards metrics={data.report[basis]} />
              <Section title="Revenue by business model">
                <div className="finance-line">
                  <span>
                    <T text="Own-customer MRR" />
                  </span>
                  <Money value={data.report.ownMrr} />
                </div>
                <div className="finance-line">
                  <span>
                    <T text="Subcontract monthly agreements" />
                  </span>
                  <Money value={data.report.subcontractMonthly} />
                </div>
                <div className="finance-line">
                  <span>
                    <T text="Subcontract forecast · separate from MRR" />
                  </span>
                  <Money value={data.report.subcontractForecast} />
                </div>
                <p className="note">
                  <T text="Contracted revenue is not cash collected. Fixed-contract revenue requires recorded receipts. Forecast assumes one transaction per recurring agreement." />
                </p>
              </Section>
              <Section title="Cost distribution">
                <Distribution metrics={data.report[basis]} />
                <p className="note">
                  <T text="Unallocated company costs" />:{" "}
                  <Money
                    value={
                      basis === "forecast"
                        ? data.report.unallocatedForecast
                        : data.report.unallocatedRecorded
                    }
                  />
                </p>
              </Section>
              <Section title="Profit by Client / Pool">
                <label>
                  <T text="Sort pools" />
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    {[
                      ["profit-desc", "Highest profit"],
                      ["profit-asc", "Lowest profit"],
                      ["margin", "Margin"],
                      ["cost", "Technician Cost"],
                    ].map(([v, l]) => (
                      <option value={v} key={v}>
                        {t(l)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="finance-pool-list">
                  {rows.map((p) => (
                    <Link
                      className="finance-pool-link"
                      key={p.id}
                      href={"/finance/pools/" + p.id + "?month=" + month}
                    >
                      <div>
                        <strong>{p.customer}</strong>
                        <span>
                          {p.name} ·{" "}
                          <T text={marginBand(p[basis].margin, config).label} />
                        </span>
                      </div>
                      <Money value={p[basis].profit} />
                    </Link>
                  ))}
                </div>
                {data.report.byClient.map((c) => (
                  <details key={c.id}>
                    <summary>
                      {c.name} · <T text="Client total" />
                    </summary>
                    <MetricsCards metrics={c[basis]} />
                  </details>
                ))}
              </Section>
              <Section title="Profit by Technician">
                <p className="note">
                  <T text="Revenue and overhead are allocated by serviced stops. This estimates the portfolio contribution, not the technician’s personal profit." />
                </p>
                {data.report.byTechnician.map((tech) => (
                  <details key={tech.id}>
                    <summary>{tech.name}</summary>
                    <MetricsCards metrics={tech[basis]} />
                  </details>
                ))}
              </Section>
            </>
          )}
          {screen !== "costs" && (
            <Section title="Monthly Trends">
              <div className="finance-trends">
                {[
                  ...data.history.filter((h) => h.month !== month),
                  {
                    month,
                    forecast: data.report.forecast,
                    recorded: data.report.recorded,
                    pools: data.report.pools,
                  },
                ]
                  .sort((a, b) => a.month.localeCompare(b.month))
                  .slice(-6)
                  .map((h) => {
                    const m =
                      screen === "pool"
                        ? h.pools?.find((p) => p.id === poolId)?.[basis]
                        : h[basis];
                    return (
                      <div key={h.month}>
                        <span>{h.month}</span>
                        {m ? (
                          <>
                            <Money value={m.profit} />
                            <div className="finance-bar">
                              <i
                                style={{
                                  width:
                                    m.margin === null
                                      ? "0%"
                                      : Math.min(
                                          100,
                                          Math.abs(m.margin) / 100,
                                        ) + "%",
                                  background:
                                    (m.profit ?? 0) < 0 ? "#be3441" : undefined,
                                }}
                              />
                            </div>
                          </>
                        ) : (
                          <span>
                            <T text="See closed period for comparison" />
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
              {data.history.length === 0 && (
                <p className="note">
                  <T text="Previous results appear after a period is closed. No historical values are invented." />
                </p>
              )}
            </Section>
          )}
          <Section title="Period controls">
            <p className="note">
              <T text="Open periods use confirmed visits as they arrive. Closing freezes results and source data. Late offline visits after closing need review and are not silently added." />
            </p>
            <p className="note">
              <T text="Source captured" />:{" "}
              {data.report.captured_at.slice(0, 10)}
            </p>
            {!locked && (
              <button
                className="btn btn-secondary"
                disabled={busy || dirty}
                onClick={() => save("open")}
              >
                {t(
                  data.sourceSaved
                    ? "Recapture period sources"
                    : "Capture period sources",
                )}
              </button>
            )}
            {!locked && month < current && (
              <button
                className="btn btn-secondary"
                disabled={
                  busy ||
                  dirty ||
                  !data.sourceSaved ||
                  data.report.recorded.profit === null
                }
                onClick={() => {
                  if (
                    window.confirm(
                      t(
                        "Close this month? The saved results will be immutable.",
                      ),
                    )
                  )
                    void save("close");
                }}
              >
                {t("Close period")}
              </button>
            )}
            {locked && (
              <p>
                <T text="Closed period · historical snapshot" />
              </p>
            )}
          </Section>
          <p className="note">
            <T text="Operating profit is an estimate before unregistered expenses and taxes. Technician cost is due, not proof of payment." />
          </p>
        </>
      )}
    </div>
  );
}
function PoolDetail({
  pool: p,
  data,
  basis,
  month,
}: {
  pool: PoolResult;
  data: Data;
  basis: Basis;
  month: string;
}) {
  const previous = [...data.history]
    .filter((h) => h.month < month)
    .sort((a, b) => b.month.localeCompare(a.month))[0];
  return (
    <>
      <Section title="Pool Profitability">
        <h2>{p.name}</h2>
        <p>
          {p.customer} · {p.address}
        </p>
        <div className="finance-line">
          <span>
            <T text="Contracted monthly revenue" />
          </span>
          <Money value={p.forecast.revenue} />
        </div>
        <div className="finance-line">
          <span>
            <T text="Calendar visits / completed" />
          </span>
          <strong>
            {p.planned} / {p.completed}
          </strong>
        </div>
        <p>
          <T text="Assigned technicians" />:{" "}
          {p.technicians
            .map(
              (id) =>
                data.sources.technicians.find((t) => t.id === id)
                  ?.display_name ?? "—",
            )
            .join(", ") || tFallback("Unassigned")}
        </p>
        {p.rates.map((rate) => {
          const [model, value] = rate.split(":");
          return (
            <p className="note" key={rate}>
              <T
                text={
                  model === "per_visit"
                    ? "Per completed visit"
                    : "Monthly fixed payout"
                }
              />
              : <Money value={value === "unknown" ? null : Number(value)} />
            </p>
          );
        })}
        <span className="finance-classification">
          <T text={marginBand(p[basis].margin, data.config).label} /> ·{" "}
          <T text={marginBand(p[basis].margin, data.config).action} />
        </span>
        {p.warnings.map((w) => (
          <p className="finance-warning" key={w}>
            <T text={w} />
          </p>
        ))}
      </Section>
      <MetricsCards metrics={p[basis]} />
      <Section title="Cost distribution">
        <Distribution metrics={p[basis]} />
      </Section>
      <Section title="Monthly comparison">
        {previous ? (
          <Link
            className="btn btn-secondary"
            href={"/finance/pools/" + p.id + "?month=" + previous.month}
          >
            <T text="Previous closed period" /> · {previous.month}
          </Link>
        ) : (
          <p className="note">
            <T text="Previous results appear after a period is closed. No historical values are invented." />
          </p>
        )}
        {previous?.pools?.find((v) => v.id === p.id) && (
          <div className="finance-line">
            <span>
              <T text="Previous operating profit" />
            </span>
            <Money
              value={previous.pools.find((v) => v.id === p.id)![basis].profit}
            />
          </div>
        )}
        <div className="finance-link-actions">
          <Link
            className="btn btn-secondary"
            href={"/customers/" + p.customer_id + "?tab=properties"}
          >
            <T text="View customer" />
          </Link>
          <Link
            className="btn btn-secondary"
            href={"/finance/costs?month=" + month}
          >
            <T text="Edit business costs" />
          </Link>
        </div>
      </Section>
    </>
  );
}
function tFallback(text: string) {
  return <T text={text} />;
}
function DirectEditor({
  data,
  records,
  setRecords,
  disabled,
}: {
  data: Data;
  records: FinanceRecords;
  setRecords: (r: FinanceRecords) => void;
  disabled: boolean;
}) {
  const { t } = useLanguage();
  const [pool, setPool] = useState(data.report.pools[0]?.id ?? ""),
    [category, setCategory] = useState("other"),
    [label, setLabel] = useState(""),
    [value, setValue] = useState<number | null>(null),
    [basis, setBasis] = useState<Basis>("recorded");
  return (
    <Section title="ALYS-paid direct expenses">
      <p className="note">
        <T text="Technician-paid costs are excluded. Forecast and recorded expenses are separate. Confirm totals including zero when applicable." />
      </p>
      <fieldset disabled={disabled}>
        {data.report.pools.map((p) => (
          <label className="finance-check" key={p.id}>
            <input
              type="checkbox"
              checked={records.direct_complete.includes(p.id)}
              onChange={(e) =>
                setRecords({
                  ...records,
                  direct_complete: e.target.checked
                    ? [...records.direct_complete, p.id]
                    : records.direct_complete.filter((id) => id !== p.id),
                })
              }
            />
            <span>
              {p.customer} · {p.name} · <T text="Direct expenses confirmed" />
            </span>
          </label>
        ))}
        {records.direct.map((e) => (
          <div className="finance-line" key={e.id}>
            <span>
              {e.label} · <T text={e.basis} />
            </span>
            <Money value={e.cents} />
            <button
              className="btn btn-secondary"
              onClick={() =>
                setRecords({
                  ...records,
                  direct: records.direct.filter((x) => x.id !== e.id),
                })
              }
            >
              {t("Remove")}
            </button>
          </div>
        ))}
        <label>
          <T text="Pool" />
          <select value={pool} onChange={(e) => setPool(e.target.value)}>
            {data.report.pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.customer} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="finance-two">
          <label>
            <T text="Category" />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {["chemicals", "fuel", "vehicle", "tools", "other"].map((c) => (
                <option value={c} key={c}>
                  {t(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <T text="View" />
            <select
              value={basis}
              onChange={(e) => setBasis(e.target.value as Basis)}
            >
              <option value="forecast">{t("Forecast")}</option>
              <option value="recorded">{t("Recorded / accrued")}</option>
            </select>
          </label>
        </div>
        <label>
          <T text="Description" />
          <input
            value={label}
            maxLength={100}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <Amount label="Expense amount" value={value} onChange={setValue} />
        <button
          className="btn btn-secondary"
          disabled={!pool || !label.trim() || value === null}
          onClick={() => {
            setRecords({
              ...records,
              direct: [
                ...records.direct,
                {
                  id: crypto.randomUUID(),
                  pool_id: pool,
                  category:
                    category as FinanceRecords["direct"][number]["category"],
                  label: label.trim(),
                  cents: value!,
                  basis,
                },
              ],
            });
            setLabel("");
            setValue(null);
          }}
        >
          {t("Add expense")}
        </button>
      </fieldset>
    </Section>
  );
}
