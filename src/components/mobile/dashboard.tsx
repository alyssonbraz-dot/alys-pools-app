"use client";
import {appPathInput} from '@/lib/app-path';
import { useEffect, useState } from "react";
import Link from "next/link";
import { T, DateText, useLanguage } from "@/components/i18n";
import { WeekCalendar } from "@/components/route-calendar";
import { DeviceSyncSummary } from "@/components/device-sync-summary";
import {Metric,SectionHeading} from "@/components/v4/primitives";
import {ProgressDial} from "./field-layout";
import {Icon} from "@/components/design/icon";
import { MobileHeader } from "./field-layout";
import { BusinessCard, Money } from "@/components/business/ui";
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
    fetch(appPathInput("/api/route?" + new URLSearchParams({ date, timezone: timeZone })), {
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
  const next=current?.stops.find(s=>!["completed","skipped"].includes(s.status));
  const visitHref=next?"/visit/"+next.id+"?"+new URLSearchParams({date,timezone:timeZone}):routeHref;
  return <section className="mobile-dashboard business-page v4-home">
    <MobileHeader title={<T text="Your day, simplified"/>} eyebrow={name} address={<DateText value={date} options={{weekday:"long",month:"short",day:"numeric",timeZone}}/>}/>
    <section className="v4-day-card" aria-label={t("Today’s progress")}><div className="v4-day-progress"><ProgressDial completed={completed} total={current?.stops.length??0}/><div><h2><T text="Today’s visits"/></h2><p>{current?remaining:"—"} <T text="remaining"/> · {current?completed:"—"} <T text="completed"/></p></div></div><Link className="btn btn-primary v4-main-action" href={visitHref}><Icon name="service"/><T text={next?"Start next visit":"View Today’s Route"}/><Icon name="arrow"/></Link></section>
    <div className="v4-home-metrics"><Metric label="Monthly Revenue" value={<Money cents={business?.ownedMrr??null}/>} icon="finance"/><Metric label="Owned customers" value={business?.ownedCustomers??"—"} icon="customers"/></div>
    <div className="dashboard-sync-lane"><DeviceSyncSummary compact scope={scope}/>{pendingReports>0&&<Link className="v4-attention-card" href="/reports"><Icon name="shield"/><span>{pendingReports} <T text="reports pending or needing attention"/></span><Icon name="chevron"/></Link>}</div>
    <SectionHeading title="Up next" action={<Link href={routeHref}><T text="View Today’s Route"/> →</Link>}/>
    {next?<Link className="v4-next-customer" href={visitHref}><span className="v4-next-number">{next.position}</span><span><strong>{next.customer.name}</strong><small>{next.property.address}</small></span><Icon name="chevron"/></Link>:current?<BusinessCard><Icon name="check"/><T text="No remaining visits"/></BusinessCard>:null}
    {(!current||error)&&<div className="technician-summary-list">{error?<div role="alert"><p><T text={error}/></p><button className="btn btn-secondary" onClick={()=>setRetry(v=>v+1)}><T text="Try again"/></button></div>:<p role="status"><T text="Loading your route…"/></p>}</div>}
    <details className="business-details business-card home-advanced"><summary><T text="Business & route details"/></summary><WeekCalendar date={date} timeZone={timeZone} onChange={setDate}/><div className="business-inline"><T text={business?.estimatedContribution===null?"Before your labor":"Estimated Contribution"}/><Money cents={business?.estimatedContribution??business?.beforeOwnerLabor??null}/></div><p className="note"><T text={business?.estimatedContribution===null?"Owner labor is unpriced.":"Before business expenses and taxes."}/></p><div className="business-inline"><T text="Delegated customers"/><strong>{business?.delegatedCustomers??"—"}</strong></div><Link href="/finance"><T text="Profitability"/> →</Link>{current&&[...new Set(current.stops.map(s=>s.technician_id))].map(id=><Link className="business-inline technician-summary-card-v3" key={id} href={"/route?"+new URLSearchParams({date,timezone:timeZone,technician:id})}><strong>{current.technicians?.find(t=>t.id===id)?.display_name??t("Assigned technician")}</strong><span>{current.stops.filter(s=>s.technician_id===id).length} <T text="stops"/> →</span></Link>)}{businessError&&<p className="note"><T text="Contribution is unavailable. Your route is still accessible."/></p>}</details>
  </section>;
}
