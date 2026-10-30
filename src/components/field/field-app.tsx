'use client';

import {RouteDateNavigation} from '@/components/route-date-navigation';
import {serviceDay} from '@/lib/service-time';
import {canonicalDose,displayDose,effectiveUnits,gallonsToLiters,celsiusToFahrenheit,fahrenheitToCelsius,type UnitSystem} from '@/lib/units';
import {outsideRange} from '@/lib/chemistry-table';
import {NumberText,DateText,T,useLanguage,LocaleInput,LocaleSelect,LocaleTextarea} from '@/components/i18n';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import {WeekCalendar,Arrival} from '@/components/route-calendar';
import {ISSUE_FLAGS,ISSUE_LABELS} from '@/lib/field/issues';
import {SyncProgress} from './sync-progress';
const RoutePlanner=dynamic(()=>import('@/components/route-planner').then(m=>m.RoutePlanner),{ssr:false});
import Link from 'next/link';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CompletionPayload, Dosage, PoolConfig, PoolVisit, ReadingKey, RouteData, RouteStop } from '@/lib/field/types';
import { READING_LABELS } from '@/lib/field/types';
import { compressPhoto } from '@/lib/field/photos';
import { cacheRoute, enqueueCompletion, getActiveScope, getCachedRoute, getDraft, getDeviceEpoch, getQueue, listPhotos, removePhoto, releaseRejectedCompletion, saveDraft, savePhoto, syncQueue, type LocalPhoto, type OfflineScope, type QueueItem } from '@/lib/offline/store';
import { reconcileDraft } from './draft';
import './field.css';
import {ChemistryHistory} from './chemistry-history';

async function request<T>(url:string, init?:RequestInit):Promise<T> {
  const response=await fetch(url,{...init,cache:'no-store',headers:{...(init?.body instanceof FormData?{}:{'Content-Type':'application/json'}),...init?.headers}});
  if(response.status===401) throw new Error('Please sign in again before syncing.');
  const data=await response.json();
  if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'The request could not be saved.');
  return data as T;
}
const messageOf=(error:unknown)=>error instanceof Error?error.message:'Something went wrong. Your saved draft stays on this device.';
const statusLabel:Record<string,string>={pending:'Pending',in_progress:'In progress',completed:'Synced',skipped:'Skipped',queued:'Pending Sync',failed:'Failed'};
function scopeOf(route:RouteData):OfflineScope{return {userId:route.userId,organizationId:route.orgId};}

const subscribePath=()=>()=>{};
export function FieldApp({initialStopId,initialDate,initialTimeZone="America/New_York",initialTechnician,initialRoute,offline=false,expectedScope,expectedRole,daily=false}:{initialStopId?:string;initialDate?:string;initialTimeZone?:string;initialTechnician?:string;initialRoute?:RouteData;offline?:boolean;expectedScope?:OfflineScope;expectedRole?:string;daily?:boolean}) {
  const {t}=useLanguage();
  const [highlightedStop,setHighlightedStop]=useState<string|null>(null);
  const [stopFilter,setStopFilter]=useState('remaining');
  const latestRequest=useRef(0);
  const routeAbort=useRef<AbortController|null>(null);
  const dailyPath=useSyncExternalStore(subscribePath,()=>window.location.pathname==='/stops'||new URLSearchParams(window.location.search).get('view')==='stops',()=>false);
  const requestedDaily=daily||(offline&&dailyPath);
  const [timeZone,setTimeZone]=useState(initialRoute?.timeZone??initialTimeZone);
  const [date,setDateState]=useState(initialDate??initialRoute?.date??serviceDay(new Date(),initialTimeZone));
  const selectedDay=useRef(date);
  const setDate=useCallback((day:string)=>{selectedDay.current=day;routeAbort.current?.abort();setDateState(day);},[]);
  const [route,setRoute]=useState<RouteData|null>(initialRoute??null);
  const isDaily=requestedDaily||route?.role==='technician';
  const [scope,setScope]=useState<OfflineScope|null>(expectedScope??(initialRoute?scopeOf(initialRoute):null));
  const [activeStopId,setActiveStopId]=useState<string|null>(initialStopId??null);
  const [queue,setQueue]=useState<QueueItem[]>([]);
  const [online,setOnline]=useState(!offline);
  const [loading,setLoading]=useState(!initialRoute);
  const [syncing,setSyncing]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [cached,setCached]=useState(false);
  const [technician,setTechnician]=useState<string|null>(initialTechnician??null);
  const offlineBootstrapped=useRef(false);

  const refreshQueue=useCallback(async(currentScope:OfflineScope)=>{
    const items=await getQueue(currentScope);setQueue(items);return items;
  },[]);
  const loadRoute=useCallback(async(day:string,currentScope?:OfflineScope|null)=>{
    if(day!==selectedDay.current)return null;
    const version=++latestRequest.current;
    routeAbort.current?.abort();
    const controller=new AbortController();routeAbort.current=controller;
    try {
      const epoch=await getDeviceEpoch();
      const data=await request<RouteData>('/api/route?date='+encodeURIComponent(day)+'&timezone='+encodeURIComponent(timeZone),{signal:controller.signal});
      if(version!==latestRequest.current||controller.signal.aborted||day!==selectedDay.current)return null;
      const identity=scopeOf(data);
      if((expectedScope&&(identity.userId!==expectedScope.userId||identity.organizationId!==expectedScope.organizationId))||(expectedRole&&data.role!==expectedRole))throw new Error('The signed-in account changed. Reload this page before continuing.');
      await cacheRoute(identity,data,epoch);
      if(version!==latestRequest.current||controller.signal.aborted||day!==selectedDay.current)return null;
      setScope(identity);setRoute(data);setCached(false);setError('');
      await refreshQueue(identity);
      return data;
    } catch(cause) {
      if(version!==latestRequest.current||controller.signal.aborted||day!==selectedDay.current)return null;
      if(cause instanceof Error&&cause.message.startsWith('The signed-in account changed')){setRoute(null);setError(cause.message);return null;}
      const identity=expectedScope??currentScope??await getActiveScope();
      const saved=identity?await getCachedRoute(identity,day,timeZone):null;
      if(version!==latestRequest.current||controller.signal.aborted||day!==selectedDay.current)return null;
      if(saved&&identity&&(!expectedRole||saved.role===expectedRole)){setScope(identity);setRoute(saved);setCached(true);await refreshQueue(identity);}
      else setRoute(null);
      setError(messageOf(cause));return null;
    } finally {if(version===latestRequest.current)setLoading(false);}
  },[refreshQueue,expectedScope,expectedRole,timeZone]);

  const flush=useCallback(async(currentScope:OfflineScope,manual=false)=>{
    const pending=await getQueue(currentScope);
    if(!pending.length)return;
    setSyncing(true);
    try {
      const result=await syncQueue(currentScope,{automatic:!manual});
      await refreshQueue(currentScope);
      if(result.authRequired)setError('Sign in again to sync this device. Your queued visits are still saved.');
      else if(result.pending)setNotice(`${result.pending} visit${result.pending===1?' is':'s are'} still saved on this device and waiting to sync.`);
      else if(result.synced)setNotice(`${result.synced} visit${result.synced===1?'':'s'} synced. Email delivery is tracked separately in History.`);
      if(result.synced){const saved=await getCachedRoute(currentScope,date,timeZone);if(selectedDay.current===date)setRoute(current=>current&&current.userId===currentScope.userId&&current.orgId===currentScope.organizationId&&current.date===date?{...current,stops:current.stops.map(stop=>saved?.stops.some(s=>s.id===stop.id&&s.status==='completed')?{...stop,status:'completed'}:stop)}:current);}
    } catch(cause){setError(messageOf(cause));}
    finally {setSyncing(false);}
  },[date,refreshQueue,timeZone]);

  useEffect(()=>{
    let cancelled=false;
    async function init(){
      const connection=navigator.onLine;setOnline(connection);
      const identity=expectedScope??(initialRoute?scopeOf(initialRoute):await getActiveScope());
      if(cancelled)return;
      if(offline&&!initialDate&&!offlineBootstrapped.current&&identity){
        const latest=await getCachedRoute(identity);
        if(cancelled)return;
        offlineBootstrapped.current=true;if(latest?.timeZone&&latest.timeZone!==timeZone){setTimeZone(latest.timeZone);setDate(latest.date);return;}
        const queryDate=new URLSearchParams(window.location.search).get('date');
        const selected=queryDate&&/^\d{4}-\d{2}-\d{2}$/.test(queryDate)?queryDate:window.location.pathname==='/stops'?serviceDay(new Date(),latest?.timeZone??timeZone):latest?.date;
        const pathStop=window.location.pathname.match(/^\/visit\/([a-f0-9-]+)$/i)?.[1];
        if(pathStop)setActiveStopId(pathStop);
        if(selected&&selected!==date){setDate(selected);return;}
      }
      if(identity){const saved=await getCachedRoute(identity,date,timeZone);if(cancelled)return;if(saved&&selectedDay.current===date&&(!expectedRole||saved.role===expectedRole)){setScope(identity);setRoute(saved);setCached(true);setLoading(false);await refreshQueue(identity);}}
      if(!cancelled)await loadRoute(date,identity);
    }
    void init();
    return()=>{cancelled=true;routeAbort.current?.abort();};
  },[date,initialRoute,loadRoute,expectedScope,expectedRole,offline,initialDate,setDate,refreshQueue,timeZone]);

  useEffect(()=>{
    const update=()=>setOnline(navigator.onLine);
    window.addEventListener('online',update);window.addEventListener('offline',update);
    return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
  },[]);
  useEffect(()=>{
    const timer=online&&scope?window.setTimeout(()=>void flush(scope),0):undefined;
    const interval=online&&scope?window.setInterval(()=>void flush(scope),15000):undefined;
    return()=>{if(timer!==undefined)window.clearTimeout(timer);if(interval!==undefined)window.clearInterval(interval);};
    // Flushing is tied to reconnection/identity, not to every queue state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[online,scope?.userId,scope?.organizationId]);

  function openStop(id:string|null){
    setActiveStopId(id);setError('');
    const path=id?`/visit/${id}?date=${date}&timezone=${encodeURIComponent(timeZone)}${isDaily?'&view=stops':''}`:`${isDaily?'/stops':'/route'}?date=${date}&timezone=${encodeURIComponent(timeZone)}`;
    if(!offline)window.history.replaceState(null,'',path);
    window.scrollTo({top:0,behavior:'instant'});
  }
  async function mutateStop(body:Record<string,unknown>){
    if(!online){setError('Reconnect to change the server route. You can still complete cached stops offline.');return;}
    setError('');
    try{await request('/api/stops',{method:'POST',body:JSON.stringify(body)});await loadRoute(date,scope);}
    catch(cause){setError(messageOf(cause));}
  }
  function startStop(stop:RouteStop){
    openStop(stop.id);
    if(online&&scope&&stop.status==='pending')void request('/api/stops',{method:'POST',headers:{'X-ALYS-User-ID':scope.userId,'X-ALYS-Organization-ID':scope.organizationId},body:JSON.stringify({action:'start',stop_id:stop.id})}).then(()=>setRoute(current=>current&&current.userId===scope.userId&&current.orgId===scope.organizationId?{...current,stops:current.stops.map(s=>s.id===stop.id&&s.status==='pending'?{...s,status:'in_progress'}:s)}:current)).catch(async()=>{try{const pending=await getQueue(scope);const saved=await getCachedRoute(scope,date,timeZone);if(pending.some(q=>q.payload.stop_id===stop.id)||saved?.stops.some(s=>s.id===stop.id&&s.status==='completed'))return;}catch{/* Keep the start failure visible if device storage is unavailable. */}setError('Service start could not be confirmed. Your local work is preserved.');});
  }
  function reorder(stop:RouteStop,direction:-1|1){
    if(!route)return;
    const siblings=route.stops.filter(s=>s.technician_id===stop.technician_id).sort((a,b)=>a.position-b.position);
    const index=siblings.findIndex(s=>s.id===stop.id),next=index+direction;
    if(next<0||next>=siblings.length)return;
    [siblings[index],siblings[next]]=[siblings[next],siblings[index]];
    void mutateStop({action:'reorder',stop_ids:siblings.map(s=>s.id)});
  }
  function dropStop(event:React.DragEvent,target:RouteStop){
    event.preventDefault();if(!route)return;const sourceId=event.dataTransfer.getData('text/plain');
    const siblings=route.stops.filter(s=>s.technician_id===target.technician_id);const from=siblings.findIndex(s=>s.id===sourceId),to=siblings.findIndex(s=>s.id===target.id);
    if(from<0||to<0||from===to)return;const [moved]=siblings.splice(from,1);siblings.splice(to,0,moved);void mutateStop({action:'reorder',stop_ids:siblings.map(s=>s.id)});
  }
  const queuedIds=new Set(queue.map(item=>item.payload.stop_id));
  const selectedTechnician=technician??route?.userId;
  const displayStops=route?.stops.filter(s=>selectedTechnician==='all'||s.technician_id===selectedTechnician)??[];
  const stop=route?.stops.find(s=>s.id===activeStopId);
  const serviceStops=stop?route!.stops.filter(s=>s.technician_id===stop.technician_id):displayStops;
  const current=displayStops.find(s=>!queuedIds.has(s.id)&&!['completed','skipped'].includes(s.status));
  const completeCount=displayStops.filter(s=>s.status==='completed').length;
  const remaining=displayStops.filter(s=>!['completed','skipped'].includes(s.status)&&!queuedIds.has(s.id)).length;
  const selectedQueuedCount=displayStops.filter(s=>queuedIds.has(s.id)).length;

  async function completed(payload:CompletionPayload){
    if(!scope||!route)return;
    const completion={...payload,completed_at:payload.completed_at??new Date().toISOString()};
    await enqueueCompletion(scope,completion);
    await refreshQueue(scope);
    setNotice('Visit saved on this device. Waiting for a confirmed sync.');
    const completedStop=route.stops.find(s=>s.id===payload.stop_id);
    const ids=new Set([...queuedIds,payload.stop_id]);
    const candidates=route.stops.filter(s=>s.technician_id===completedStop?.technician_id&&!ids.has(s.id)&&!['completed','skipped'].includes(s.status));
    const next=candidates.find(s=>s.position>(completedStop?.position??0))??candidates[0];
    openStop(next?.id??null);
    if(online)void flush(scope);
  }

  return <div className={`field-app ${isDaily?'daily-mode':''}`}>
    <div className="field-row-between"><span className="field-kicker"><T text="FAST ROUTE"/></span><span className="field-tiny"><span className={`field-network-dot ${online?'':'field-network-dot-offline'}`}/> {online?<T text={"Online"}/>:<T text={"Offline"}/>}{syncing?<T text={" · Syncing…"}/>:''}</span></div>
    {scope&&<SyncProgress scope={scope} name={id=>route?.stops.find(s=>s.id===id)?.property.name??'Visit'}/>}
    {notice&&<div className="field-alert" role="status"><T text={notice}/><button className="field-button field-button-quiet field-button-small" onClick={()=>setNotice('')} aria-label={t("Dismiss notification")}>×</button></div>}
    {error&&<div className="field-alert field-alert-warning" role="alert"><T text={error}/>{error.toLowerCase().includes('sign in')&&<Link className="field-auth-link" href="/login"><T text="Sign in"/></Link>}</div>}
    {cached&&<p className="field-alert field-alert-warning"><T text="Cached route. Changes and photos stay on this device until a signed-in connection confirms synchronization."/></p>}
    {queue.length>0&&<div className="field-alert field-alert-warning"><div className="field-grow"><strong>{queue.length} <T text="visit"/>{queue.length===1?'':<T text={'s'}/>} <T text="waiting to sync"/></strong><ul className="field-queue-list">{queue.map(item=><li key={item.id}><strong><T text={item.status==='pending'?'Pending Sync':item.status==='auth_required'?'Sign in to sync':'Failed'}/></strong> · {route?.stops.find(s=>s.id===item.payload.stop_id)?.property.name||'Visit'}{item.error?<>: <T text={item.error}/></>:<T text={": stored on this device"}/>}{item.http_status===422&&scope&&<button className="field-button field-button-secondary field-button-small" onClick={()=>{void releaseRejectedCompletion(scope,item.payload.stop_id).then(async()=>{await refreshQueue(scope);await loadRoute(date,scope);openStop(item.payload.stop_id);}).catch(cause=>setError(messageOf(cause)));}}><T text="Edit rejected visit"/></button>}</li>)}</ul></div><button className="field-button field-button-secondary field-button-small" disabled={!online||syncing||!scope} onClick={()=>scope&&void flush(scope,true)}><T text="Retry sync"/></button></div>}
    {loading&&!route?<><h1 className="field-heading"><T text="Loading your route…"/></h1><div className="field-skeleton"/><div className="field-skeleton"/></>:null}
    {!loading&&!route?<div className="field-empty"><h1 className="field-heading"><T text="Your route is unavailable"/></h1><p><T text="Connect and sign in to save today’s route for field use."/></p><Link className="field-button" href="/login"><T text="Sign in"/></Link><button className="field-button field-button-secondary" onClick={()=>void loadRoute(date,scope)}><T text="Try again"/></button></div>:null}
    {route&&scope&&(stop?<VisitEditor unitSystem={route?.unitSystem} key={stop.id} stop={stop} index={serviceStops.indexOf(stop)+1} total={serviceStops.length} scope={scope} queued={queuedIds.has(stop.id)} onBack={()=>openStop(null)} onComplete={completed}/>:<>
      {activeStopId&&!stop&&<p className="field-alert field-alert-warning"><T text="This stop is not in the selected route or is no longer assigned to you."/></p>}
      <RouteDateNavigation date={date} timeZone={timeZone} onChange={day=>{setDate(day);setActiveStopId(null);setLoading(true);setRoute(null);if(!offline)window.history.replaceState(null,'',`${isDaily?'/stops':'/route'}?date=${day}&timezone=${encodeURIComponent(timeZone)}`);}}/>
      <header className="field-top"><div><h1 className="field-heading"><T text={isDaily?(date===serviceDay(new Date(),timeZone)?"Today’s Stops":"Assigned Stops"):"Today’s Route"}/></h1><p className="field-subtitle"><span className="route-heading-date"><DateText value={date} options={{weekday:'long',month:'short',day:'numeric',timeZone}}/> · </span>{displayStops.length} <T text="stop"/>{displayStops.length===1?'':<T text={'s'}/>}</p></div></header>
      <details className="route-timezone-control"><summary><T text="Route timezone"/><span>{timeZone.split("/").at(-1)?.replaceAll("_"," ")}</span></summary><label className="field-input-label"><T text="Route timezone"/><select value={timeZone} onChange={e=>{const zone=e.target.value,day=serviceDay(new Date(),zone);setTimeZone(zone);setDate(day);if(!offline)window.history.replaceState(null,"",`${isDaily?"/stops":"/route"}?date=${day}&timezone=${encodeURIComponent(zone)}`);}}>{[...new Set([timeZone,'America/New_York','America/Sao_Paulo'])].map(tz=><option key={tz} value={tz}>{tz}</option>)}</select></label></details><div className="field-row">{route.role!=='technician'&&<label className="field-input-label field-grow"><T text="Route for"/><LocaleSelect value={selectedTechnician??route.userId} onChange={event=>setTechnician(event.target.value)}><option value="all"><T text="All technicians"/></option>{route.technicians?.map(person=><option key={person.id} value={person.id}>{person.display_name}{person.id===route.userId?<T text={" (my route)"}/>:''}</option>)}</LocaleSelect></label>}</div>
      {!isDaily&&<WeekCalendar timeZone={timeZone} date={date} onChange={day=>{setDate(day);setActiveStopId(null);}}/>}<div className="field-progress" role="progressbar" aria-label={t("Completed visits")} aria-valuemin={0} aria-valuemax={displayStops.length||1} aria-valuenow={completeCount}><span style={{width:`${displayStops.length?completeCount/displayStops.length*100:0}%`}}/></div><div className="field-progress-copy"><strong>{completeCount} / {displayStops.length} <T text="completed · synced"/></strong><span>{remaining} <T text="remaining"/>{selectedQueuedCount?<T text={` · ${selectedQueuedCount} on device`}/>:null}</span></div>
      {isDaily&&<><div className="field-tabs" role="group" aria-label={t("Stop status")}>{['remaining','completed','all'].map(value=><button key={value} className={`field-button ${stopFilter===value?'':'field-button-secondary'}`} aria-pressed={stopFilter===value} onClick={()=>setStopFilter(value)}><T text={value==='remaining'?'Remaining':value==='completed'?'Completed':'All stops'}/></button>)}</div>{route.role!=='technician'&&<Link className="field-back" href="/route"><T text="Open weekly planner"/></Link>}</>}
      <div className={isDaily?'daily-stops':'route-workspace'}><div>{!displayStops.length?<div className="field-empty"><h2><T text={route.role==='technician'?'No assigned stops for this date.':'A clear route, ready to plan.'}/></h2><p><T text={route.role==='technician'?'Contact your owner to assign service stops.':'Add a stop below, or configure recurring service days in Clients.'}/></p></div>:<ol className="field-route-list">{displayStops.filter(item=>!isDaily||stopFilter==='all'||(stopFilter==='completed'?item.status==='completed'||queuedIds.has(item.id):!['completed','skipped'].includes(item.status)&&!queuedIds.has(item.id))).map((item,index)=>{
        const queued=queuedIds.has(item.id),status=queued?(queue.find(q=>q.payload.stop_id===item.id)?.status==='pending'?'queued':'failed'):item.status;
        const siblings=route.stops.filter(s=>s.technician_id===item.technician_id),siblingIndex=siblings.findIndex(s=>s.id===item.id);
        return <li className={`field-stop ${item.id===current?.id?'field-stop-current':''} ${item.id===highlightedStop?'field-stop-selected':''}`} key={item.id} draggable={online&&!queued} onDragStart={event=>event.dataTransfer.setData('text/plain',item.id)} onDragOver={event=>event.preventDefault()} onDrop={event=>dropStop(event,item)}><div className="field-stop-header"><span className="field-stop-number">{index+1}</span><div className="field-stop-copy"><h2 className="field-stop-title"><button className="route-stop-select" onClick={()=>setHighlightedStop(item.id)}>{item.property.name||item.customer.name}</button></h2><p className="field-stop-address">{item.property.address}</p><p className="field-tiny"><T text={item.service_type??'Pool maintenance'}/></p>{route.route_plans?.[item.technician_id]?.calculation&&<Arrival plan={route.route_plans[item.technician_id].calculation!} stopId={item.id}/>}{route.role!=='technician'&&route.technicians&&<p className="field-tiny">{route.technicians.find(t=>t.id===item.technician_id)?.display_name??'Assigned technician'}</p>}</div><span className={`field-badge field-badge-${status}`}><T text={statusLabel[status]}/></span></div><div className="field-stop-actions">{!['completed','skipped'].includes(item.status)?<button className="field-button field-grow" onClick={()=>startStop(item)}>{queued?<T text={"Review saved visit"}/>:item.status==='in_progress'?<T text={"Continue service →"}/>:<T text={"Start service →"}/>}</button>:item.status==='skipped'?<button className="field-button field-button-secondary field-grow" disabled={!online} onClick={()=>void mutateStop({action:'restore',stop_id:item.id})}><T text="Restore stop"/></button>:<Link className="field-button field-button-secondary field-grow" href="/history"><T text="View history"/></Link>}<a className="field-button field-button-secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.property.location_confirmed&&item.property.latitude!=null&&item.property.longitude!=null?`${item.property.latitude},${item.property.longitude}`:item.property.address)}`} target="_blank" rel="noopener noreferrer" aria-label={t(`Navigate to ${item.property.name||item.customer.name}`)}><T text="Navigate ↗"/></a><a className="field-button field-button-quiet field-button-small" href={`https://maps.apple.com/?daddr=${encodeURIComponent(item.property.location_confirmed&&item.property.latitude!=null&&item.property.longitude!=null?`${item.property.latitude},${item.property.longitude}`:item.property.address)}`} target="_blank" rel="noopener noreferrer"><T text="Apple Maps"/></a>{!['completed','skipped'].includes(item.status)&&!queued&&<button className="field-button field-button-quiet field-button-small" disabled={!online} onClick={()=>void mutateStop({action:'skip',stop_id:item.id})}><T text="Skip stop"/></button>}{route.role==='owner'&&!isDaily&&!queued&&item.status==='pending'&&<label className="field-tiny"><T text="Reassign this stop"/><select aria-label={'Reassign '+(item.property.name||item.customer.name)} value={item.technician_id} disabled={!online} onChange={e=>void mutateStop({action:'reassign',stop_id:item.id,technician_id:e.target.value})}>{route.technicians?.map(t=><option key={t.id} value={t.id}>{t.display_name}</option>)}</select></label>}<div className="field-order"><button aria-label={t(`Move ${item.property.name||item.customer.name} up`)} disabled={!online||siblingIndex===0} onClick={()=>reorder(item,-1)}>↑</button><button aria-label={t(`Move ${item.property.name||item.customer.name} down`)} disabled={!online||siblingIndex===siblings.length-1} onClick={()=>reorder(item,1)}>↓</button></div></div></li>;
      })}</ol>}
      {isDaily&&stopFilter==='remaining'&&remaining===0&&<p className="field-empty"><T text="No remaining stops. Check Completed or All stops."/></p>}
      {!isDaily&&route.role!=='technician'&&route.properties&&<AddStop key={selectedTechnician} route={route} technicianId={selectedTechnician==='all'?route.userId:selectedTechnician} online={online} onAdd={mutateStop}/>}</div>{!isDaily&&online&&<RoutePlanner key={`${date}:${selectedTechnician}`} route={route} stops={displayStops} selected={highlightedStop} onHighlight={setHighlightedStop} technicianId={selectedTechnician??route.userId} onSelect={startStop} onRefresh={()=>loadRoute(date,scope)}/>}</div>
    </>)}
  </div>;
}

function AddStop({route,technicianId,online,onAdd}:{route:RouteData;technicianId?:string;online:boolean;onAdd:(body:Record<string,unknown>)=>Promise<void>}) {
  const [busy,setBusy]=useState(false);
  return <details className="field-add-stop"><summary><T text="＋ Add a stop to this day"/></summary><form className="field-add-form" onSubmit={async event=>{event.preventDefault();setBusy(true);const form=new FormData(event.currentTarget);await onAdd({action:'add',property_id:form.get('property_id'),technician_id:form.get('technician_id'),date:route.date});setBusy(false);}}><label className="field-input-label"><T text="Property"/><LocaleSelect name="property_id" required>{route.properties?.map(property=><option value={property.id} key={property.id}>{property.name||property.address}</option>)}</LocaleSelect></label><label className="field-input-label"><T text="Technician"/><LocaleSelect name="technician_id" defaultValue={technicianId} required>{route.technicians?.map(technician=><option value={technician.id} key={technician.id}>{technician.display_name}</option>)}</LocaleSelect></label><button className="field-button" disabled={!online||busy||!route.properties?.length||!route.technicians?.length}>{busy?<T text={"Adding…"}/>:<T text={"Add stop"}/>}</button></form></details>;
}

const LIMITS:Record<ReadingKey,number>={fc:30,ph:14,ta:500,cya:1000,ch:5000,salt:10000,cc:30,tc:30,temperature_f:140};
const PRODUCT_UNITS:Record<string,string[]>={'Liquid Chlorine':['gal','fl oz'],'Muriatic Acid':['fl oz'],'Sodium Bicarbonate':['lb'],'Calcium Chloride':['lb'],'Stabilizer':['lb'],'Salt':['lb'],'Chlorine Tablets':['units'],'Shock':['lb'],'Other':['custom']};
const PRESETS:Record<string,number[]>={'gal':[0.25,0.5,1],'fl oz':[8,16,32],lb:[1,2,4],units:[1,2,3],custom:[1,2,3],L:[0.5,1,2],mL:[250,500,1000],kg:[0.5,1,2]};

function blankDraft(stop:RouteStop):CompletionPayload {return {id:crypto.randomUUID(),stop_id:stop.id,started_at:new Date().toISOString(),pools:stop.pools.map(pool=>({pool_id:pool.id,tasks:[],readings:{},dosages:[]})),notes:'',photo_paths:[]};}
function validateDraft(draft:CompletionPayload,stop:RouteStop,photos:LocalPhoto[]):string|null {
  if(!stop.pools.length)return 'No active pool is configured for this property. Add a pool before completing this stop.';
  for(const config of stop.pools){
    const pool=draft.pools.find(p=>p.pool_id===config.id);
    if(!pool)return `${config.name}: pool details are missing.`;
    for(const key of config.required_readings)if(pool.readings[key]===undefined)return `${config.name}: ${READING_LABELS[key]} is required.`;
    for(const [key,value] of Object.entries(pool.readings))if(!Number.isFinite(value)||value<0||value>LIMITS[key as ReadingKey])return `${config.name}: check ${READING_LABELS[key as ReadingKey]}.`;
    for(const dose of pool.dosages)if(!dose.product.trim()||!dose.unit.trim()||!Number.isFinite(dose.quantity)||dose.quantity<=0||dose.quantity>10000||dose.unit.length>20)return `${config.name}: enter a positive amount for every chemical, or remove unused products.`;
    if(config.photo_required&&config.photo_scope_required&&!photos.some(p=>p.pool_id===config.id))return `${config.name}: take a photo assigned to this pool.`;
    if(config.photo_required&&!photos.length)return `${config.name}: one service photo is required.`;
  }
  return null;
}
function PhotoPreview({photo,onRemove,readonly=false}:{photo:LocalPhoto;onRemove:()=>void;readonly?:boolean}) {
  const {t}=useLanguage();
  const url=useMemo(()=>URL.createObjectURL(photo.blob),[photo.blob]);
  useEffect(()=>()=>URL.revokeObjectURL(url),[url]);
  return <figure className="field-photo"><Image src={url} alt={t("Captured service photo")} width={320} height={240} unoptimized/>{!readonly&&<button type="button" className="field-button field-button-quiet field-button-small" onClick={onRemove}><T text="Remove / retake"/></button>}</figure>;
}

function VisitEditor({stop,index,total,scope,queued,onBack,onComplete,unitSystem='imperial'}:{unitSystem?:UnitSystem;stop:RouteStop;index:number;total:number;scope:OfflineScope;queued:boolean;onBack:()=>void;onComplete:(payload:CompletionPayload)=>Promise<void>}) {
  const {t}=useLanguage();
  const [draft,setDraft]=useState<CompletionPayload|null>(null);
  const [photos,setPhotos]=useState<LocalPhoto[]>([]);
  const [photoPool,setPhotoPool]=useState(stop.pools[0]?.id??'');
  const [busy,setBusy]=useState(false);
  const [photoBusy,setPhotoBusy]=useState(false);
  const [error,setError]=useState('');
  const [saveStatus,setSaveStatus]=useState('Loading draft…');
  const initialize=useEffectEvent(async(isCancelled:()=>boolean)=>{
    const identity=scope,currentStop=stop;
    try{
      const saved=await getDraft(identity,currentStop.id),images=await listPhotos(identity,currentStop.id);
      if(isCancelled())return;
      const value=reconcileDraft(saved??blankDraft(currentStop),currentStop.pools);
      setDraft(value);setPhotos(images);
      if(!saved||value!==saved)await saveDraft(identity,value);
      setSaveStatus('Draft saved on this device');
    }catch(cause){if(!isCancelled())setError(messageOf(cause));}
  });
  useEffect(()=>{
    let cancelled=false;
    const timer=window.setTimeout(()=>void initialize(()=>cancelled),0);
    return()=>{cancelled=true;window.clearTimeout(timer);};
  },[scope.userId,scope.organizationId,stop.id]);
  const visibleDraft=draft?reconcileDraft(draft,stop.pools):null;
  const retiredPools=visibleDraft?.pools.filter(record=>!stop.pools.some(pool=>pool.id===record.pool_id))??[];
  function update(next:CompletionPayload){
    setDraft(next);setSaveStatus('Saving draft…');
    void saveDraft(scope,next).then(()=>setSaveStatus('Draft saved on this device')).catch(cause=>{setSaveStatus('Draft could not be saved');setError(messageOf(cause));});
  }
  function updatePool(poolId:string,pool:PoolVisit){if(visibleDraft)update({...visibleDraft,pools:visibleDraft.pools.map(p=>p.pool_id===poolId?pool:p)});}
  async function capture(file:File){
    if(photos.length>=3){setError('A visit can have up to three photos.');return;}
    setPhotoBusy(true);setError('');
    try{
      const compressed=await compressPhoto(file);
      const photo=await savePhoto(scope,stop.id,compressed,photoPool);
      setPhotos(previous=>[...previous,photo]);
    }catch(cause){setError(messageOf(cause));}
    finally{setPhotoBusy(false);}
  }
  async function complete(){
    if(!visibleDraft)return;
    if(retiredPools.length){setError('This draft contains a pool that is no longer active at this property. Ask an administrator to restore the pool or review its saved work before completing. No measurements have been discarded.');return;}
    const invalid=validateDraft(visibleDraft,stop,photos);
    if(invalid){setError(invalid);return;}
    setBusy(true);setError('');
    try{await saveDraft(scope,visibleDraft);await onComplete(visibleDraft);}
    catch(cause){setError(messageOf(cause));setBusy(false);}
  }
  return <div className="field-service"><button className="field-back" onClick={onBack}><T text="← Back to route"/></button><header className="field-top field-service-header"><div><h1 className="field-heading">{stop.property.name||stop.customer.name}</h1><p className="field-subtitle"><T text="Stop "/>{index} / {total} · {stop.property.address}</p></div><span className="field-badge field-badge-in_progress"><T text="Fast Technician Mode"/></span></header>{stop.property.gate_notes&&<p className="field-access"><strong><T text="Internal access notes:"/></strong> {stop.property.gate_notes}</p>}{error&&<p className="field-alert field-alert-error" role="alert"><T text={error}/></p>}{queued&&<p className="field-alert field-alert-warning"><T text="This visit is queued. Retry sync from the route to preserve the saved submission."/></p>}{retiredPools.length>0&&<p className="field-alert field-alert-error" role="alert"><T text="Pool setup changed. This draft retains work for "/>{retiredPools.length} <T text="pool"/>{retiredPools.length===1?'':<T text={'s'}/>} <T text="no longer active at this property. Ask an administrator to restore or review the pool before completing; saved measurements are preserved."/></p>}{!visibleDraft?<div className="field-skeleton"/>:<>
    {stop.pools.map(config=>{const pool=visibleDraft.pools.find(p=>p.pool_id===config.id);return pool?<PoolForm unitSystem={effectiveUnits(stop.property.unit_system,unitSystem)} timeZone={stop.property.service_timezone} key={config.id} config={config} value={pool} history={stop.chemistry_history?.[config.id]??[]} previous={stop.last_readings?.[config.id]} disabled={queued||busy} onChange={next=>updatePool(config.id,next)}/>:null;})}
    <section className="field-section" aria-label={t("Service issues")}><h2><T text="Issue flags"/></h2><div className="field-issue-flags">{ISSUE_FLAGS.map(flag=><button key={flag} type="button" className="field-shortcut" aria-pressed={visibleDraft.issue_flags?.includes(flag)??false} disabled={busy||queued} onClick={()=>update({...visibleDraft,issue_flags:visibleDraft.issue_flags?.includes(flag)?visibleDraft.issue_flags.filter(f=>f!==flag):[...(visibleDraft.issue_flags??[]),flag]})}><T text={ISSUE_LABELS[flag]}/></button>)}</div><p className="field-tiny"><T text="Flags describe issues; they do not complete checklist tasks or waive required readings and photos."/></p></section>
    <section className="field-section"><p className="field-section-letter"><T text="D · SERVICE PHOTO"/></p><div className="field-section-title"><h2><T text="Show the finished service"/></h2><span className="field-tiny">{photos.length} / 3</span></div>{stop.pools.length>1&&<label className="field-input-label"><T text="Photo for pool / spa"/><select value={photoPool} disabled={photoBusy||queued} onChange={e=>setPhotoPool(e.target.value)}>{stop.pools.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}{photos.length<3&&!queued&&<label className="field-photo-control">{photoBusy?<T text={"Preparing photo…"}/>:<T text={"▧ TAKE PHOTO"}/>}<small>{stop.pools.some(p=>p.photo_required)?<T text={"At least one photo is required"}/>:<T text={"Optional · up to three photos"}/>}</small><LocaleInput type="file" accept="image/*" capture="environment" disabled={photoBusy||busy} onChange={event=>{const file=event.target.files?.[0];if(file)void capture(file);event.currentTarget.value='';}}/></label>}<div className="field-photos">{photos.map(photo=><PhotoPreview key={photo.id} photo={photo} readonly={queued} onRemove={()=>{if(queued)return;void removePhoto(scope,photo.id).then(()=>setPhotos(items=>items.filter(item=>item.id!==photo.id))).catch(cause=>setError(messageOf(cause)));}}/>)}</div><p className="field-tiny"><T text="Photo saved on device. Upload starts after Complete & Next; you can continue to the next stop."/></p></section>
    <section className="field-section"><label className="field-input-label"><T text="Service note "/><span className="field-reference"><T text="Included in the customer report. Do not add gate codes or private notes."/></span><LocaleTextarea maxLength={2000} value={visibleDraft.notes} disabled={queued||busy} placeholder="Optional service information for the customer" onChange={event=>update({...visibleDraft,notes:event.target.value})}/></label></section>
    <details className="field-section"><summary><T text="Internal service details"/></summary><p className="field-tiny"><T text="For staff only. These details are not included in customer emails."/></p>{([['technician_notes','Technician notes'],['equipment_problems','Equipment problems'],['filter_cleaning','Filter cleaning'],['repairs_performed','Repairs performed']] as const).map(([key,label])=><label className="field-input-label" key={key}><T text={label}/><LocaleTextarea value={visibleDraft.service_details?.[key]??''} disabled={queued||busy} maxLength={2000} onChange={e=>update({...visibleDraft,service_details:{technician_notes:'',equipment_problems:'',filter_cleaning:'',repairs_performed:'',...visibleDraft.service_details,[key]:e.target.value}})}/></label>)}</details>
    <div className="field-complete-bar"><button className="field-button" disabled={busy||photoBusy||queued||retiredPools.length>0} onClick={()=>void complete()}>{queued?<T text={"Saved on device — waiting to sync"}/>:busy?<T text={"Saving visit…"}/>:<T text={"COMPLETE & NEXT →"}/>}</button><p role="status"><T text={saveStatus}/> <T text="· Only checked tasks and recorded values enter the report."/></p></div>
    </>}
  </div>;
}

function PoolForm({config,value,previous,history,disabled,onChange,unitSystem='imperial',timeZone='America/New_York'}:{unitSystem?:UnitSystem;timeZone?:string;config:PoolConfig;value:PoolVisit;history:import('@/lib/field/chemistry').ChemistryEntry[];previous?:RouteStop['last_readings'] extends Record<string,infer V>|undefined?V:never;disabled:boolean;onChange:(value:PoolVisit)=>void}) {
  const {t}=useLanguage();
  const [shortcuts,setShortcuts]=useState<Record<string,number[]>>({});
  const [showOptional,setShowOptional]=useState(false);
  const optionalKeys:ReadingKey[]=['ta','cya','ch','salt','cc','tc','temperature_f'];
  const retiredTasks=value.tasks.filter(task=>!config.checklist.includes(task));
  function reading(key:ReadingKey){
    const previousValue=previous?.readings[key];
    const choices=key==='fc'?[1,3,5]:key==='ph'?[7,7.2,7.4,7.6,7.8,8]:[];
    return <div key={key} className={`field-input-label ${key==='fc'||key==='ph'?'field-reading-priority':''}`}>
      <label className="field-input-label"><T text={key==='temperature_f'&&unitSystem==='metric'?'Water temperature (°C)':READING_LABELS[key]}/>{config.required_readings.includes(key)?' *':''}
        <LocaleInput aria-label={`${config.name} ${READING_LABELS[key]}`} type="number" inputMode="decimal" step="any" min={key==='temperature_f'&&unitSystem==='metric'?fahrenheitToCelsius(0):0} max={key==='temperature_f'&&unitSystem==='metric'?fahrenheitToCelsius(LIMITS[key]):LIMITS[key]} value={key==='temperature_f'&&unitSystem==='metric'&&value.readings[key]!==undefined?Number(fahrenheitToCelsius(value.readings[key]!).toFixed(2)):value.readings[key]??''} disabled={disabled} onChange={event=>{const next={...value.readings};if(event.target.value==='')delete next[key];else next[key]=key==='temperature_f'&&unitSystem==='metric'?celsiusToFahrenheit(Number(event.target.value)):Number(event.target.value);onChange({...value,readings:next});}}/>
      </label>
      {choices.length>0&&<div className="field-reading-options" role="group" aria-label={`${config.name} ${key==='ph'?'pH':'Free Chlorine'} quick values`}>
        {choices.map(amount=><button type="button" key={amount} className="field-shortcut" disabled={disabled} aria-label={`${config.name} ${key==='ph'?'pH':'FC'} ${key==='ph'?amount.toFixed(1):amount}${key==='fc'?' ppm':''}`} aria-pressed={value.readings[key]===amount} onClick={()=>onChange({...value,readings:{...value.readings,[key]:amount}})}>{key==='ph'?amount.toFixed(1):amount}</button>)}
      </div>}
      {choices.length>0&&<span className="field-reference"><T text="Tap a value or type a different reading."/></span>}
      {outsideRange(value.readings[key],config.reference_ranges?.[key])&&<span className="reading-warning"><T text="Outside this pool’s configured reference range"/></span>}<span className="field-reference">{previousValue===undefined?<T text={"New reading — not prefilled"}/>:<><T text="Previous:"/> {key==='temperature_f'&&unitSystem==='metric'?Number(fahrenheitToCelsius(previousValue).toFixed(2)):previousValue} {key==='temperature_f'?(unitSystem==='metric'?'°C':'°F'):''} · <DateText value={previous!.recorded_at} options={{timeZone}}/></>}</span>
    </div>;
  }
  function changeDose(index:number,dose:Dosage){onChange({...value,dosages:value.dosages.map((item,i)=>i===index?canonicalDose(dose):item)});}
  return <div><h2 className="field-pool-heading">{config.name} <span className="field-tiny"><NumberText value={unitSystem==='metric'?gallonsToLiters(config.gallons):config.gallons} options={{maximumFractionDigits:1}}/> <T text={unitSystem==='metric'?'L':'gal'}/></span></h2><ChemistryHistory entries={history} poolName={config.name}/><section className="field-section"><p className="field-section-letter"><T text="A · WATER READINGS"/></p><div className="field-section-title"><h2><T text="Record today’s measurements"/></h2></div><div className="field-readings">{reading('fc')}{reading('ph')}</div><details className="field-optional" open={showOptional||optionalKeys.some(key=>config.required_readings.includes(key))} onToggle={event=>setShowOptional(event.currentTarget.open)}><summary><T text="More readings · TA, CYA, CH, salt & CC"/></summary><div className="field-readings">{optionalKeys.map(reading)}</div></details></section>
    <section className="field-section"><p className="field-section-letter"><T text="B · CHEMICAL DOSAGES"/></p><div className="field-section-title"><h2><T text="Products actually added"/></h2></div><div className="field-quick-products">{['Liquid Chlorine','Muriatic Acid'].map(product=><button type="button" className="field-shortcut" key={product} disabled={disabled||value.dosages.length>=20||value.dosages.some(d=>d.product===product)} onClick={()=>onChange({...value,dosages:[...value.dosages,{product,quantity:0,unit:PRODUCT_UNITS[product][0]}]})}>＋ <T text={product}/></button>)}</div><div className="field-dose-list">{value.dosages.map((storedDose,index)=>{const dose=displayDose(storedDose,unitSystem);
      const standard=PRODUCT_UNITS[dose.product]?.map(u=>u==='custom'?u:displayDose({quantity:1,unit:u},unitSystem).unit);
      const presets=shortcuts[dose.unit]??PRESETS[dose.unit]??[1,2,3];
      return <div className="field-dose" key={index}><div className="field-row-between"><h3 className="field-dose-title"><T text={dose.product||'Other product'}/></h3><button type="button" className="field-button field-button-quiet field-button-small" aria-label={t(`Remove ${dose.product}`)} disabled={disabled} onClick={()=>onChange({...value,dosages:value.dosages.filter((_,i)=>i!==index)})}><T text="Remove"/></button></div>{!standard&&<label className="field-input-label"><T text="Product"/><LocaleInput maxLength={100} value={dose.product} disabled={disabled} onChange={event=>changeDose(index,{...dose,product:event.target.value})}/></label>}<div className="field-dose-fields"><label className="field-input-label"><T text="Amount"/><LocaleInput aria-label={`${dose.product} amount`} type="number" inputMode="decimal" min="0.001" max="10000" step="any" value={dose.quantity||''} disabled={disabled} onChange={event=>changeDose(index,{...dose,quantity:Number(event.target.value)})}/></label><label className="field-input-label"><T text="Unit"/>{standard&&standard[0]!=='custom'?<LocaleSelect value={dose.unit} disabled={disabled} onChange={event=>changeDose(index,{...dose,unit:event.target.value})}>{standard.map(unit=><option key={unit}>{unit}</option>)}</LocaleSelect>:<LocaleInput value={dose.unit} maxLength={20} disabled={disabled} onChange={event=>changeDose(index,{...dose,unit:event.target.value})}/>}</label></div><div className="field-shortcuts">{presets.map(amount=><button key={amount} type="button" className="field-shortcut" disabled={disabled} onClick={()=>changeDose(index,{...dose,quantity:amount})}>{amount} {dose.unit}</button>)}</div><details className="field-optional"><summary><T text="Customize amount buttons"/></summary><label className="field-input-label"><T text="Comma-separated amounts"/><LocaleInput placeholder="For example: 0.5, 1, 2" defaultValue={presets.join(', ')} disabled={disabled} onBlur={event=>{const amounts=event.target.value.split(',').map(Number).filter(n=>Number.isFinite(n)&&n>0&&n<=10000).slice(0,6);if(amounts.length)setShortcuts(previous=>({...previous,[dose.unit]:[...new Set(amounts)]}));}}/></label></details></div>;
    })}</div><LocaleSelect className="field-product-select" aria-label={`Add chemical for ${config.name}`} value="" disabled={disabled||value.dosages.length>=20} onChange={event=>{const product=event.target.value;if(product)onChange({...value,dosages:[...value.dosages,{product:product==='Other'?'':product,quantity:0,unit:PRODUCT_UNITS[product][0]==='custom'?'':PRODUCT_UNITS[product][0]}]});}}><option value=""><T text="＋ Add a chemical used"/></option>{Object.keys(PRODUCT_UNITS).map(product=><option key={product} value={product}><T text={product}/></option>)}</LocaleSelect><p className="field-tiny"><T text="Amount buttons are entry shortcuts, not dosage recommendations."/></p></section><section className="field-section"><p className="field-section-letter"><T text="C · CHECKLIST"/></p><div className="field-section-title"><h2><T text="Tasks performed"/></h2><button type="button" className="field-button field-button-secondary field-button-small" disabled={disabled} onClick={()=>onChange({...value,tasks:[...config.checklist]})}><T text="Mark all done"/></button></div><div className="field-checklist">{config.checklist.map(task=><label className="field-check" key={task}><LocaleInput type="checkbox" checked={value.tasks.includes(task)} disabled={disabled} onChange={event=>onChange({...value,tasks:event.target.checked?[...value.tasks,task]:value.tasks.filter(item=>item!==task)})}/><T text={task}/></label>)}</div>{!config.checklist.length&&<p className="field-tiny"><T text="No checklist tasks configured for this pool."/></p>}{retiredTasks.length>0&&<div className="field-alert field-alert-warning"><p><T text="The checklist changed. These selected tasks are no longer configured: "/>{retiredTasks.join(', ')}.</p><button type="button" className="field-button field-button-secondary field-button-small" disabled={disabled} onClick={()=>onChange({...value,tasks:value.tasks.filter(task=>config.checklist.includes(task))})}><T text="Remove retired tasks from this draft"/></button></div>}</section>
    </div>;
}
