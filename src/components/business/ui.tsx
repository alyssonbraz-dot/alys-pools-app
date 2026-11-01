"use client";
import { type ReactNode, useEffect, useState } from "react";
import { T, CurrencyText } from "@/components/i18n";
import { MobileHeader } from "@/components/mobile/field-layout";
import type { BusinessReport } from "@/lib/business/contribution";
import type { FinanceConfig } from "@/lib/finance/schema";
import "./business.css";
export function BusinessHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <MobileHeader
      title={typeof title==='string'?<T text={title}/>:title}
      address={subtitle}
      action={action}
    />
  );
}
export function BusinessCard({
  title,
  children,
  action,
}: {
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="business-card">
      {title && (
        <header>
          <h2>
            {typeof title==='string'?<T text={title}/>:title}
          </h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
export function Money({
  cents,
  unknown = "Not priced",
}: {
  cents: number | null;
  unknown?: string;
}) {
  return cents === null ? (
    <span className="business-unpriced business-value">
      <T text={unknown} />
    </span>
  ) : (
    <span className="business-value">
      <CurrencyText value={cents / 100} />
    </span>
  );
}
export function BusinessMetric({
  label,
  value,
  help,
}: {
  label: string;
  value: ReactNode;
  help?: string;
}) {
  return (
    <div className="business-metric">
      <span>
        <T text={label} />
      </span>
      <strong>{value}</strong>
      {help && (
        <small>
          <T text={help} />
        </small>
      )}
    </div>
  );
}
export type BusinessData = {
  legacyRates?: { customer_id: string; rate_cents: number }[];
  report: BusinessReport;
  latest_config_id: string | null;
  terms: FinanceConfig["terms"];
  customers: { id: string; name: string }[];
  technicians: { id: string; display_name: string }[];
  contracts: {
    id: string;
    customer_id: string;
    source: string;
    status: string;
    billing_model: string;
  }[];
};
export function useBusiness(month: string) {
  const [result, setResult] = useState<{
    key: string;
    data?: BusinessData;
    error?: string;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const key = month + ":" + revision;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/contribution?month=" + month, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        return data;
      })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setResult({ key, error: e.message });
      });
    return () => controller.abort();
  }, [month, key]);
  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    reload: () => setRevision((n) => n + 1),
  };
}
export function currentMonth() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/New_York" })
    .format(new Date())
    .slice(0, 7);
}
