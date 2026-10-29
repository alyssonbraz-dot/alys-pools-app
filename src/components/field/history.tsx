'use client';

import {chemistryCsv} from '@/lib/chemistry-table';
import {ChemicalTables} from '@/components/chemical-tables';
import {DateText,T,LocaleInput,LocaleTextarea} from '@/components/i18n';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { VisitHistory } from '@/lib/field/types';
import './field.css';
import {ISSUE_LABELS} from '@/lib/field/issues';

const messageOf=(cause:unknown)=>cause instanceof Error?cause.message:'The history could not be loaded.';

async function loadHistory(customerId?:string,query='',status='all',offset=0,period='all'){
 const params=new URLSearchParams({q:query,status,offset:String(offset)});if(typeof window!=='undefined'){const selected=new URLSearchParams(window.location.search);for(const k of ['visit_id','technician_id']){const v=selected.get(k);if(v)params.set(k,v);}}if(period!=='all'){const day=new Date();day.setDate(day.getDate()-Number(period)+1);params.set('from',new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(day));}if(customerId)params.set('customer_id',customerId);
  const response=await fetch('/api/history?'+params.toString(),{cache:'no-store'});
  const data=await response.json();
  if(!response.ok)throw new Error(response.status===401?'Sign in again to view visit history.':data.error||'The history could not be loaded.');
  return data as {visits:VisitHistory[];hasMore:boolean;role?:'owner'|'admin'|'technician'};
}

export function History({customerId}:{customerId?:string}){
  const [visits,setVisits]=useState<VisitHistory[]>([]);
  const [loading,setLoading]=useState(true);
  const [role,setRole]=useState('technician');
  const [error,setError]=useState('');
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('all');const [period,setPeriod]=useState('all');
  const [offset,setOffset]=useState(0),[hasMore,setHasMore]=useState(false);
  useEffect(()=>{
    let cancelled=false;
    const timer=setTimeout(()=>{setLoading(true);void loadHistory(customerId,search,status,offset,period).then(data=>{if(!cancelled){setVisits(data.visits);setHasMore(data.hasMore);setRole(data.role??'technician');setError('');}}).catch(cause=>{if(!cancelled)setError(messageOf(cause));}).finally(()=>{if(!cancelled)setLoading(false);});},200);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[customerId,search,status,offset,period]);
  const filtered=visits;
  function exportPage(dosages:boolean){const rows=visits.flatMap(v=>v.snapshot.pools.map(p=>({visit_id:v.id,completed_at:v.completed_at,pool_name:p.pool_name,readings:p.readings,dosages:p.dosages,technician_name:v.technician_name,unit_system:v.snapshot.unit_system,service_timezone:v.snapshot.service_timezone})));const url=URL.createObjectURL(new Blob([chemistryCsv(rows,dosages)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=dosages?'alys-dosages-page.csv':'alys-readings-page.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

  async function refresh(){try{const data=await loadHistory(customerId,search,status,offset,period);setVisits(data.visits);setHasMore(data.hasMore);setRole(data.role??'technician');}catch(cause){setError(messageOf(cause));}}
  return <div className="field-app"><div className="field-kicker"><T text="SERVICE RECORDS"/></div><h1 className="field-heading"><T text="Visit History"/></h1><p className="field-subtitle"><T text="Exact tasks, readings, dosages and photos from each completed service."/></p>{error&&<p className="field-alert field-alert-error" role="alert"><T text={error}/></p>}<label><span className="sr-only"><T text="Search visit history"/></span><LocaleInput type="search" className="field-inline-search" value={search} placeholder="Search client, property or pool" onChange={event=>{setSearch(event.target.value);setOffset(0);}}/></label><div className="section-toolbar"><button className="btn btn-secondary" disabled={loading||!visits.length} onClick={()=>exportPage(false)}><T text="Export readings (this page)"/></button><button className="btn btn-secondary" disabled={loading||!visits.length} onClick={()=>exportPage(true)}><T text="Export dosages (this page)"/></button></div><label className="form-field"><T text="History period"/><select value={period} onChange={e=>{setPeriod(e.target.value);setOffset(0);}}>{[['7','Last 7 days'],['30','Last 30 days'],['90','Last 90 days'],['all','All history']].map(([v,label])=><option key={v} value={v}><T text={label}/></option>)}</select></label><div className="field-tabs" role="group" aria-label="Filter by email status">{[['all','All visits'],['pending','Email pending'],['sent','Email sent'],['failed','Email failed']].map(([key,label])=><button className={`field-button ${status===key?'':'field-button-secondary'}`} key={key} onClick={()=>{setStatus(key);setOffset(0);}} aria-pressed={status===key}><T text={label}/></button>)}</div>{loading?<><div className="field-skeleton"/><div className="field-skeleton"/></>:filtered.length?<div className="field-history-list">{filtered.map(visit=><HistoryCard key={visit.id} visit={visit} manager={role==='owner'||role==='admin'} onRefresh={refresh}/>)}</div>:<div className="field-empty"><h2>{visits.length?<T text={"No matching visits"}/>:<T text={"Your service history starts here"}/>}</h2><p>{visits.length?<T text={"Try another client or email status."}/>:<T text={"Completed and synchronized visits appear here. Visits stored only on a device are shown in Route until synchronization succeeds."}/>}</p><Link className="field-button" href="/"><T text="Open route"/></Link></div>}<nav className="field-row" aria-label="History pages"><button className="field-button field-button-secondary" disabled={loading||offset===0} onClick={()=>setOffset(n=>Math.max(0,n-50))}><T text="Previous page"/></button><span><T text="Page"/> {offset/50+1}</span><button className="field-button field-button-secondary" disabled={loading||!hasMore} onClick={()=>setOffset(n=>n+50)}><T text="Next page"/></button></nav></div>;
}

function SignedPhoto({path,index,poolName}:{path:string;index:number;poolName?:string}){
  const [url,setUrl]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    fetch('/api/photos?path='+encodeURIComponent(path),{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error('Photo access could not be confirmed.');if(!cancelled)setUrl(data.url);}).catch(cause=>{if(!cancelled)setError(messageOf(cause));});
    return()=>{cancelled=true;};
  },[path]);
  return <figure className="field-photo">{poolName&&<figcaption>{poolName}</figcaption>}{url?<a href={url} target="_blank" rel="noopener noreferrer"><Image src={url} width={480} height={360} alt={`Service photo ${index+1}`} unoptimized/></a>:<p className="field-tiny">{error||'Loading private photo…'}</p>}</figure>;
}

export function HistoryCard({visit,manager,onRefresh}:{visit:VisitHistory;manager:boolean;onRefresh:()=>Promise<void>}){
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const emailStatus=visit.email?.status;
  const corrections=(visit as VisitHistory&{corrections?:{id:string;note:string;created_at:string;actor_id:string}[]}).corrections??[];
  async function correct(form:FormData){
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visit_id:visit.id,note:form.get('note')})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'The correction could not be saved.');
      setNotice('Correction appended to the history. The original record is preserved.');
      await onRefresh();
    }catch(cause){setError(messageOf(cause));}
    finally{setBusy(false);}
  }
  async function retry(){
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/email/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visit_id:visit.id})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'The report could not be queued again.');
      setNotice('Delivery retry requested. It is not marked sent until the provider confirms acceptance.');
      await onRefresh();
    }catch(cause){setError(messageOf(cause));}
    finally{setBusy(false);}
  }
  return <details className="field-history-card" onToggle={event=>setOpen(event.currentTarget.open)}><summary><div className="field-row-between"><div><h2 className="field-history-title">{visit.snapshot.property_name||visit.snapshot.customer_name}</h2><p className="field-history-date"><DateText value={visit.completed_at} options={{dateStyle:'medium',timeStyle:'short',timeZone:visit.snapshot.service_timezone??'America/New_York'}}/> · {visit.technician_name||<T text="Assigned technician"/>}</p></div><span className="field-badge field-badge-completed"><T text="Completed"/></span></div><div className="field-row"><span className="field-tiny">{visit.snapshot.customer_name}</span><span className={`field-badge field-badge-${emailStatus??'disabled'}`}><T text="Email "/><T text={visit.email?.display_status??(emailStatus==='sent'?'Accepted by provider':emailStatus==='pending'?'Queued':emailStatus==='failed'?'Failed':'not enabled')}/></span><span className="field-tiny"><T text="View service details ↓"/></span></div></summary>{open&&<div className="field-history-detail">{visit.snapshot.pools.map(pool=><section key={pool.pool_id}><h3>{pool.pool_name}</h3><h4 className="field-tiny"><T text="Tasks completed"/></h4>{pool.tasks.length?<ul>{pool.tasks.map(task=><li key={task}>✓ <T text={task}/></li>)}</ul>:<p className="field-tiny"><T text="No tasks checked."/></p>}<h4 className="field-tiny"><T text="Water readings"/></h4><ChemicalTables rows={[{visit_id:visit.id,completed_at:visit.completed_at,readings:pool.readings,dosages:pool.dosages,technician_name:visit.technician_name,unit_system:visit.snapshot.unit_system,service_timezone:visit.snapshot.service_timezone}]}/></section>)}{visit.photos.length>0&&<section><h3><T text="Service photos"/></h3><div className="field-photos">{visit.photos.map((photo,index)=><SignedPhoto key={photo.storage_path} path={photo.storage_path} poolName={photo.pool_name} index={index}/>)}</div></section>}{!!visit.issue_flags?.length&&<section><h3><T text="Issue flags"/></h3><ul>{visit.issue_flags.map(flag=><li key={flag}><T text={ISSUE_LABELS[flag]}/></li>)}</ul></section>}{visit.snapshot.notes&&<section><h3><T text="Customer-facing service note"/></h3><p className="field-note">{visit.snapshot.notes}</p></section>}{visit.service_details&&<section><h3><T text="Internal service details"/></h3>{([['technician_notes','Technician notes'],['equipment_problems','Equipment problems'],['filter_cleaning','Filter cleaning'],['repairs_performed','Repairs performed']] as const).map(([key,label])=>visit.service_details?.[key]?<div key={key}><h4><T text={label}/></h4><p className="field-note">{visit.service_details[key]}</p></div>:null)}</section>}<section><h3><T text="Email report"/></h3><p className="field-tiny">{visit.email?.display_status==='Failed'?<T text="Provider reported a delivery failure. The visit and photos remain saved."/>:emailStatus==='sent'?<><T text={visit.email?.display_status==='Delivered'?'Delivered (confirmed by provider)':'Provider accepted the report'}/>{visit.email?.sent_at&&<> · <DateText value={visit.email.delivered_at??visit.email.sent_at} options={{dateStyle:'medium',timeStyle:'short'}}/></>}</>:emailStatus==='pending'?<T text={"Queued for background delivery. The visit is already saved."}/>:emailStatus==='failed'?<T text={"Delivery failed. The completed visit and photos remain saved."}/>:<T text={"Email reports were not enabled for this client when this visit was completed."}/>}</p>{visit.email?.error&&<p className="field-alert field-alert-warning"><T text={visit.email.error}/></p>}{error&&<p className="field-alert field-alert-error" role="alert"><T text={error}/></p>}{notice&&<p className="field-alert" role="status"><T text={notice}/></p>}{manager&&(emailStatus==='pending'||emailStatus==='failed')&&<button className="field-button field-button-secondary" disabled={busy} onClick={()=>void retry()}>{busy?<T text={"Requesting retry…"}/>:<T text={"Retry report delivery"}/>}</button>}</section><section><h3><T text="Audited corrections"/></h3>{corrections.length?corrections.map(correction=><div key={correction.id} className="field-alert"><div><p className="field-note">{correction.note}</p><p className="field-tiny"><DateText value={correction.created_at} options={{dateStyle:'medium',timeStyle:'short'}}/> <T text="· Administrator correction"/></p></div></div>):<p className="field-tiny"><T text="No corrections have been appended."/></p>}{manager&&<form action={correct}><label className="field-input-label"><T text="Append a correction"/><LocaleTextarea name="note" required minLength={3} maxLength={2000} placeholder="Explain the correction. Original readings and sent reports are retained."/></label><button className="field-button field-button-secondary" disabled={busy}>{busy?<T text={"Saving…"}/>:<T text={"Save audited correction"}/>}</button></form>}</section><p className="field-tiny"><T text="Historical record · "/>{visit.id}<T text=". Completed records are preserved."/></p></div>}</details>;
}
