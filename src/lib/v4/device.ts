import { deviceTransaction } from './device-db';
import { freezeVisitPhoto, releaseVisitPhoto, sendVisitPhoto } from './visit-photo';
import type { RouteDay, VisitInput } from './types';

export type DeviceScope = { userId: string; orgId: string };
export type SyncStatus = { pending: number; blocked: number; message: string | null };

type StoredVisit = DeviceScope & {
  date: string;
  stopId: string;
  visit: VisitInput;
  state: 'pending' | 'blocked' | 'acknowledged';
  message: string | null;
  acknowledgedAt?: number;
};

function stopKey(scope: DeviceScope, date: string, stopId: string) {
  return [scope.orgId, scope.userId, date, stopId];
}

export function readDraft<T>(scope: DeviceScope, date: string, stopId: string) {
  return deviceTransaction<T | null>(['drafts'], 'readonly', (tx, result) => {
    const request = tx.objectStore('drafts').get(stopKey(scope, date, stopId));
    request.onsuccess = () => result(request.result?.data ?? null);
  });
}

const closedStopMessage = 'This stop was completed in another tab. Return to the route to review it.';

export async function saveDraft<T>(scope: DeviceScope, date: string, stopId: string, data: T) {
  const saved = await deviceTransaction<boolean>(['visits', 'drafts'], 'readwrite', (tx, result) => {
    const key = stopKey(scope, date, stopId);
    const drafts = tx.objectStore('drafts');
    const draft = drafts.get(key);
    const visit = tx.objectStore('visits').getKey(key);
    visit.onsuccess = () => {
      if (visit.result || draft.result?.completionDigest) return result(false);
      drafts.put({ ...scope, date, stopId, data });
      result(true);
    };
  });
  if (!saved) throw new Error(closedStopMessage);
}

const events = new EventTarget();
let channel: BroadcastChannel | undefined;
function scopeId(scope: DeviceScope) { return JSON.stringify([scope.orgId, scope.userId]); }
function deviceChannel() {
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' && !channel) {
    channel = new BroadcastChannel('alys-v4-field-changes');
    channel.onmessage = event => {
      if (typeof event.data === 'string') events.dispatchEvent(new Event(event.data));
    };
  }
  return channel;
}
function changed(scope: DeviceScope) {
  const name = scopeId(scope);
  events.dispatchEvent(new Event(name));
  deviceChannel()?.postMessage(name);
}
export function watchDevice(scope: DeviceScope, callback: () => void) {
  deviceChannel();
  const name = scopeId(scope);
  events.addEventListener(name, callback);
  return () => events.removeEventListener(name, callback);
}

// JSON object key order can vary between a local draft and a restored payload.
function canonicalVisit(visit: VisitInput) {
  return JSON.stringify(visit, (_, value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  });
}

export async function queueVisit(scope: DeviceScope, date: string, visit: VisitInput) {
  if (date !== visit.date) throw new Error('The visit date does not match the route.');
  const payload = canonicalVisit(visit);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');

  const outcome = await deviceTransaction<'saved' | 'retry' | 'conflict'>(['visits', 'drafts', 'photos'], 'readwrite', (tx, result) => {
    const store = tx.objectStore('visits');
    const drafts = tx.objectStore('drafts');
    const key = stopKey(scope, date, visit.stopId);
    const draft = drafts.get(key);
    const check = store.get(key);
    check.onsuccess = () => {
      const previous: StoredVisit | undefined = check.result;
      if (previous && canonicalVisit(previous.visit) !== payload) return result('conflict');
      if (draft.result?.completionDigest) return result(draft.result.completionDigest === digest ? 'retry' : 'conflict');
      // Replace the draft with a small receipt; stale tabs cannot resurrect it
      // even after the server confirms the visit and the local payload is removed.
      drafts.put({ ...scope, date, stopId: visit.stopId, completionDigest: digest });
      if (previous) return result('retry');
      const row: StoredVisit = { ...scope, date, stopId: visit.stopId, visit, state: 'pending', message: null };
      store.add(row);
      freezeVisitPhoto(tx, scope, visit);
      result('saved');
    };
  });
  if (outcome === 'conflict') throw new Error(closedStopMessage);
  if (outcome === 'saved') changed(scope);
}

function storedVisits(scope: DeviceScope, date?: string) {
  return deviceTransaction<StoredVisit[]>(['visits'], 'readonly', (tx, result) => {
    const index = tx.objectStore('visits').index(date === undefined ? 'account' : 'day');
    const key = [scope.orgId, scope.userId];
    if (date !== undefined) key.push(date);
    const request = index.getAll(key);
    request.onsuccess = () => result(request.result);
  });
}
export async function listLocalVisits(scope: DeviceScope, date: string) {
  return (await storedVisits(scope, date)).map(row => row.visit);
}

export async function reconcileRoute(scope: DeviceScope, route: RouteDay) {
  const confirmed = new Map(route.stops.map(stop => [stop.id, stop.visit?.id]));
  const removed = await deviceTransaction<boolean>(['visits'], 'readwrite', (tx, result) => {
    const store = tx.objectStore('visits');
    const scan = store.index('day').openCursor([scope.orgId, scope.userId, route.date]);
    scan.onsuccess = () => {
      const cursor = scan.result;
      if (!cursor) return;
      const row: StoredVisit = cursor.value;
      if (row.state === 'acknowledged' && confirmed.get(row.stopId) === row.visit.id) {
        cursor.delete();
        result(true);
      }
      cursor.continue();
    };
    // A confirmed visit from another date need not live permanently on a shared device.
    const expired = store.index('acknowledgedAt').openCursor(IDBKeyRange.upperBound(Date.now() - 86_400_000));
    expired.onsuccess = () => {
      const cursor = expired.result;
      if (!cursor) return;
      if (cursor.value.orgId === scope.orgId && cursor.value.userId === scope.userId) {
        cursor.delete();
        result(true);
      }
      cursor.continue();
    };
  });
  if (removed) changed(scope);
}

export async function getSyncStatus(scope: DeviceScope): Promise<SyncStatus> {
  const outstanding = (await storedVisits(scope)).filter(row => row.state !== 'acknowledged');
  return {
    pending: outstanding.length,
    blocked: outstanding.filter(row => row.state === 'blocked').length,
    message: outstanding.find(row => row.message)?.message ?? null,
  };
}

async function updateAfterAttempt(row: StoredVisit, state: StoredVisit['state'], message: string | null) {
  const updated = await deviceTransaction<boolean>(['visits', 'photos'], 'readwrite', (tx, result) => {
    const store = tx.objectStore('visits');
    const request = store.get(stopKey(row, row.date, row.stopId));
    request.onsuccess = () => {
      const current: StoredVisit | undefined = request.result;
      // A late failure from a second tab must never resurrect confirmed work.
      if (!current || current.visit.id !== row.visit.id || current.state === 'acknowledged') return;
      if (current.state === state && current.message === message) return;
      if (state === 'acknowledged') releaseVisitPhoto(tx, row, row.visit);
      store.put({ ...current, state, message, acknowledgedAt: state === 'acknowledged' ? Date.now() : undefined });
      result(true);
    };
  });
  if (updated) changed(row);
}

async function flush(scope: DeviceScope) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return getSyncStatus(scope);
  for (const row of await storedVisits(scope)) {
    if (row.state === 'acknowledged') continue;
    const controller = new AbortController();
    let timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch('/api/v4/visits', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'X-ALYS-User-ID': scope.userId,
          'X-ALYS-Organization-ID': scope.orgId,
        },
        body: JSON.stringify(row.visit),
        signal: controller.signal,
      });
      if (response.ok) {
        const receipt = await response.json();
        if (receipt?.id !== row.visit.id || (receipt.stopId !== undefined && receipt.stopId !== row.stopId)) {
          throw new Error('Unconfirmed visit');
        }
        clearTimeout(timeout);
        // Cellular photo uploads can outlast a small visit JSON request.
        timeout = setTimeout(() => controller.abort(), 180000);
        const photo = await sendVisitPhoto(scope, row.visit, controller.signal);
        if (photo) response = photo;
      }
    } catch {
      await updateAfterAttempt(row, 'pending', 'Waiting for a connection to confirm the visit.');
      break;
    } finally {
      clearTimeout(timeout);
    }
    if (response.ok) {
      await updateAfterAttempt(row, 'acknowledged', null);
    } else if (response.status === 401) {
      await updateAfterAttempt(row, 'blocked', 'Sign in to the assigned account to sync.');
      break;
    } else if (response.status === 403) {
      // A reassigned stop need not hold up other work that still belongs to this technician.
      await updateAfterAttempt(row, 'blocked', 'Check the assigned account and access to this stop.');
    } else if ([400, 404, 409, 422].includes(response.status)) {
      await updateAfterAttempt(row, 'blocked', 'The server could not accept this visit. Check the route before retrying.');
    } else {
      await updateAfterAttempt(row, 'pending', 'The service is unavailable. Your visit is saved on this device.');
      break;
    }
  }
  return getSyncStatus(scope);
}

const running = new Map<string, Promise<SyncStatus>>();
export function flushVisits(scope: DeviceScope): Promise<SyncStatus> {
  const key = scopeId(scope);
  const active = running.get(key);
  if (active) return active;
  const sync = flush(scope).finally(() => running.delete(key));
  running.set(key, sync);
  return sync;
}
