'use client';
import {T} from '@/components/i18n';
import {useEffect,useState} from 'react';
export function Pwa(){const [state,setState]=useState<'checking'|'ready'|'failed'|'unsupported'>('checking'),[detail,setDetail]=useState(''),[lowStorage,setLowStorage]=useState(false);useEffect(()=>{
 let disposed=false;let registration:ServiceWorkerRegistration|undefined;
 const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('alys-device-events'):null;if(channel)channel.onmessage=e=>{if(e.data?.type==='clear-device')window.location.replace('/login');};
 if(!('serviceWorker' in navigator)){queueMicrotask(()=>{if(!disposed)setState('unsupported');});return()=>channel?.close();}
 function message(event:MessageEvent){if(event.data?.type!=='ALYS_OFFLINE_STATUS'||disposed)return;setState(event.data.ready?'ready':event.data.installing?'checking':'failed');setDetail(event.data.error??'');}
 navigator.serviceWorker.addEventListener('message',message);
 function check(event?:Event){if(event&&!(event.target as HTMLElement)?.closest?.('[data-offline-retry]'))return;setState('checking');registration?.active?.postMessage({type:'WARM_OFFLINE_SHELL'});}
 document.addEventListener('click',check);
 const timeout=setTimeout(()=>{if(!disposed)setState(current=>current==='checking'?'failed':current);},30000);
 navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(async r=>{registration=r;const ready=await navigator.serviceWorker.ready;if(disposed)return;registration=ready;ready.active?.postMessage({type:'CHECK_OFFLINE_STATUS'});ready.active?.postMessage({type:'WARM_OFFLINE_SHELL'});}).catch(()=>{if(!disposed)setState('failed');});
 navigator.storage?.persist?.().catch(()=>false);
 navigator.storage?.estimate?.().then(({quota,usage})=>{if(!disposed&&quota&&usage)setLowStorage(usage/quota>0.9);}).catch(()=>{});
 return()=>{disposed=true;clearTimeout(timeout);channel?.close();navigator.serviceWorker.removeEventListener('message',message);document.removeEventListener('click',check);};
 },[]);return <><div className={'pwa-status pwa-'+state} role="status"><T text={state==='ready'?'Offline shell ready · open your route online before field use':state==='checking'?'Preparing offline app…':state==='unsupported'?'Offline installation is not supported in this browser.':'Offline resources are incomplete. Reconnect and check installation in Settings.'}/>{state==='failed'&&detail&&<details><summary><T text="Installation details"/></summary>{detail}</details>}</div>{lowStorage&&<p className="notice" role="alert"><T text="Device storage is almost full. Reconnect and synchronize pending visits before adding more photos. Do not clear app data."/></p>}</>;}
