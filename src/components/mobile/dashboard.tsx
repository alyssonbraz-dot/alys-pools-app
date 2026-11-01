"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { T, DateText, useLanguage } from "@/components/i18n";
import { WeekCalendar } from "@/components/route-calendar";
import { DeviceSyncSummary } from "@/components/device-sync-summary";
import { MobileHeader } from "./field-layout";
import { BusinessCard, BusinessMetric, Money } from "@/components/business/ui";
import type { BusinessReport } from "@/lib/business/contribution";
import type { RouteData } from "@/lib/field/types";
type Result = { key: string; route?: RouteData; error?: string };
export function MobileDashboard({
  name,
  date: initialDate,
  timeZone,
  scope,
  business,
  businessError,
  pendingReports = 0,
}: {
  name: string;
  date: string;
  timeZone: string;
  scope: { userId: string; organizationId: string };
  business?: BusinessReport;
  businessError?: boolean;
  pendingReports?: number;
}) {
  const { t } = useLanguage();
  const [date, setDate] = useState(initialDate),
    [result, setResult] = useState<Result | null>(null),
    [retry, setRetry] = useState(0);
  const { userId, organizationId } = scope;
  const key = JSON.stringify([userId, organizationId, date, timeZone, retry]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch("/api/route?" + new URLSearchParams({ date, timezone: timeZone }), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data: RouteData = await response.json();
        if (
          data.userId !== userId ||
          data.orgId !== organizationId ||
          data.date !== date ||
          data.timeZone !== timeZone ||
          !Array.isArray(data.stops)
        )
          throw new Error();
        if (active) setResult({ key, route: data });
      })
      .catch(() => {
        if (active && !controller.signal.aborted)
          setResult({ key, error: "Your route is unavailable" });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, date, timeZone, userId, organizationId]);
  const current = result?.key === key ? result.route : undefined,
    error = result?.key === key ? result.error : undefined;
  const completed =
      current?.stops.filter((s) => s.status === "completed").length ?? 0,
    remaining =
      current?.stops.filter((s) => !["completed", "skipped"].includes(s.status))
        .length ?? 0;
  const ownWork = current?.stops.some(
    (s) =>
      s.technician_id === userId &&
      !["completed", "skipped"].includes(s.status),
  );
  const routeHref =
    "/route?" +
    new URLSearchParams({
      date,
      timezone: timeZone,
      ...(!ownWork ? { technician: "all" } : {}),
    });
  return (
    <section className="mobile-dashboard business-page">
      <MobileHeader
        title={<T text="Home" />}
        eyebrow={name}
        address={
          <DateText
            value={date}
            options={{
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone,
            }}
          />
        }
      />
      <div className="business-home-metrics">
        <BusinessMetric
          label="Active owned customers"
          value={business?.ownedCustomers ?? "—"}
        />
        <BusinessMetric
          label="Monthly recurring revenue"
          value={<Money cents={business?.ownedMrr ?? null} />}
        />
      </div>
      <BusinessCard>
        <div className="business-home-contribution">
          <span>
            <T
              text={
                business?.estimatedContribution === null
                  ? "Before your labor"
                  : "Estimated monthly contribution"
              }
            />
          </span>
          <strong>
            <Money
              cents={
                business?.estimatedContribution ??
                business?.beforeOwnerLabor ??
                null
              }
            />
          </strong>
          <small>
            <T
              text={
                business?.estimatedContribution === null
                  ? "Owner labor is unpriced."
                  : "Before business expenses and taxes."
              }
            />
          </small>
        </div>
      </BusinessCard>
      {businessError && (
        <p className="note">
          <T text="Contribution is unavailable. Your route is still accessible." />
        </p>
      )}
      <div className="business-today">
        <div>
          <span>
            <T text="Pools scheduled today" />
          </span>
          <strong>
            {current
              ? new Set(
                  current.stops.flatMap((s) =>
                    (s.pools ?? []).map((p) => p.id),
                  ),
                ).size
              : "—"}
          </strong>
        </div>
        <div>
          <strong>
            {current ? completed : "—"} <T text="completed" /> ·{" "}
            {current ? remaining : "—"} <T text="remaining" />
          </strong>
          <div className="business-progress">
            <i
              style={{
                width: current?.stops.length
                  ? `${(completed / current.stops.length) * 100}%`
                  : "0%",
              }}
            />
          </div>
        </div>
      </div>
      {(!current || error) && (
        <div className="technician-summary-list">
          {error && (
            <div role="alert">
              <p>
                <T text={error} />
              </p>
              <button
                className="btn btn-secondary"
                onClick={() => setRetry((v) => v + 1)}
              >
                <T text="Try again" />
              </button>
            </div>
          )}
          {!current && !error && (
            <p role="status">
              <T text="Loading your route…" />
            </p>
          )}
        </div>
      )}
      <Link className="btn btn-primary business-primary" href={routeHref}>
        <T text={ownWork ? "Start Today’s Route" : "View Today’s Route"} /> →
      </Link>
      <div className="dashboard-sync-lane">
        <DeviceSyncSummary compact scope={scope} />
        {pendingReports > 0 && (
          <Link className="business-report-notice" href="/reports">
            {pendingReports} <T text="reports pending or needing attention" /> →
          </Link>
        )}
      </div>
      <details className="business-details business-card home-advanced">
        <summary>
          <T text="Business & route details" />
        </summary>
        <WeekCalendar date={date} timeZone={timeZone} onChange={setDate} />
        <div className="business-inline">
          <T text="Delegated customers" />
          <strong>{business?.delegatedCustomers ?? "—"}</strong>
        </div>
        <div className="business-inline">
          <T text="Average contribution per customer" />
          <Money cents={business?.averageContribution ?? null} />
        </div>
        <Link href="/finance">
          <T text="Profitability" /> →
        </Link>
        {current &&
          [...new Set(current.stops.map((s) => s.technician_id))].map((id) => (
            <Link
              className="business-inline technician-summary-card-v3"
              href={
                "/route?" +
                new URLSearchParams({
                  date,
                  timezone: timeZone,
                  technician: id,
                })
              }
              key={id}
            >
              <strong>
                {current.technicians?.find((t) => t.id === id)?.display_name ??
                  t("Assigned technician")}
              </strong>
              <span>
                {current.stops.filter((s) => s.technician_id === id).length}{" "}
                <T text="stops" /> →
              </span>
            </Link>
          ))}
      </details>
    </section>
  );
}
