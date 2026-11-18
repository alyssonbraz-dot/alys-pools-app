/** Wait for this registration, never navigator.serviceWorker.ready from a broader scope. */
export function scopedWorkerReady(registration:ServiceWorkerRegistration,timeoutMs=20000):Promise<ServiceWorker>{
 if(registration.active?.state==='activated')return Promise.resolve(registration.active);
 const worker=registration.installing??registration.waiting??registration.active;
 if(!worker)return Promise.reject(new Error('Offline resources are incomplete. Reconnect and check installation in Settings.'));
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{clearTimeout(timer);worker.removeEventListener('statechange',changed);};
  function changed(){if(worker!.state==='activated'){cleanup();resolve(worker!);}else if(worker!.state==='redundant'){cleanup();reject(new Error('Offline resources are incomplete. Reconnect and check installation in Settings.'));}}
  const timer=setTimeout(()=>{cleanup();reject(new Error('Offline resources are incomplete. Reconnect and check installation in Settings.'));},timeoutMs);
  worker.addEventListener('statechange',changed);changed();
 });
}
