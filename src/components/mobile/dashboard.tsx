'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {T,DateText,useLanguage} from '@/components/i18n';
import {WeekCalendar} from '@/components/route-calendar';
import {DeviceSyncSummary} from '@/components/device-sync-summary';
import {MobileHeader,ProgressDial} from './field-layout';
import type {RouteData} from '@/lib/field/types';

type Result={key:string;route?:RouteData;error?:string};
export function MobileDashboard({name,date:initialDate,timeZone,scope}:{name:string;date:string;timeZone:string;scope:{userId:string;organizationId:string}}){
 const {t}=useLanguage();
 const [date,setDate]=useState(initialDate),[result,setResult]=useState<Result|null>(null),[retry,setRetry]=useState(0);
 const {userId,organizationId}=scope;
 const key=JSON.stringify([userId,organizationId,date,timeZone,retry]);
 useEffect(()=>{
  const controller=new AbortController();
  let active=true;
  fetch('/api/route?'+new URLSearchParams({date,timezone:timeZone}),{cache:'no-store',signal:controller.signal})
   .then(async response=>{
    if(!response.ok)throw new Error();
    const data:RouteData=await response.json();
    // Never display a response for a different account, tenant, day or timezone.
    if(data.userId!==userId||data.orgId!==organizationId||data.date!==date||data.timeZone!==timeZone||!Array.isArray(data.stops))throw new Error();
    if(active)setResult({key,route:data});
   })
   .catch(()=>{if(active&&!controller.signal.aborted)setResult({key,error:'Your route is unavailable'});});
  return()=>{active=false;controller.abort();};
 },[key,date,timeZone,userId,organizationId]);
 const current=result?.key===key?result.route:undefined,error=result?.key===key?result.error:undefined;
 const technicians=current?[...new Set(current.stops.map(stop=>stop.technician_id))]:[];
 const routeHref='/route?'+new URLSearchParams({date,timezone:timeZone});
 return <section className="mobile-dashboard dashboard-focus">
  <MobileHeader title={<T text="Dashboard"/>} eyebrow={name} address={<DateText value={date} options={{weekday:'long',month:'long',day:'numeric',timeZone}}/>} action={<Link href="/customers/new" className="mobile-header-add" aria-label={t('Add Customer')}>+</Link>}/>
  <WeekCalendar date={date} timeZone={timeZone} onChange={setDate}/>
  <div className="dashboard-sync-lane"><DeviceSyncSummary compact scope={scope}/></div>
  <div className="technician-summary-list">
   {error&&<div role="alert"><p><T text={error}/></p><button className="btn btn-secondary" onClick={()=>setRetry(value=>value+1)}><T text="Try again"/></button></div>}
   {!current&&!error&&<p role="status"><T text="Loading your route…"/></p>}
   {current&&(!technicians.length?<p className="empty"><T text="No assigned stops for this date."/></p>:technicians.map(id=>{
    const stops=current.stops.filter(stop=>stop.technician_id===id),completed=stops.filter(stop=>stop.status==='completed').length;
    return <Link className="technician-summary-card" key={id} href={routeHref+'&'+new URLSearchParams({technician:id})}>
     <ProgressDial completed={completed} total={stops.length}/>
     <div><p className="mobile-card-kicker"><T text="Assigned technician"/></p><h2>{current.technicians?.find(technician=>technician.id===id)?.display_name??<T text="Assigned technician"/>}</h2><p>{stops.filter(stop=>!['completed','skipped'].includes(stop.status)).length} <T text="remaining"/> · {completed} <T text="completed · synced"/></p><span><T text="Open route"/> →</span></div>
    </Link>;
   }))}
  </div>
  <nav className="dashboard-mobile-links"><Link href={routeHref}><T text="Today’s Route"/></Link><Link href="/history"><T text="View History"/></Link></nav>
 </section>;
}
