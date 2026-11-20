import { deviceStorageError } from '@/lib/offline/errors';

const keys = ['orgId', 'userId', 'date', 'stopId'];
const databaseName = 'alys-v4-field';
let connection: Promise<IDBDatabase> | undefined;

function openDatabase() {
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open(databaseName, 1);
      opening.onupgradeneeded = () => {
        const db = opening.result;
        db.createObjectStore('drafts', { keyPath: keys });
        db.createObjectStore('photos', { keyPath: ['orgId', 'userId', 'stopId'] });
        const visits = db.createObjectStore('visits', { keyPath: keys });
        visits.createIndex('account', keys.slice(0, 2));
        visits.createIndex('day', keys.slice(0, 3));
        visits.createIndex('acknowledgedAt', 'acknowledgedAt');
      };
      opening.onerror = () => reject(deviceStorageError(opening.error));
      opening.onsuccess = () => {
        const db = opening.result;
        db.onversionchange = () => { connection = undefined; db.close(); };
        db.onclose = () => { connection = undefined; };
        resolve(db);
      };
    }).catch(error => { connection = undefined; throw error; });
  }
  return connection;
}

// Enqueue IndexedDB requests synchronously from the transaction or its request callbacks.
// In particular, resolve writes only after commit; iOS may suspend the tab at any time.
export async function deviceTransaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  start: (tx: IDBTransaction, result: (value: T) => void) => void
): Promise<T> {
  const db = await openDatabase();
  let tx: IDBTransaction;
  try {
    tx = db.transaction(stores, mode);
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'InvalidStateError') throw error;
    connection = undefined;
    tx = (await openDatabase()).transaction(stores, mode);
  }
  return new Promise<T>((resolve, reject) => {
    let value: T;
    tx.oncomplete = () => resolve(value);
    tx.onabort = () => reject(deviceStorageError(tx.error));
    start(tx, result => { value = result; });
  });
}
