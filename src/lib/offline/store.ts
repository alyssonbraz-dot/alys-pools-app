import {deviceStorageError} from './errors';
import {publishSyncProgress,clearSyncProgress} from './progress';
import {uploadPhoto} from './upload';
import type { CompletionPayload, RouteData } from '@/lib/field/types';

export type OfflineScope = { userId: string; organizationId: string };
export type LocalPhoto = { id: string; stop_id: string; pool_id?:string; blob: Blob; path?: string; created_at: string };
export type QueueItem = {
  id: string;
  payload: CompletionPayload;
  status: 'pending' | 'failed' | 'auth_required';
  error?: string;
  http_status?: number;
  attempts?:number;
  next_retry_at?:string;
  updated_at: string;
};
export type SyncResult = {
  synced: number;
  pending: number;
  authRequired: boolean;
  completions: { visit_id: string; stop_id: string; next_stop_id: string | null }[];
};

type RecordValue = { key: string; value: unknown };
const DATABASE = 'alys-field-device-v1';
const STORE = 'records';
let connection: Promise<IDBDatabase> | undefined;
const running = new Map<string, Promise<SyncResult>>();
const runningControllers = new Map<string, AbortController>();

let deviceChannel: BroadcastChannel | undefined;
function logoutChannel() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return undefined;
  if (!deviceChannel) {
    deviceChannel = new BroadcastChannel('alys-device-events');
    deviceChannel.onmessage = event => {
      if (event.data?.type === 'clear-device') runningControllers.forEach(controller => controller.abort());
    };
  }
  return deviceChannel;
}

function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Device storage is unavailable. Keep this visit open and reconnect.'));
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
    request.onerror = () => { connection = undefined; reject(request.error); };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); connection = undefined; };
      resolve(request.result);
    };
  });
  return connection;
}
function prefix(scope: OfflineScope) {
  return `${encodeURIComponent(scope.organizationId)}:${encodeURIComponent(scope.userId)}:`;
}
function scopeKey(scope: OfflineScope, kind: string, id = '') { return `${prefix(scope)}${kind}:${id}`; }
async function read<T>(key: string): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as RecordValue | undefined)?.value as T | undefined);
    req.onerror = () => reject(req.error);
  });
}
async function write(key: string, value: unknown) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(deviceStorageError(tx.error));
    tx.onabort = () => reject(deviceStorageError(tx.error ?? new Error('Device storage was interrupted.')));
  });
}
async function writeScoped(scope: OfflineScope, key: string, value: unknown,unlockedStop?:string,remove=false) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const records = tx.objectStore(STORE);
    const commit=()=>{if(remove)records.delete(key);else records.put({key,value});};
    const active = records.get('active-scope');
    let failure: Error | undefined;
    active.onsuccess = () => {
      const identity = (active.result as RecordValue | undefined)?.value as OfflineScope | undefined;
      if (identity?.userId !== scope.userId || identity.organizationId !== scope.organizationId) {
        failure = new Error('The active account changed. Reconnect and sign in before saving local changes.');
        tx.abort(); return;
      }
      if(unlockedStop){const queued=records.get(scopeKey(scope,'queue',unlockedStop));queued.onsuccess=()=>{if(queued.result){failure=new Error('This visit is already queued. Its saved submission is read-only.');tx.abort();}else commit();};}
      else commit();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(deviceStorageError(tx.error));
    tx.onabort = () => reject(deviceStorageError(failure ?? tx.error ?? new Error('Device save was interrupted.')));
  });
}
async function entries<T>(keyPrefix: string): Promise<{ key: string; value: T }[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll(IDBKeyRange.bound(keyPrefix, `${keyPrefix}\uffff`));
    req.onsuccess = () => resolve(req.result as { key: string; value: T }[]);
    req.onerror = () => reject(req.error);
  });
}
function changed() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('alys-device-change'));
}
export async function setActiveScope(scope: OfflineScope) {
  if (!scope.userId || !scope.organizationId) throw new Error('A verified account is required for device storage.');
  await write('active-scope', scope);
}
export async function getActiveScope(): Promise<OfflineScope | null> { return (await read<OfflineScope>('active-scope')) ?? null; }
export async function getDeviceEpoch(): Promise<string> {
  return (await read<string>('device-epoch')) ?? 'initial';
}
export async function cacheRoute(scope: OfflineScope, route: RouteData, expectedEpoch?: string) {
  if (scope.userId !== route.userId || scope.organizationId !== route.orgId) throw new Error('Route account does not match device storage.');
  const epoch = expectedEpoch ?? await getDeviceEpoch();
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const records = tx.objectStore(STORE);
    const request = records.get('device-epoch');
    let failure: Error | undefined;
    request.onsuccess = () => {
      const current = ((request.result as RecordValue | undefined)?.value as string | undefined) ?? 'initial';
      if (current !== epoch) {
        failure = new Error('This route request belongs to an account session that was signed out.');
        tx.abort(); return;
      }
      records.put({key:scopeKey(scope,'route',route.date+(route.timeZone&&route.timeZone!=='America/New_York'?'@'+route.timeZone:'')),value:route});
      records.put({key:scopeKey(scope,'latest-route'),value:route.date+(route.timeZone&&route.timeZone!=='America/New_York'?'@'+route.timeZone:'')});
      records.put({key:'active-scope',value:scope});
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(deviceStorageError(tx.error));
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('Route cache was interrupted.'));
  });
}
export async function getCachedRoute(scope: OfflineScope, date?: string,timeZone='America/New_York'): Promise<RouteData | null> {
  const selected = (date?date+(timeZone!=='America/New_York'?'@'+timeZone:''):undefined) ?? await read<string>(scopeKey(scope, 'latest-route'));
  return selected ? (await read<RouteData>(scopeKey(scope, 'route', selected))) ?? null : null;
}
export async function saveDraft(scope: OfflineScope, draft: CompletionPayload) {
  await writeScoped(scope,scopeKey(scope, 'draft', draft.stop_id), draft,draft.stop_id);
  changed();
}
export async function getDraft(scope: OfflineScope, stopId: string): Promise<CompletionPayload | null> {
  return (await read<CompletionPayload>(scopeKey(scope, 'draft', stopId))) ?? null;
}
export async function savePhoto(scope: OfflineScope, stopId: string, blob: Blob, poolId?:string): Promise<LocalPhoto> {
  const current = await listPhotos(scope, stopId);
  if (current.length >= 3) throw new Error('A visit can have up to three photos.');
  const photo: LocalPhoto = { id: crypto.randomUUID(), stop_id: stopId, pool_id:poolId, blob, created_at: new Date().toISOString() };
  await writeScoped(scope,scopeKey(scope, 'photo', photo.id), photo,stopId);
  changed();
  return photo;
}
export async function listPhotos(scope: OfflineScope, stopId: string): Promise<LocalPhoto[]> {
  return (await entries<LocalPhoto>(scopeKey(scope, 'photo'))).map(x => x.value).filter(photo => photo.stop_id === stopId).sort((a,b) => a.created_at.localeCompare(b.created_at));
}
export async function removePhoto(scope: OfflineScope, photoId: string) {
  const key=scopeKey(scope,'photo',photoId);const photo=await read<LocalPhoto>(key);
  if(photo)await writeScoped(scope,key,undefined,photo.stop_id,true);changed();
}
export async function enqueueCompletion(scope: OfflineScope, payload: CompletionPayload) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const records = tx.objectStore(STORE);
    const key = scopeKey(scope, 'queue', payload.stop_id);
    const active = records.get('active-scope');
    let failure: Error | undefined;
    active.onsuccess = () => {
      const identity = (active.result as RecordValue | undefined)?.value as OfflineScope | undefined;
      if(identity?.userId!==scope.userId || identity.organizationId!==scope.organizationId) { failure=new Error('Account changed before this visit could be queued.');tx.abort(); }
    };
    const request = records.get(key);
    request.onsuccess = () => {
      if(failure)return;
      const existing = (request.result as RecordValue | undefined)?.value as QueueItem | undefined;
      // One atomic read/write per stop, even when two tabs complete simultaneously.
      const stablePayload = existing ? existing.payload : payload;
      const item: QueueItem = existing??{ id: stablePayload.id, payload: stablePayload, status: 'pending', updated_at: new Date().toISOString() };
      records.put({ key, value:item });
      records.put({ key:scopeKey(scope, 'draft', payload.stop_id), value:stablePayload });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(deviceStorageError(tx.error));
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('Queue save was interrupted.'));
  });
  changed();
}
/** Only an explicit validation rejection proves the server transaction did not commit. */
export async function releaseRejectedCompletion(scope: OfflineScope, stopId: string) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const records = tx.objectStore(STORE);
    const key = scopeKey(scope, 'queue', stopId);
    const request = records.get(key);
    let failure: Error | undefined;
    request.onsuccess = () => {
      const item = (request.result as RecordValue | undefined)?.value as QueueItem | undefined;
      if (!item || item.http_status !== 422) {
        failure = new Error('Only a visit rejected by server validation can be edited. Retry synchronization for other failures.');
        tx.abort(); return;
      }
      // The original ID, timestamp, draft and photos are preserved for an auditable retry.
      records.delete(key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(deviceStorageError(tx.error));
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('Unable to unlock the rejected visit.'));
  });
  changed();
}
export async function getQueue(scope: OfflineScope): Promise<QueueItem[]> {
  return (await entries<QueueItem>(scopeKey(scope, 'queue'))).map(x => x.value).sort((a,b) => a.updated_at.localeCompare(b.updated_at));
}
export async function getLocalWorkCount() {
  const all = await entries<unknown>('');
  return { drafts: all.filter(x => x.key.includes(':draft:')).length, pending: all.filter(x => x.key.includes(':queue:')).length };
}
export async function clearDeviceData() {
  logoutChannel()?.postMessage({type:'clear-device'});
  // Abort our in-flight requests and drain their catch/finally writes before erasing.
  runningControllers.forEach(controller => controller.abort());
  await Promise.allSettled([...running.values()]);
  const clear = async () => {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const records = tx.objectStore(STORE);
      records.clear();
      // A nonpersonal tombstone prevents an older route request from recaching data after logout.
      records.put({key:'device-epoch',value:crypto.randomUUID()});
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(deviceStorageError(tx.error));
    });
  };
  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request('alys-device-state',{mode:'exclusive'},clear);
  } else await clear();
  clearSyncProgress();
  changed();
}

async function confirmLocalCompletion(scope: OfflineScope, item: QueueItem, photos: LocalPhoto[]) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const records = tx.objectStore(STORE);
    const routePrefix = scopeKey(scope, 'route');
    const request = records.getAll(IDBKeyRange.bound(routePrefix, `${routePrefix}\uffff`));
    request.onsuccess = () => {
      for (const cached of request.result as {key:string;value:RouteData}[]) {
        if (cached.value.stops.some(stop => stop.id === item.payload.stop_id)) {
          cached.value.stops = cached.value.stops.map(stop => stop.id === item.payload.stop_id ? {...stop,status:'completed'} : stop);
          records.put(cached);
        }
      }
    };
    records.delete(scopeKey(scope, 'queue', item.payload.stop_id));
    records.delete(scopeKey(scope, 'draft', item.payload.stop_id));
    photos.forEach(photo => records.delete(scopeKey(scope, 'photo', photo.id)));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(deviceStorageError(tx.error));
    tx.onabort = () => reject(tx.error ?? new Error('Visit was saved on the server, but device confirmation was interrupted. Retry safely.'));
  });
}

class ApiFailure extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try { const body = await response.json(); if (typeof body.error === 'string') message = body.error; } catch { /* Keep bounded generic message. */ }
    throw new ApiFailure(message, response.status);
  }
  return response.json() as Promise<T>;
}
async function networkJson<T>(input: RequestInfo | URL, init: RequestInit, signal: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if(signal.aborted)controller.abort();
  else signal.addEventListener('abort',abort,{once:true});
  const timeout = setTimeout(abort,20_000);
  try { return await responseJson<T>(await fetch(input,{...init,signal:controller.signal})); }
  finally { clearTimeout(timeout);signal.removeEventListener('abort',abort); }
}
async function performSync(scope: OfflineScope, signal: AbortSignal,automatic=false): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, pending: 0, authRequired: false, completions: [] };
  const queue = await getQueue(scope);
  const due=(item:QueueItem)=>!automatic||(![409,422].includes(item.http_status??0)&&(!item.next_retry_at||Date.parse(item.next_retry_at)<=Date.now()));
  if (!queue.length) return result;
  if(!queue.some(due))return {...result,pending:queue.length};
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { ...result, pending: queue.length };
  try {
    // Session identity is verified before uploading a single byte. Stored scope never authorizes a request.
    const route=await networkJson<Pick<RouteData,'userId'|'orgId'>>('/api/session',{cache:'no-store',credentials:'same-origin'},signal);
    if (route.userId !== scope.userId || route.orgId !== scope.organizationId) throw new ApiFailure('Sign in with the account that created these offline visits.', 401);
    const active = await getActiveScope();
    if (active?.userId !== scope.userId || active.organizationId !== scope.organizationId) throw new ApiFailure('The active account changed. Synchronization paused.', 401);
  } catch (error) {
    result.authRequired = error instanceof ApiFailure && (error.status === 401 || error.status === 403);
    return { ...result, pending: queue.length };
  }
  const attempted=new Set<string>();
  let batch=queue.filter(due);
  while(batch.length&&!signal.aborted){
  for (const item of batch) {
    attempted.add(item.payload.stop_id);
    try {
      const photos = await listPhotos(scope, item.payload.stop_id);
      const paths = [...item.payload.photo_paths];
      for (const [index,photo] of photos.entries()) {
        if (!photo.path) {
          const form = new FormData();
          form.set('stop_id', item.payload.stop_id);
          form.set('photo_id', photo.id);
          form.set('file', photo.blob, `${photo.id}.jpg`);
          const progress=(percent:number)=>publishSyncProgress(scope,{stopId:item.payload.stop_id,phase:'uploading',photo:index+1,photos:photos.length,percent});
          progress(0);
          const {path}=await responseJson<{path:string}>(await uploadPhoto(form,{'X-ALYS-User-ID':scope.userId,'X-ALYS-Organization-ID':scope.organizationId},signal,progress));
          progress(100);
          photo.path = path;
          // Persist each successful upload before continuing; interrupted sync reuses deterministic photo_id.
          await writeScoped(scope,scopeKey(scope, 'photo', photo.id), photo);
        }
        if (!paths.includes(photo.path)) paths.push(photo.path);
      }
      item.payload.photo_paths = paths;
      const mappings={...(item.payload.photo_assignments??{})};for(const photo of photos)if(photo.path&&photo.pool_id)mappings[photo.path]=photo.pool_id;
      if(Object.keys(mappings).length)item.payload.photo_assignments=mappings;
      await writeScoped(scope,scopeKey(scope, 'queue', item.payload.stop_id), item);
      publishSyncProgress(scope,{stopId:item.payload.stop_id,phase:'confirming',photo:photos.length,photos:photos.length,percent:100});
      const saved = await networkJson<{visit_id:string;next_stop_id:string|null}>('/api/visits', {
        method:'POST', headers:{'Content-Type':'application/json','X-ALYS-User-ID':scope.userId,'X-ALYS-Organization-ID':scope.organizationId}, body:JSON.stringify(item.payload), credentials:'same-origin'
      },signal);
      // Remove local blobs only after the server has confirmed the immutable visit transaction.
      await confirmLocalCompletion(scope,item,photos);
      publishSyncProgress(scope,{stopId:item.payload.stop_id,phase:'synced',photo:photos.length,photos:photos.length,percent:100});
      result.synced++;
      result.completions.push({ ...saved, stop_id: item.payload.stop_id });
    } catch (error) {
      const auth = error instanceof ApiFailure && (error.status === 401 || error.status === 403);
      publishSyncProgress(scope,{stopId:item.payload.stop_id,phase:'failed',photo:0,photos:0,percent:0});
      item.attempts=(item.attempts??0)+1;
      item.next_retry_at=new Date(Date.now()+(auth?300000:Math.min(300000,15000*2**Math.min(item.attempts-1,5)))).toISOString();
      item.status = auth ? 'auth_required' : 'failed';
      item.http_status = error instanceof ApiFailure ? error.status : undefined;
      item.error = error instanceof Error ? error.message.slice(0, 240) : 'Synchronization was interrupted. Please retry.';
      try { await writeScoped(scope,scopeKey(scope, 'queue', item.payload.stop_id), item); } catch { break; }
      result.authRequired ||= auth;
      if (auth) break;
    }
  }
  if(result.authRequired)break;
  batch=(await getQueue(scope)).filter(item=>!attempted.has(item.payload.stop_id)&&due(item));
  }
  result.pending = (await getQueue(scope)).length;
  changed();
  return result;
}
export function syncQueue(scope: OfflineScope,options:{automatic?:boolean}={}): Promise<SyncResult> {
  logoutChannel();
  const key = prefix(scope);
  const existing = running.get(key);
  if (existing) return existing;
  const controller = new AbortController();
  runningControllers.set(key,controller);
  const operation = async () => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request(`alys-sync-${key}`, () => performSync(scope,controller.signal,options.automatic));
    }
    return performSync(scope,controller.signal,options.automatic);
  };
  const task = (async () => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request('alys-device-state',{mode:'shared'},operation);
    }
    return operation();
  })().finally(() => {running.delete(key);runningControllers.delete(key);});
  running.set(key, task);
  return task;
}
export const saveRoute = cacheRoute;
export const loadRoute = getCachedRoute;
export const loadDraft = getDraft;
export const listQueue = getQueue;
