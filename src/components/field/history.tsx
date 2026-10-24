'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { VisitHistory } from '@/lib/field/types';
import { READING_LABELS } from '@/lib/field/types';
import './field.css';

const dateTime=(date:string)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'}).format(new Date(date));
const messageOf=(cause:unknown)=>cause instanceof Error?cause.message:'The history could not be loaded.';

async function loadHistory(){
  const response=await fetch('/api/history',{cache:'no-store'});
  const data=await response.json();
  if(!response.ok)throw new Error(response.status===401?'Sign in again to view visit history.':data.error||'The history could not be loaded.');
  return data as {visits:VisitHistory[];role?:'owner'|'admin'|'technician'};
}

export function History(){
  const [visits,setVisits]=useState<VisitHistory[]>([]);
  const [loading,setLoading]=useState(true);
  const [role,setRole]=useState('technician');
  const [error,setError]=useState('');
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('all');
  useEffect(()=>{
    let cancelled=false;
    loadHistory().then(data=>{if(!cancelled){setVisits(data.visits);setRole(data.role??'technician');setError('');}}).catch(cause=>{if(!cancelled)setError(messageOf(cause));}).finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[]);
  const filtered=visits.filter(visit=>(status==='all'||(visit.email?.status??'disabled')===status)&&`${visit.snapshot.property_name} ${visit.snapshot.customer_name} ${visit.snapshot.pools.map(p=>p.pool_name).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  async function refresh(){try{const data=await loadHistory();setVisits(data.visits);setRole(data.role??'technician');}catch(cause){setError(messageOf(cause));}}
  return <div className="field-app"><div className="field-kicker">SERVICE RECORDS</div><h1 className="field-heading">Visit History</h1><p className="field-subtitle">Exact tasks, readings, dosages and photos from each completed service.</p>{error&&<p className="field-alert field-alert-error" role="alert">{error}</p>}<label><span className="sr-only">Search visit history</span><input type="search" className="field-inline-search" value={search} placeholder="Search client, property or pool" onChange={event=>setSearch(event.target.value)}/></label><div className="field-tabs" role="group" aria-label="Filter by email status">{[['all','All visits'],['pending','Email pending'],['sent','Email sent'],['failed','Email failed']].map(([key,label])=><button className={`field-button ${status===key?'':'field-button-secondary'}`} key={key} onClick={()=>setStatus(key)} aria-pressed={status===key}>{label}</button>)}</div>{loading?<><div className="field-skeleton"/><div className="field-skeleton"/></>:filtered.length?<div className="field-history-list">{filtered.map(visit=><HistoryCard key={visit.id} visit={visit} manager={role==='owner'||role==='admin'} onRefresh={refresh}/>)}</div>:<div className="field-empty"><h2>{visits.length?'No matching visits':'Your service history starts here'}</h2><p>{visits.length?'Try another client or email status.':'Completed and synchronized visits appear here. Visits stored only on a device are shown in Route until synchronization succeeds.'}</p><Link className="field-button" href="/">Open route</Link></div>}</div>;
}

function SignedPhoto({path,index}:{path:string;index:number}){
  const [url,setUrl]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    fetch('/api/photos?path='+encodeURIComponent(path),{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error('Photo access could not be confirmed.');if(!cancelled)setUrl(data.url);}).catch(cause=>{if(!cancelled)setError(messageOf(cause));});
    return()=>{cancelled=true;};
  },[path]);
  return <figure className="field-photo">{url?<a href={url} target="_blank" rel="noopener noreferrer"><Image src={url} width={480} height={360} alt={`Service photo ${index+1}`} unoptimized/></a>:<p className="field-tiny">{error||'Loading private photo…'}</p>}</figure>;
}

function HistoryCard({visit,manager,onRefresh}:{visit:VisitHistory;manager:boolean;onRefresh:()=>Promise<void>}){
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
  return <details className="field-history-card" onToggle={event=>setOpen(event.currentTarget.open)}><summary><div className="field-row-between"><div><h2 className="field-history-title">{visit.snapshot.property_name||visit.snapshot.customer_name}</h2><p className="field-history-date">{dateTime(visit.completed_at)} · {visit.technician_name||'Assigned technician'}</p></div><span className="field-badge field-badge-completed">Completed</span></div><div className="field-row"><span className="field-tiny">{visit.snapshot.customer_name}</span><span className={`field-badge field-badge-${emailStatus??'disabled'}`}>Email {emailStatus??'not enabled'}</span><span className="field-tiny">View service details ↓</span></div></summary>{open&&<div className="field-history-detail">{visit.snapshot.pools.map(pool=><section key={pool.pool_id}><h3>{pool.pool_name}</h3><h4 className="field-tiny">Tasks completed</h4>{pool.tasks.length?<ul>{pool.tasks.map(task=><li key={task}>✓ {task}</li>)}</ul>:<p className="field-tiny">No tasks checked.</p>}<h4 className="field-tiny">Water readings</h4>{Object.keys(pool.readings).length?<dl>{Object.entries(pool.readings).map(([key,value])=><div key={key}><dt>{READING_LABELS[key as keyof typeof READING_LABELS]}</dt><dd>{value}</dd></div>)}</dl>:<p className="field-tiny">No readings recorded.</p>}<h4 className="field-tiny">Chemicals added</h4>{pool.dosages.length?<ul>{pool.dosages.map((dose,index)=><li key={index}>{dose.product}: <strong>{dose.quantity} {dose.unit}</strong></li>)}</ul>:<p className="field-tiny">No products recorded.</p>}</section>)}{visit.photos.length>0&&<section><h3>Service photos</h3><div className="field-photos">{visit.photos.map((photo,index)=><SignedPhoto key={photo.storage_path} path={photo.storage_path} index={index}/>)}</div></section>}{visit.snapshot.notes&&<section><h3>Customer-facing service note</h3><p className="field-note">{visit.snapshot.notes}</p></section>}<section><h3>Email report</h3><p className="field-tiny">{emailStatus==='sent'?`Provider accepted the report${visit.email?.sent_at?' on '+dateTime(visit.email.sent_at):''}.`:emailStatus==='pending'?'Queued for background delivery. The visit is already saved.':emailStatus==='failed'?'Delivery failed. The completed visit and photos remain saved.':'Email reports were not enabled for this client when this visit was completed.'}</p>{visit.email?.error&&<p className="field-alert field-alert-warning">{visit.email.error}</p>}{error&&<p className="field-alert field-alert-error" role="alert">{error}</p>}{notice&&<p className="field-alert" role="status">{notice}</p>}{(emailStatus==='pending'||emailStatus==='failed')&&<button className="field-button field-button-secondary" disabled={busy} onClick={()=>void retry()}>{busy?'Requesting retry…':'Retry report delivery'}</button>}</section><section><h3>Audited corrections</h3>{corrections.length?corrections.map(correction=><div key={correction.id} className="field-alert"><div><p className="field-note">{correction.note}</p><p className="field-tiny">{dateTime(correction.created_at)} · Administrator correction</p></div></div>):<p className="field-tiny">No corrections have been appended.</p>}{manager&&<form action={correct}><label className="field-input-label">Append a correction<textarea name="note" required minLength={3} maxLength={2000} placeholder="Explain the correction. Original readings and sent reports are retained."/></label><button className="field-button field-button-secondary" disabled={busy}>{busy?'Saving…':'Save audited correction'}</button></form>}</section><p className="field-tiny">Historical record · {visit.id}. Completed records are preserved.</p></div>}</details>;
}
