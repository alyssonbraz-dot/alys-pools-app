'use client';
import {useSyncExternalStore} from 'react';
import {getSyncProgress,subscribeSyncProgress} from '@/lib/offline/progress';
import type {OfflineScope} from '@/lib/offline/store';
import {T} from '@/components/i18n';
export function SyncProgress({scope,name}:{scope:OfflineScope;name:(id:string)=>string}){
 const state=useSyncExternalStore(subscribeSyncProgress,()=>getSyncProgress(scope),()=>null);
 if(!state)return null;
 return <aside className={`field-sync-progress field-sync-${state.phase}`} aria-live="polite"><strong>{name(state.stopId)}</strong><span><T text={state.phase==='uploading'?`Uploading photo ${state.photo} of ${state.photos}`:state.phase==='confirming'?'Confirming visit':state.phase==='synced'?'Synced':'Failed — saved on device'}/>{state.phase==='uploading'?` · ${state.percent}%`:''}</span>{state.phase==='uploading'&&state.percent===99&&<small><T text="Waiting for secure storage confirmation"/></small>}{state.phase==='uploading'&&<progress aria-label="Photo upload progress" value={state.percent} max={100}/>}</aside>;
}
