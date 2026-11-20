import { deviceTransaction } from './device-db';
import type { DeviceScope } from './device';
import type { VisitInput } from './types';

type LocalPhoto = DeviceScope & {stopId:string; visitId:string | null; blob:Blob | null};
const key = (scope:DeviceScope, stopId:string) => [scope.orgId,scope.userId,stopId];

export function getVisitPhoto(scope:DeviceScope, stopId:string) {
  return deviceTransaction<Blob | null>(['photos'],'readonly',(tx,result) => {
    const read = tx.objectStore('photos').get(key(scope,stopId));
    read.onsuccess = () => result((read.result as LocalPhoto | undefined)?.blob ?? null);
  });
}

export async function saveVisitPhoto(scope:DeviceScope, stopId:string, blob:Blob) {
  const saved = await deviceTransaction<boolean>(['photos'],'readwrite',(tx,result) => {
    const store = tx.objectStore('photos');
    const read = store.get(key(scope,stopId));
    read.onsuccess = () => {
      if (read.result?.visitId) return result(false);
      store.put({...scope,stopId,visitId:null,blob} satisfies LocalPhoto);
      result(true);
    };
  });
  if (!saved) throw new Error('This visit was already completed.');
}

// Executed inside the same IndexedDB transaction as the corresponding outbox change.
export function freezeVisitPhoto(tx:IDBTransaction,scope:DeviceScope,visit:VisitInput) {
  const store = tx.objectStore('photos');
  const read = store.get(key(scope,visit.stopId));
  read.onsuccess = () => {
    if (read.result?.visitId && read.result.visitId !== visit.id) { tx.abort(); return; }
    store.put({...scope, stopId:visit.stopId, visitId:visit.id, blob:read.result?.blob ?? null} satisfies LocalPhoto);
  };
}

export function releaseVisitPhoto(tx:IDBTransaction,scope:DeviceScope,visit:VisitInput) {
  const store = tx.objectStore('photos');
  const read = store.get(key(scope,visit.stopId));
  read.onsuccess = () => {
    if (read.result?.visitId === visit.id) store.delete(key(scope,visit.stopId));
  };
}

export async function sendVisitPhoto(scope:DeviceScope,visit:VisitInput,signal?:AbortSignal) {
  const photo = await deviceTransaction<LocalPhoto | undefined>(['photos'],'readonly',(tx,result) => {
    const read = tx.objectStore('photos').get(key(scope,visit.stopId));
    read.onsuccess = () => result(read.result);
  });
  if (!photo?.blob) return null;
  if (photo.visitId !== visit.id) throw new Error('Photo belongs to another visit.');
  const response = await fetch('/api/v4/photos?visit='+encodeURIComponent(visit.id), {
    method:'POST',body:photo.blob,signal,cache:'no-store',redirect:'error',
    headers:{'Content-Type':'image/jpeg','X-ALYS-User-ID':scope.userId,'X-ALYS-Organization-ID':scope.orgId},
  });
  if (response.ok) {
    const receipt = await response.json();
    if (receipt?.saved !== true || receipt.visitId !== visit.id) throw new Error('Photo upload is unconfirmed.');
  }
  return response;
}
