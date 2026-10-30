'use client';
import {useEffect,useState} from 'react';
import {T,LocaleInput,useLanguage} from '@/components/i18n';
import {canReplaceQueuedPhoto,listPhotos,replaceQueuedPhoto,type LocalPhoto,type OfflineScope,type QueueItem} from '@/lib/offline/store';
import {SyncProgress} from './sync-progress';
export function SyncNotice({scope,queue,syncError,name,online,syncing,onRetry,onChanged,onEdit}:{scope:OfflineScope;queue:QueueItem[];syncError:string;name:(id:string)=>string;online:boolean;syncing:boolean;onRetry:()=>void;onChanged:()=>Promise<unknown>;onEdit:(id:string)=>void}){
 const {t}=useLanguage();
 const [available,setAvailable]=useState<string[]>([]);
 useEffect(()=>{let active=true;void Promise.all(queue.filter(canReplaceQueuedPhoto).map(async item=>(await listPhotos(scope,item.payload.stop_id)).length?item.payload.stop_id:null)).then(ids=>{if(active)setAvailable(ids.filter((id):id is string=>!!id));}).catch(()=>{});return()=>{active=false;};},[queue,scope]);
 const [photos,setPhotos]=useState<LocalPhoto[]>([]),[selected,setSelected]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function open(item:QueueItem){setError('');try{setPhotos(await listPhotos(scope,item.payload.stop_id));setSelected(item.payload.stop_id);}catch{setError('Unable to read saved photos. Your pending visit is preserved.');}}
 async function replace(id:string,file:File){setBusy(true);setError('');try{await replaceQueuedPhoto(scope,id,file);setSelected(null);setPhotos([]);await onChanged();}catch(cause){setError(cause instanceof Error?cause.message:'Photo replacement failed. The original photo and visit are preserved.');}finally{setBusy(false);}}
 if(!queue.length)return <SyncProgress scope={scope} name={name}/>;
 return <section className="field-sync-notice" aria-label={t('Device synchronization')} aria-live="polite">
  <div className="field-sync-notice-heading"><strong><T text={`${queue.length} pending visit${queue.length===1?'':'s'}`}/></strong><button className="field-button field-button-secondary field-button-small" disabled={!online||syncing||busy} onClick={onRetry}><T text="Retry sync"/></button></div>
  <SyncProgress scope={scope} name={name} activeOnly/>
  <ul className="field-queue-list">{queue.map(item=><li key={item.id}><strong>{item.label??name(item.payload.stop_id)}</strong> · <T text={item.status==='pending'?'Pending Sync':item.status==='auth_required'?'Sign in to sync':'Failed'}/>{item.error&&<>: <T text={item.error}/></>}
   <div className="field-sync-actions">{item.status==='auth_required'&&<a href="/login"><T text="Sign in"/></a>}{canReplaceQueuedPhoto(item)&&available.includes(item.payload.stop_id)&&<button className="field-button field-button-quiet field-button-small" disabled={syncing||busy} onClick={()=>void open(item)}><T text="Replace photo"/></button>}{item.http_status===422&&<button className="field-button field-button-secondary field-button-small" disabled={syncing||busy} onClick={()=>onEdit(item.payload.stop_id)}><T text="Edit rejected visit"/></button>}</div>
   {selected===item.payload.stop_id&&<div className="field-replace-photos">{photos.length===0?<p><T text="No local photo is available to replace. Your visit is preserved."/></p>:photos.map((photo,index)=><label className="field-photo-control" key={photo.id}><T text={busy?'Preparing photo…':`Replace photo ${index+1}`}/><LocaleInput aria-label={`Replace photo ${index+1}`} type="file" accept="image/*,.heic,.heif" disabled={busy||syncing} onChange={event=>{const file=event.target.files?.[0];if(file)void replace(photo.id,file);event.currentTarget.value='';}}/></label>)}</div>}
  </li>)}</ul>
  {(error||syncError)&&<p role="alert"><T text={error||syncError}/></p>}
 </section>;
}
