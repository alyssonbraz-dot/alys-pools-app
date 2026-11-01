"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { T, useLanguage } from "@/components/i18n";
import { BusinessHeader, BusinessCard } from "@/components/business/ui";
import { customersCsv, type CustomerRecord } from "@/lib/customer-management";
export function CustomerManager({
  legacyOnly = false,
}: {
  legacyOnly?: boolean;
}) {
  const query = useSearchParams(),
    { t } = useLanguage();
  const [tag, setTag] = useState(""),
    [sort, setSort] = useState("name");
  const [customers, setCustomers] = useState<CustomerRecord[] | null>(null),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("active"),
    [missing, setMissing] = useState(query.get("locations") === "missing"),
    [selected, setSelected] = useState<string[]>([]),
    [manage, setManage] = useState(false),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [bulkAction, setBulkAction] = useState("status"),
    [bulkValue, setBulkValue] = useState("active"),
    [people, setPeople] = useState<{ id: string; display_name: string }[]>([]);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/customers", { cache: "no-store", signal: c.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        return d;
      })
      .then((d) => {
        setCustomers(d.customers);
        setPeople(d.technicians);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [revision]);
  const rows = (customers ?? [])
    .filter(
      (c) =>
        (legacyOnly
          ? c.business_source === "legacy"
          : c.business_source !== "legacy") &&
        (!tag || c.customer_tags.some((v) => v.tag === tag)) &&
        (status === "all" || c.status === status) &&
        (!missing || c.properties.some((p) => !p.location_confirmed)) &&
        [c.name, c.email, c.phone, ...c.properties.map((p) => p.address)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === "status"
        ? a.status.localeCompare(b.status) || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
  function download() {
    const list = selected.length
      ? rows.filter((c) => selected.includes(c.id))
      : rows;
    const url = URL.createObjectURL(
      new Blob([customersCsv(list)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "alys-customers.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function bulk() {
    if (
      !selected.length ||
      !confirm(
        t(
          bulkAction === "archive"
            ? "Archive selected customers and cancel their future open stops? Their service history will be preserved."
            : "Apply this action to the selected customers?",
        ),
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/customers/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selected,
          action: bulkAction,
          value: bulkValue,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSelected([]);
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="business-page customer-list-v3">
      <BusinessHeader
        title={legacyOnly ? "Outside subcontract work" : "Customers"}
        subtitle={
          <T
            text={
              legacyOnly
                ? "Existing records only. Your owned customers stay separate."
                : "Your customers, properties and service in one place."
            }
          />
        }
        action={
          !legacyOnly ? (
            <Link className="btn btn-primary" href="/customers/new">
              <T text="Add Customer" />
            </Link>
          ) : undefined
        }
      />
      <label className="business-search">
        <span className="sr-only">
          <T text="Search customers" />
        </span>
        <input
          type="search"
          value={search}
          placeholder={t("Search name or address")}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <details className="business-details customer-tools">
        <summary>
          <T text="Filters & tools" />
        </summary>
        <div className="business-controls">
          <label>
            <T text="Status" />
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {["active", "lead", "inactive", "all"].map((s) => (
                <option value={s} key={s}>
                  {t(s === "all" ? "All statuses" : s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <T text="Tags" />
            <select value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">{t("All tags")}</option>
              {[
                ...new Set(
                  (customers ?? []).flatMap((c) =>
                    c.customer_tags.map((v) => v.tag),
                  ),
                ),
              ]
                .sort()
                .map((v) => (
                  <option key={v}>{v}</option>
                ))}
            </select>
          </label>
          <label>
            <T text="Sort by" />
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name">{t("Name")}</option>
              <option value="status">{t("Status")}</option>
            </select>
          </label>
          <label className="check-setting">
            <input
              type="checkbox"
              checked={missing}
              onChange={(e) => setMissing(e.target.checked)}
            />
            <T text="Only properties missing coordinates" />
          </label>
        </div>
        <div className="business-actions">
          <button
            className="btn btn-secondary"
            onClick={download}
            disabled={!rows.length}
          >
            <T text="Export CSV" />
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setManage((v) => !v)}
          >
            <T text="Bulk actions" />
          </button>
        </div>
      </details>
      {error && (
        <p className="notice" role="alert">
          {t(error)}{" "}
          <button
            className="btn btn-secondary"
            onClick={() => {
              setError("");
              setRevision((n) => n + 1);
            }}
          >
            {t("Try again")}
          </button>
        </p>
      )}
      {!customers && !error && (
        <p role="status">
          <T text="Loading customers…" />
        </p>
      )}
      {manage && (
        <BusinessCard title="Bulk actions">
          <label className="check-setting">
            <input
              type="checkbox"
              checked={
                !!rows.length && rows.every((c) => selected.includes(c.id))
              }
              onChange={(e) =>
                setSelected(
                  e.target.checked ? rows.slice(0, 200).map((c) => c.id) : [],
                )
              }
            />
            <T text="Select visible customers" />
          </label>
          <div className="business-controls">
            <label>
              <T text="Bulk action" />
              <select
                value={bulkAction}
                onChange={(e) => {
                  setBulkAction(e.target.value);
                  setBulkValue(e.target.value === "status" ? "active" : "");
                }}
              >
                {[
                  ["status", "Change status"],
                  ["assign", "Assign technician"],
                  ["add_tag", "Add tag"],
                  ["remove_tag", "Remove tag"],
                  ["invite", "Send portal invitations"],
                  ["archive", "Archive customers"],
                ].map(([v, l]) => (
                  <option value={v} key={v}>
                    {t(l)}
                  </option>
                ))}
              </select>
            </label>
            {bulkAction === "status" ? (
              <label>
                <T text="Status" />
                <select
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                >
                  {["active", "lead", "inactive"].map((v) => (
                    <option key={v} value={v}>
                      {t(v)}
                    </option>
                  ))}
                </select>
              </label>
            ) : bulkAction === "assign" ? (
              <label>
                <T text="Technician" />
                <select
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                >
                  <option value="">{t("Unassigned")}</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : ["add_tag", "remove_tag"].includes(bulkAction) ? (
              <label>
                <T text="Tag" />
                <input
                  value={bulkValue}
                  maxLength={30}
                  onChange={(e) => setBulkValue(e.target.value)}
                />
              </label>
            ) : null}
          </div>
          <button
            className="btn btn-secondary"
            disabled={busy || !selected.length}
            onClick={() => void bulk()}
          >
            <T text="Apply" /> ({selected.length})
          </button>
        </BusinessCard>
      )}
      <div className="business-customer-list">
        {rows.map((c) => (
          <article className="business-customer" key={c.id}>
            {manage && (
              <input
                type="checkbox"
                aria-label={t("Select") + " " + c.name}
                checked={selected.includes(c.id)}
                onChange={(e) =>
                  setSelected((v) =>
                    e.target.checked
                      ? [...v.slice(0, 199), c.id]
                      : v.filter((id) => id !== c.id),
                  )
                }
              />
            )}
            <Link href={"/customers/" + c.id}>
              <div>
                <strong>{c.name}</strong>
                <p>{c.properties[0]?.address || t("No property yet")}</p>
                <small>
                  {c.summary?.water_body_count ?? 0} <T text="pools / spas" /> ·{" "}
                  {c.summary?.technician_names.join(", ") || t("Not scheduled")}
                </small>
              </div>
              <span aria-hidden>›</span>
            </Link>
          </article>
        ))}
      </div>
      {customers && !rows.length && (
        <BusinessCard>
          <p>
            <T
              text={
                search
                  ? "No matching customers."
                  : "Add your first owned customer to start building recurring revenue."
              }
            />
          </p>
        </BusinessCard>
      )}
    </div>
  );
}
