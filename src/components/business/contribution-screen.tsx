"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { T, useLanguage } from "@/components/i18n";
import {
  BusinessHeader,
  BusinessCard,
  BusinessMetric,
  Money,
  useBusiness,
  currentMonth,
} from "./ui";
import { PaymentRate } from "./payment-rate";
export function ContributionScreen({ poolId }: { poolId?: string }) {
  const q = useSearchParams(),
    { t } = useLanguage();
  const [month, setMonth] = useState(
    /^20\d{2}-(0[1-9]|1[0-2])$/.test(q.get("month") ?? "")
      ? q.get("month")!
      : currentMonth(),
  );
  const [basis, setBasis] = useState<"forecast" | "completed">("forecast");
  const [sort, setSort] = useState("name");
  const { data, error, reload } = useBusiness(month);
  const rows =
    data?.report.customers
      .filter(
        (c) =>
          (!q.get("customer") || c.id === q.get("customer")) &&
          (!poolId || c.poolIds.includes(poolId)),
      )
      .sort((a, b) =>
        sort === "name"
          ? a.name.localeCompare(b.name)
          : (b[basis].contribution ?? -Infinity) -
            (a[basis].contribution ?? -Infinity),
      ) ?? [];
  const focused = !!q.get("customer") || !!poolId;
  const scopedRevenue = focused
    ? rows.reduce((n, c) => n + (c.monthlyRevenue ?? 0), 0)
    : (data?.report.ownedMrr ?? 0);
  const scopedContribution = focused
    ? rows.some((c) => c.forecast.contribution === null)
      ? null
      : rows.reduce((n, c) => n + c.forecast.contribution!, 0)
    : (data?.report.estimatedContribution ?? null);
  const beforeLabor = focused
    ? rows.some((c) => c.forecast.beforeOwnerLabor === null)
      ? null
      : rows.reduce((n, c) => n + c.forecast.beforeOwnerLabor!, 0)
    : (data?.report.beforeOwnerLabor ?? null);
  return (
    <div className="business-page contribution-page">
      <BusinessHeader
        title="Profitability"
        subtitle={<T text="Revenue minus technician payments. Simple." />}
      />
      <div className="business-controls">
        <label>
          <T text="Month" />
          <input
            type="month"
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
            }}
          />
        </label>
        <label>
          <T text="Visits" />
          <select
            value={basis}
            onChange={(e) => setBasis(e.target.value as typeof basis)}
          >
            <option value="forecast">{t("Expected this month")}</option>
            <option value="completed">
              {t("Completed · server confirmed")}
            </option>
          </select>
        </label>
      </div>
      {error && (
        <p className="notice" role="alert">
          {t(error)}{" "}
          <button className="btn btn-secondary" onClick={reload}>
            {t("Try again")}
          </button>
        </p>
      )}
      {!data && !error && (
        <p role="status">
          <T text="Loading contribution…" />
        </p>
      )}
      {data && (
        <div className="contribution-results">
          <div className="business-metrics">
            <BusinessMetric
              label={focused ? "Monthly revenue" : "Owned MRR"}
              value={<Money cents={scopedRevenue} />}
            />
            <BusinessMetric
              label={
                scopedContribution === null
                  ? "Before owner labor"
                  : "Estimated monthly contribution"
              }
              value={<Money cents={scopedContribution ?? beforeLabor} />}
              help={
                scopedContribution === null
                  ? "Owner labor is unpriced."
                  : "Before business expenses and taxes."
              }
            />
          </div>
          <p className="note">
            <T text="Contribution is not accounting net profit. Completed-visit payments are due estimates, not bank-confirmed payments." />
          </p>
          <label className="business-sort">
            <T text="Sort customers" />
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name">{t("Name")}</option>
              <option value="contribution">{t("Highest contribution")}</option>
            </select>
          </label>
          {rows.map((c) => (
            <BusinessCard
              key={c.id}
              title={<>{c.name}</>}
              action={
                <Link href={"/customers/" + c.id}>
                  <T text="Customer" /> →
                </Link>
              }
            >
              <>
                {!c.active && (
                  <p className="note">
                    <T text="Inactive" /> · <T text="confirmed visits" />
                  </p>
                )}
                <div className="contribution-equation">
                  <div>
                    <span>
                      <T text="Monthly revenue" />
                    </span>
                    <strong>
                      <Money cents={c.monthlyRevenue} />
                    </strong>
                  </div>
                  <span aria-hidden>−</span>
                  <div>
                    <span>
                      <T
                        text={
                          c[basis].ownerLabor && c[basis].ownerLabor! > 0
                            ? "Service labor"
                            : "Technician payments"
                        }
                      />
                    </span>
                    <strong>
                      <Money
                        cents={
                          c[basis].technicianPayments === null
                            ? null
                            : c[basis].technicianPayments! +
                              (c[basis].ownerLabor ?? 0)
                        }
                      />
                    </strong>
                  </div>
                </div>
              </>
              <div className="contribution-answer">
                <div>
                  <span>
                    <T
                      text={
                        c[basis].unpricedOwnerVisits
                          ? "Before owner labor"
                          : "Estimated contribution"
                      }
                    />
                  </span>
                  <strong>
                    <Money
                      cents={
                        c[basis].unpricedOwnerVisits
                          ? c[basis].beforeOwnerLabor
                          : c[basis].contribution
                      }
                    />
                  </strong>
                </div>
                <span>
                  {c[basis].margin === null ? (
                    <T
                      text={
                        c[basis].unpricedOwnerVisits
                          ? "Labor unpriced"
                          : "Not priced"
                      }
                    />
                  ) : (
                    (c[basis].margin / 100).toFixed(1) + "%"
                  )}
                </span>
              </div>
              <p className="business-customer-meta">
                {basis === "forecast" ? c.expectedVisits : c.completedVisits}{" "}
                <T
                  text={
                    basis === "forecast"
                      ? "expected visits"
                      : "confirmed visits"
                  }
                />{" "}
                ·{" "}
                {c.technicians
                  .map(
                    (id) =>
                      data.technicians.find((t) => t.id === id)?.display_name ??
                      t("Unassigned"),
                  )
                  .join(", ")}
              </p>
              {c[basis].unpricedOwnerVisits > 0 && (
                <p className="note">
                  <T text="Revenue before your own labor. Price your labor in Team to estimate contribution." />
                </p>
              )}
              <details className="business-details">
                <summary>
                  <T text="Payment details" />
                </summary>
                <div className="business-inline">
                  <T text="Rate per visit" />
                  <Money
                    cents={c.rate}
                    unknown={c.mixedRates ? "Mixed rates" : "Not priced"}
                  />
                </div>
                {c[basis].ownerLabor !== null && c[basis].ownerLabor! > 0 && (
                  <div className="business-inline">
                    <T text="Owner labor" />
                    <Money cents={c[basis].ownerLabor} />
                  </div>
                )}
                <p className="note">
                  <T text="Weekly service follows the calendar, including five-visit months. Chemicals remain in the service report only." />
                </p>
                <PaymentRate
                  key={data.latest_config_id ?? "new"}
                  target="customer"
                  targetId={c.id}
                  data={data}
                  onSaved={reload}
                  month={month}
                />
              </details>
            </BusinessCard>
          ))}
          {!rows.length && (
            <BusinessCard>
              <p>
                <T text="Add your first owned customer to start building recurring revenue." />
              </p>
              <Link className="btn btn-primary" href="/customers/new">
                <T text="Add Customer" />
              </Link>
            </BusinessCard>
          )}
          <details className="business-details business-card">
            <summary>
              <T text="Growth & workload" />
            </summary>
            <div className="business-metrics">
              <BusinessMetric
                label="Owned customers"
                value={data.report.ownedCustomers}
              />
              <BusinessMetric
                label="Delegated customers"
                value={data.report.delegatedCustomers}
              />
              <BusinessMetric
                label="Average contribution per customer"
                value={<Money cents={data.report.averageContribution} />}
              />
            </div>
            {data.report.workload.map((w) => (
              <div className="business-inline" key={w.id}>
                <strong>{w.name}</strong>
                <span>
                  {w.pools} <T text="pools" /> · {w.expected}{" "}
                  <T text="expected visits" /> · {w.completed}{" "}
                  <T text="confirmed visits" />
                </span>
              </div>
            ))}
          </details>
          {data.report.archivedFinancials && (
            <p className="note">
              <T text="Archived financials remain unchanged. This live contribution view can include later synchronized visits." />
            </p>
          )}
          <details className="business-details">
            <summary>
              <T text="Advanced & historical financials" />
            </summary>
            {data.report.warnings.map((w) => (
              <p className="note" key={w}>
                <T text={w} />
              </p>
            ))}
            <Link href="/finance/advanced">
              <T text="Open historical financial settings" /> →
            </Link>
            <p>
              <Link href="/legacy/financials">
                <T text="Profitability V1 records" /> →
              </Link>
            </p>
          </details>
        </div>
      )}
    </div>
  );
}
