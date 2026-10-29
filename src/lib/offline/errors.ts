/** Storage failures must never imply that a draft/photo was saved. */
export function deviceStorageError(cause: unknown): Error {
 const name = cause && typeof cause === 'object' && 'name' in cause ? String(cause.name) : '';
 if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return new Error('Device storage is full. This change was not saved. Keep this visit open, reconnect and synchronize existing work before adding more photos. Do not clear app data.');
 return cause instanceof Error ? cause : new Error('Device storage is unavailable. Keep this visit open and reconnect.');
}
