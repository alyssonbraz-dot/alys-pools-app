'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { CompletionPayload, Dosage, PoolConfig, PoolVisit, ReadingKey, RouteData, RouteStop } from '@/lib/field/types';
import { floridaDay, READING_LABELS } from '@/lib/field/types';
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
const statusLabel:Record<string,string>={pending:'Pending',in_progress:'In progress',completed:'Completed',skipped:'Skipped',queued:'Saved on device',failed:'Needs attention'};
function routeTitle(date:string){return new Intl.DateTimeFormat('en-US',{weekday:'long',month:'short',day:'numeric',timeZone:'America/New_York'}).format(new Date(date+'T12:00:00-04:00'));}
function scopeOf(route:RouteData):OfflineScope{return {userId:route.userId,organizationId:route.orgId};}

export function FieldApp({initialStopId,initialDate,initialRoute,offline=false,expectedScope}:{initialStopId?:string;initialDate?:string;initialRoute?:RouteData;offline?:boolean;expectedScope?:OfflineScope}) {
  const [date,setDate]=useState(initialDate??initialRoute?.date??floridaDay());
  const [route,setRoute]=useState<RouteData|null>(initialRoute??null);
  const [scope,setScope]=useState<OfflineScope|null>(expectedScope??(initialRoute?scopeOf(initialRoute):null));
  const [activeStopId,setActiveStopId]=useState<string|null>(initialStopId??null);
  const [queue,setQueue]=useState<QueueItem[]>([]);
  const [online,setOnline]=useState(!offline);
  const [loading,setLoading]=useState(!initialRoute);
  const [syncing,setSyncing]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [cached,setCached]=useState(false);
  const [technician,setTechnician]=useState<string|null>(null);
  const offlineBootstrapped=useRef(false);

  const refreshQueue=useCallback(async(currentScope:OfflineScope)=>{
    const items=await getQueue(currentScope);setQueue(items);return items;
  },[]);
  const loadRoute=useCallback(async(day:string,currentScope?:OfflineScope|null)=>{
    try {
      const epoch=await getDeviceEpoch();
      const data=await request<RouteData>('/api/route?date='+encodeURIComponent(day));
      const identity=scopeOf(data);
      if(expectedScope&&(identity.userId!==expectedScope.userId||identity.organizationId!==expectedScope.organizationId))throw new Error('The signed-in account changed. Reload this page before continuing.');
      await cacheRoute(identity,data,epoch);
      setScope(identity);setRoute(data);setCached(false);setError('');
      await refreshQueue(identity);
      return data;
    } catch(cause) {
      if(cause instanceof Error&&cause.message.startsWith('The signed-in account changed')){setRoute(null);setError(cause.message);return null;}
      const identity=expectedScope??currentScope??await getActiveScope();
      const saved=identity?await getCachedRoute(identity,day):null;
      if(saved&&identity){setScope(identity);setRoute(saved);setCached(true);await refreshQueue(identity);}
      else setRoute(null);
      setError(messageOf(cause));return null;
    } finally {setLoading(false);}
  },[refreshQueue,expectedScope]);

  const flush=useCallback(async(currentScope:OfflineScope)=>{
    const pending=await getQueue(currentScope);
    if(!pending.length)return;
    setSyncing(true);
    try {
      const result=await syncQueue(currentScope);
      await refreshQueue(currentScope);
      if(result.authRequired)setError('Sign in again to sync this device. Your queued visits are still saved.');
      else if(result.pending)setNotice(`${result.pending} visit${result.pending===1?' is':'s are'} still saved on this device and waiting to sync.`);
      else if(result.synced)setNotice(`${result.synced} visit${result.synced===1?'':'s'} synced. Email delivery is tracked separately in History.`);
      if(result.synced)await loadRoute(date,currentScope);
    } catch(cause){setError(messageOf(cause));}
    finally {setSyncing(false);}
  },[date,loadRoute,refreshQueue]);

  useEffect(()=>{
    let cancelled=false;
    async function init(){
      const connection=navigator.onLine;setOnline(connection);
      const identity=expectedScope??(initialRoute?scopeOf(initialRoute):await getActiveScope());
      if(cancelled)return;
      if(offline&&!initialDate&&!offlineBootstrapped.current&&identity){
        const latest=await getCachedRoute(identity);
        if(cancelled)return;
        offlineBootstrapped.current=true;
        const queryDate=new URLSearchParams(window.location.search).get('date');
        const selected=queryDate&&/^\d{4}-\d{2}-\d{2}$/.test(queryDate)?queryDate:latest?.date;
        const pathStop=window.location.pathname.match(/^\/visit\/([a-f0-9-]+)$/i)?.[1];
        if(pathStop)setActiveStopId(pathStop);
        if(selected&&selected!==date){setDate(selected);return;}
      }
      await loadRoute(date,identity);
    }
    void init();
    return()=>{cancelled=true;};
  },[date,initialRoute,loadRoute,expectedScope,offline,initialDate]);

  useEffect(()=>{
    const update=()=>setOnline(navigator.onLine);
    window.addEventListener('online',update);window.addEventListener('offline',update);
    return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
  },[]);
  useEffect(()=>{
    const timer=online&&scope?window.setTimeout(()=>void flush(scope),0):undefined;
    return()=>{if(timer!==undefined)window.clearTimeout(timer);};
    // Flushing is tied to reconnection/identity, not to every queue state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[online,scope?.userId,scope?.organizationId]);

  function openStop(id:string|null){
    setActiveStopId(id);setError('');
    const path=id?`/visit/${id}?date=${date}`:`/?date=${date}`;
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
    if(online&&stop.status==='pending')void mutateStop({action:'start',stop_id:stop.id});
  }
  function reorder(stop:RouteStop,direction:-1|1){
    if(!route)return;
    const siblings=route.stops.filter(s=>s.technician_id===stop.technician_id).sort((a,b)=>a.position-b.position);
    const index=siblings.findIndex(s=>s.id===stop.id),next=index+direction;
    if(next<0||next>=siblings.length)return;
    [siblings[index],siblings[next]]=[siblings[next],siblings[index]];
    void mutateStop({action:'reorder',stop_ids:siblings.map(s=>s.id)});
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

  return <div className="field-app">
    <div className="field-row-between"><span className="field-kicker">FAST ROUTE</span><span className="field-tiny"><span className={`field-network-dot ${online?'':'field-network-dot-offline'}`}/> {online?'Online':'Offline'}{syncing?' · Syncing…':''}</span></div>
    {notice&&<div className="field-alert" role="status">{notice}<button className="field-button field-button-quiet field-button-small" onClick={()=>setNotice('')} aria-label="Dismiss notification">×</button></div>}
    {error&&<div className="field-alert field-alert-warning" role="alert">{error}{error.toLowerCase().includes('sign in')&&<Link className="field-auth-link" href="/login">Sign in</Link>}</div>}
    {cached&&<p className="field-alert field-alert-warning">Cached route. Changes and photos stay on this device until a signed-in connection confirms synchronization.</p>}
    {queue.length>0&&<div className="field-alert field-alert-warning"><div className="field-grow"><strong>{queue.length} visit{queue.length===1?'':'s'} waiting to sync</strong><ul className="field-queue-list">{queue.map(item=><li key={item.id}>{route?.stops.find(s=>s.id===item.payload.stop_id)?.property.name||'Visit'}{item.error?`: ${item.error}`:': stored on this device'}{item.http_status===422&&scope&&<button className="field-button field-button-secondary field-button-small" onClick={()=>{void releaseRejectedCompletion(scope,item.payload.stop_id).then(async()=>{await refreshQueue(scope);openStop(item.payload.stop_id);}).catch(cause=>setError(messageOf(cause)));}}>Edit rejected visit</button>}</li>)}</ul></div><button className="field-button field-button-secondary field-button-small" disabled={!online||syncing||!scope} onClick={()=>scope&&void flush(scope)}>Retry sync</button></div>}
    {loading&&!route?<><h1 className="field-heading">Loading your route…</h1><div className="field-skeleton"/><div className="field-skeleton"/></>:null}
    {!loading&&!route?<div className="field-empty"><h1 className="field-heading">Your route is unavailable</h1><p>Connect and sign in to save today’s route for field use.</p><Link className="field-button" href="/login">Sign in</Link><button className="field-button field-button-secondary" onClick={()=>void loadRoute(date,scope)}>Try again</button></div>:null}
    {route&&scope&&(stop?<VisitEditor key={stop.id} stop={stop} index={serviceStops.indexOf(stop)+1} total={serviceStops.length} scope={scope} queued={queuedIds.has(stop.id)} onBack={()=>openStop(null)} onComplete={completed}/>:<>
      {activeStopId&&!stop&&<p className="field-alert field-alert-warning">This stop is not in the selected route or is no longer assigned to you.</p>}
      <header className="field-top"><div><h1 className="field-heading">Today’s Route</h1><p className="field-subtitle">{routeTitle(date)} · {displayStops.length} stop{displayStops.length===1?'':'s'}</p></div><label className="field-input-label">Service date<input className="field-date" type="date" value={date} onChange={event=>{if(event.target.value){setDate(event.target.value);setActiveStopId(null);setLoading(true);setRoute(null);}}}/></label></header>
      <div className="field-row">{route.role!=='technician'&&<label className="field-input-label field-grow">Route for<select value={selectedTechnician??route.userId} onChange={event=>setTechnician(event.target.value)}><option value="all">All technicians</option>{route.technicians?.map(person=><option key={person.id} value={person.id}>{person.display_name}{person.id===route.userId?' (my route)':''}</option>)}</select></label>}</div>
      <div className="field-progress" role="progressbar" aria-label="Completed visits" aria-valuemin={0} aria-valuemax={displayStops.length||1} aria-valuenow={completeCount}><span style={{width:`${displayStops.length?completeCount/displayStops.length*100:0}%`}}/></div><div className="field-progress-copy"><strong>{completeCount} / {displayStops.length} completed · synced</strong><span>{remaining} remaining{selectedQueuedCount?` · ${selectedQueuedCount} on device`:''}</span></div>
      {!displayStops.length?<div className="field-empty"><h2>A clear route, ready to plan.</h2><p>Add a stop below, or configure recurring service days in Clients.</p></div>:<ol className="field-route-list">{displayStops.map((item,index)=>{
        const queued=queuedIds.has(item.id),status=queued?'queued':item.status;
        const siblings=route.stops.filter(s=>s.technician_id===item.technician_id),siblingIndex=siblings.findIndex(s=>s.id===item.id);
        return <li className={`field-stop ${item.id===current?.id?'field-stop-current':''}`} key={item.id}><div className="field-stop-header"><span className="field-stop-number">{index+1}</span><div className="field-stop-copy"><h2 className="field-stop-title">{item.property.name||item.customer.name}</h2><p className="field-stop-address">{item.property.address}</p>{route.role!=='technician'&&route.technicians&&<p className="field-tiny">{route.technicians.find(t=>t.id===item.technician_id)?.display_name??'Assigned technician'}</p>}</div><span className={`field-badge field-badge-${status}`}>{statusLabel[status]}</span></div><div className="field-stop-actions">{!['completed','skipped'].includes(item.status)?<button className="field-button field-grow" onClick={()=>startStop(item)}>{queued?'Review saved visit':item.status==='in_progress'?'Continue service →':'Start service →'}</button>:<Link className="field-button field-button-secondary field-grow" href="/history">View history</Link>}<a className="field-button field-button-secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.property.address)}`} target="_blank" rel="noopener noreferrer" aria-label={`Navigate to ${item.property.name||item.customer.name}`}>Navigate ↗</a><a className="field-button field-button-quiet field-button-small" href={`https://maps.apple.com/?daddr=${encodeURIComponent(item.property.address)}`} target="_blank" rel="noopener noreferrer">Apple Maps</a>{!['completed','skipped'].includes(item.status)&&!queued&&<button className="field-button field-button-quiet field-button-small" disabled={!online} onClick={()=>void mutateStop({action:'skip',stop_id:item.id})}>Skip stop</button>}<div className="field-order"><button aria-label={`Move ${item.property.name||item.customer.name} up`} disabled={!online||siblingIndex===0} onClick={()=>reorder(item,-1)}>↑</button><button aria-label={`Move ${item.property.name||item.customer.name} down`} disabled={!online||siblingIndex===siblings.length-1} onClick={()=>reorder(item,1)}>↓</button></div></div></li>;
      })}</ol>}
      {route.role!=='technician'&&route.properties&&<AddStop key={selectedTechnician} route={route} technicianId={selectedTechnician==='all'?route.userId:selectedTechnician} online={online} onAdd={mutateStop}/>}
    </>)}
  </div>;
}

function AddStop({route,technicianId,online,onAdd}:{route:RouteData;technicianId?:string;online:boolean;onAdd:(body:Record<string,unknown>)=>Promise<void>}) {
  const [busy,setBusy]=useState(false);
  return <details className="field-add-stop"><summary>＋ Add a stop to this day</summary><form className="field-add-form" onSubmit={async event=>{event.preventDefault();setBusy(true);const form=new FormData(event.currentTarget);await onAdd({action:'add',property_id:form.get('property_id'),technician_id:form.get('technician_id'),date:route.date});setBusy(false);}}><label className="field-input-label">Property<select name="property_id" required>{route.properties?.map(property=><option value={property.id} key={property.id}>{property.name||property.address}</option>)}</select></label><label className="field-input-label">Technician<select name="technician_id" defaultValue={technicianId} required>{route.technicians?.map(technician=><option value={technician.id} key={technician.id}>{technician.display_name}</option>)}</select></label><button className="field-button" disabled={!online||busy||!route.properties?.length||!route.technicians?.length}>{busy?'Adding…':'Add stop'}</button></form></details>;
}

const LIMITS:Record<ReadingKey,number>={fc:30,ph:14,ta:500,cya:1000,ch:5000,salt:10000,cc:30};
const PRODUCT_UNITS:Record<string,string[]>={'Liquid Chlorine':['gal','fl oz'],'Muriatic Acid':['fl oz'],'Sodium Bicarbonate':['lb'],'Calcium Chloride':['lb'],'Stabilizer':['lb'],'Salt':['lb'],'Chlorine Tablets':['units'],'Shock':['lb'],'Other':['custom']};
const PRESETS:Record<string,number[]>={'gal':[0.25,0.5,1],'fl oz':[8,16,32],lb:[1,2,4],units:[1,2,3],custom:[1,2,3]};

function blankDraft(stop:RouteStop):CompletionPayload {return {id:crypto.randomUUID(),stop_id:stop.id,started_at:new Date().toISOString(),pools:stop.pools.map(pool=>({pool_id:pool.id,tasks:[],readings:{},dosages:[]})),notes:'',photo_paths:[]};}
function validateDraft(draft:CompletionPayload,stop:RouteStop,photoCount:number):string|null {
  if(!stop.pools.length)return 'No active pool is configured for this property. Add a pool before completing this stop.';
  for(const config of stop.pools){
    const pool=draft.pools.find(p=>p.pool_id===config.id);
    if(!pool)return `${config.name}: pool details are missing.`;
    for(const key of config.required_readings)if(pool.readings[key]===undefined)return `${config.name}: ${READING_LABELS[key]} is required.`;
    for(const [key,value] of Object.entries(pool.readings))if(!Number.isFinite(value)||value<0||value>LIMITS[key as ReadingKey])return `${config.name}: check ${READING_LABELS[key as ReadingKey]}.`;
    for(const dose of pool.dosages)if(!dose.product.trim()||!dose.unit.trim()||!Number.isFinite(dose.quantity)||dose.quantity<=0||dose.quantity>10000||dose.unit.length>20)return `${config.name}: enter a positive amount for every chemical, or remove unused products.`;
    if(config.photo_required&&!photoCount)return `${config.name}: one service photo is required.`;
  }
  return null;
}
function PhotoPreview({photo,onRemove,readonly=false}:{photo:LocalPhoto;onRemove:()=>void;readonly?:boolean}) {
  const url=useMemo(()=>URL.createObjectURL(photo.blob),[photo.blob]);
  useEffect(()=>()=>URL.revokeObjectURL(url),[url]);
  return <figure className="field-photo"><Image src={url} alt="Captured service photo" width={320} height={240} unoptimized/>{!readonly&&<button type="button" className="field-button field-button-quiet field-button-small" onClick={onRemove}>Remove / retake</button>}</figure>;
}

function VisitEditor({stop,index,total,scope,queued,onBack,onComplete}:{stop:RouteStop;index:number;total:number;scope:OfflineScope;queued:boolean;onBack:()=>void;onComplete:(payload:CompletionPayload)=>Promise<void>}) {
  const [draft,setDraft]=useState<CompletionPayload|null>(null);
  const [photos,setPhotos]=useState<LocalPhoto[]>([]);
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
      const photo=await savePhoto(scope,stop.id,compressed);
      setPhotos(previous=>[...previous,photo]);
    }catch(cause){setError(messageOf(cause));}
    finally{setPhotoBusy(false);}
  }
  async function complete(){
    if(!visibleDraft)return;
    if(retiredPools.length){setError('This draft contains a pool that is no longer active at this property. Ask an administrator to restore the pool or review its saved work before completing. No measurements have been discarded.');return;}
    const invalid=validateDraft(visibleDraft,stop,photos.length);
    if(invalid){setError(invalid);return;}
    setBusy(true);setError('');
    try{await saveDraft(scope,visibleDraft);await onComplete(visibleDraft);}
    catch(cause){setError(messageOf(cause));setBusy(false);}
  }
  return <div className="field-service"><button className="field-back" onClick={onBack}>← Back to route</button><header className="field-top field-service-header"><div><h1 className="field-heading">{stop.property.name||stop.customer.name}</h1><p className="field-subtitle">Stop {index} / {total} · {stop.property.address}</p></div><span className="field-badge field-badge-in_progress">Fast Service</span></header>{stop.property.gate_notes&&<p className="field-access"><strong>Internal access notes:</strong> {stop.property.gate_notes}</p>}{error&&<p className="field-alert field-alert-error" role="alert">{error}</p>}{queued&&<p className="field-alert field-alert-warning">This visit is queued. Retry sync from the route to preserve the saved submission.</p>}{retiredPools.length>0&&<p className="field-alert field-alert-error" role="alert">Pool setup changed. This draft retains work for {retiredPools.length} pool{retiredPools.length===1?'':'s'} no longer active at this property. Ask an administrator to restore or review the pool before completing; saved measurements are preserved.</p>}{!visibleDraft?<div className="field-skeleton"/>:<>
    {stop.pools.map(config=>{const pool=visibleDraft.pools.find(p=>p.pool_id===config.id);return pool?<PoolForm key={config.id} config={config} value={pool} history={stop.chemistry_history?.[config.id]??[]} previous={stop.last_readings?.[config.id]} disabled={queued||busy} onChange={next=>updatePool(config.id,next)}/>:null;})}
    <section className="field-section"><p className="field-section-letter">D · SERVICE PHOTO</p><div className="field-section-title"><h2>Show the finished service</h2><span className="field-tiny">{photos.length} / 3</span></div>{photos.length<3&&!queued&&<label className="field-photo-control">{photoBusy?'Preparing photo…':'▧ TAKE PHOTO'}<small>{stop.pools.some(p=>p.photo_required)?'At least one photo is required':'Optional · up to three photos'}</small><input type="file" accept="image/*" capture="environment" disabled={photoBusy||busy} onChange={event=>{const file=event.target.files?.[0];if(file)void capture(file);event.currentTarget.value='';}}/></label>}<div className="field-photos">{photos.map(photo=><PhotoPreview key={photo.id} photo={photo} readonly={queued} onRemove={()=>{if(queued)return;void removePhoto(scope,photo.id).then(()=>setPhotos(items=>items.filter(item=>item.id!==photo.id))).catch(cause=>setError(messageOf(cause)));}}/>)}</div><p className="field-tiny">Photos are compressed and kept on this device until the upload is confirmed.</p></section>
    <section className="field-section"><label className="field-input-label">Service note <span className="field-reference">Included in the customer report. Do not add gate codes or private notes.</span><textarea maxLength={2000} value={visibleDraft.notes} disabled={queued||busy} placeholder="Optional service information for the customer" onChange={event=>update({...visibleDraft,notes:event.target.value})}/></label></section>
    <div className="field-complete-bar"><button className="field-button" disabled={busy||photoBusy||queued||retiredPools.length>0} onClick={()=>void complete()}>{queued?'Saved on device — waiting to sync':busy?'Saving visit…':'COMPLETE & NEXT →'}</button><p role="status">{saveStatus} · Only checked tasks and recorded values enter the report.</p></div>
    </>}
  </div>;
}

function PoolForm({config,value,previous,history,disabled,onChange}:{config:PoolConfig;value:PoolVisit;history:import('@/lib/field/chemistry').ChemistryEntry[];previous?:RouteStop['last_readings'] extends Record<string,infer V>|undefined?V:never;disabled:boolean;onChange:(value:PoolVisit)=>void}) {
  const [shortcuts,setShortcuts]=useState<Record<string,number[]>>({});
  const [showOptional,setShowOptional]=useState(false);
  const optionalKeys:ReadingKey[]=['ta','cya','ch','salt','cc'];
  const retiredTasks=value.tasks.filter(task=>!config.checklist.includes(task));
  function reading(key:ReadingKey){
    const previousValue=previous?.readings[key];
    return <label key={key} className={`field-input-label ${key==='fc'||key==='ph'?'field-reading-priority':''}`}>{READING_LABELS[key]}{config.required_readings.includes(key)?' *':''}<input aria-label={`${config.name} ${READING_LABELS[key]}`} type="number" inputMode="decimal" step="0.1" min="0" max={LIMITS[key]} value={value.readings[key]??''} disabled={disabled} onChange={event=>{const next={...value.readings};if(event.target.value==='')delete next[key];else next[key]=Number(event.target.value);onChange({...value,readings:next});}}/><span className="field-reference">{previousValue===undefined?'New reading — not prefilled':`Previous: ${previousValue} · ${new Date(previous!.recorded_at).toLocaleDateString('en-US',{timeZone:'America/New_York'})}`}</span></label>;
  }
  function changeDose(index:number,dose:Dosage){onChange({...value,dosages:value.dosages.map((item,i)=>i===index?dose:item)});}
  return <div><h2 className="field-pool-heading">{config.name} <span className="field-tiny">{config.gallons.toLocaleString('en-US')} gal</span></h2><ChemistryHistory entries={history} poolName={config.name}/><section className="field-section"><p className="field-section-letter">A · QUICK CHECKLIST</p><div className="field-section-title"><h2>Tasks performed</h2><button type="button" className="field-button field-button-secondary field-button-small" disabled={disabled} onClick={()=>onChange({...value,tasks:[...config.checklist]})}>Mark all done</button></div><div className="field-checklist">{config.checklist.map(task=><label className="field-check" key={task}><input type="checkbox" checked={value.tasks.includes(task)} disabled={disabled} onChange={event=>onChange({...value,tasks:event.target.checked?[...value.tasks,task]:value.tasks.filter(item=>item!==task)})}/>{task}</label>)}</div>{!config.checklist.length&&<p className="field-tiny">No checklist tasks configured for this pool.</p>}{retiredTasks.length>0&&<div className="field-alert field-alert-warning"><p>The checklist changed. These selected tasks are no longer configured: {retiredTasks.join(', ')}.</p><button type="button" className="field-button field-button-secondary field-button-small" disabled={disabled} onClick={()=>onChange({...value,tasks:value.tasks.filter(task=>config.checklist.includes(task))})}>Remove retired tasks from this draft</button></div>}</section>
    <section className="field-section"><p className="field-section-letter">B · WATER READINGS</p><div className="field-section-title"><h2>Record today’s measurements</h2></div><div className="field-readings">{reading('fc')}{reading('ph')}</div><details className="field-optional" open={showOptional||optionalKeys.some(key=>config.required_readings.includes(key))} onToggle={event=>setShowOptional(event.currentTarget.open)}><summary>More readings · TA, CYA, CH, salt & CC</summary><div className="field-readings">{optionalKeys.map(reading)}</div></details></section>
    <section className="field-section"><p className="field-section-letter">C · CHEMICAL DOSAGES</p><div className="field-section-title"><h2>Products actually added</h2></div><div className="field-dose-list">{value.dosages.map((dose,index)=>{
      const standard=PRODUCT_UNITS[dose.product];
      const presets=shortcuts[dose.unit]??PRESETS[dose.unit]??[1,2,3];
      return <div className="field-dose" key={index}><div className="field-row-between"><h3 className="field-dose-title">{dose.product||'Other product'}</h3><button type="button" className="field-button field-button-quiet field-button-small" aria-label={`Remove ${dose.product}`} disabled={disabled} onClick={()=>onChange({...value,dosages:value.dosages.filter((_,i)=>i!==index)})}>Remove</button></div>{!standard&&<label className="field-input-label">Product<input maxLength={100} value={dose.product} disabled={disabled} onChange={event=>changeDose(index,{...dose,product:event.target.value})}/></label>}<div className="field-dose-fields"><label className="field-input-label">Amount<input aria-label={`${dose.product} amount`} type="number" inputMode="decimal" min="0.001" max="10000" step="any" value={dose.quantity||''} disabled={disabled} onChange={event=>changeDose(index,{...dose,quantity:Number(event.target.value)})}/></label><label className="field-input-label">Unit{standard&&standard[0]!=='custom'?<select value={dose.unit} disabled={disabled} onChange={event=>changeDose(index,{...dose,unit:event.target.value})}>{standard.map(unit=><option key={unit}>{unit}</option>)}</select>:<input value={dose.unit} maxLength={20} disabled={disabled} onChange={event=>changeDose(index,{...dose,unit:event.target.value})}/>}</label></div><div className="field-shortcuts">{presets.map(amount=><button key={amount} type="button" className="field-shortcut" disabled={disabled} onClick={()=>changeDose(index,{...dose,quantity:amount})}>{amount} {dose.unit}</button>)}</div><details className="field-optional"><summary>Customize amount buttons</summary><label className="field-input-label">Comma-separated amounts<input placeholder="For example: 0.5, 1, 2" defaultValue={presets.join(', ')} disabled={disabled} onBlur={event=>{const amounts=event.target.value.split(',').map(Number).filter(n=>Number.isFinite(n)&&n>0&&n<=10000).slice(0,6);if(amounts.length)setShortcuts(previous=>({...previous,[dose.unit]:[...new Set(amounts)]}));}}/></label></details></div>;
    })}</div><select className="field-product-select" aria-label={`Add chemical for ${config.name}`} value="" disabled={disabled||value.dosages.length>=20} onChange={event=>{const product=event.target.value;if(product)onChange({...value,dosages:[...value.dosages,{product:product==='Other'?'':product,quantity:0,unit:PRODUCT_UNITS[product][0]==='custom'?'':PRODUCT_UNITS[product][0]}]});}}><option value="">＋ Add a chemical used</option>{Object.keys(PRODUCT_UNITS).map(product=><option key={product}>{product}</option>)}</select><p className="field-tiny">Amount buttons are entry shortcuts, not dosage recommendations.</p></section></div>;
}
