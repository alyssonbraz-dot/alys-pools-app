import type {OfflineScope} from './store';
export type SyncProgress={stopId:string;phase:'uploading'|'confirming'|'synced'|'failed';photo:number;photos:number;percent:number};
const state=new Map<string,SyncProgress>();
const listeners=new Set<()=>void>();
const key=(scope:OfflineScope)=>`${scope.organizationId}:${scope.userId}`;
export function getSyncProgress(scope:OfflineScope){return state.get(key(scope))??null;}
export function subscribeSyncProgress(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function publishSyncProgress(scope:OfflineScope,progress:SyncProgress){state.set(key(scope),progress);listeners.forEach(fn=>fn());}
export function clearSyncProgress(){state.clear();listeners.forEach(fn=>fn());}
