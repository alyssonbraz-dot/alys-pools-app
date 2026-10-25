'use client';

import {T} from '@/components/i18n';
import { useEffect, useState } from 'react';

export function Pwa() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('alys-device-events'):null;
    if(channel)channel.onmessage=event=>{if(event.data?.type==='clear-device')window.location.replace('/login');};
    if (!('serviceWorker' in navigator)) return ()=>channel?.close();
    navigator.serviceWorker.register('/sw.js', { scope:'/', updateViaCache:'none' }).then(async registration => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'redundant' && !registration.active) {
          setMessage('The offline app shell could not be installed. Reconnect and reload before field use.');
        }
      });
      const ready = await navigator.serviceWorker.ready;
      ready.active?.postMessage({ type:'WARM_OFFLINE_SHELL' });
    }).catch(() => {
      setMessage('Offline app shell is unavailable. Keep a connection while using this device.');
    });
    // IDB blobs survive reloads; persistent storage is best effort and never claimed as a backup.
    navigator.storage?.persist?.().catch(() => false);
    return ()=>channel?.close();
  }, []);
  return message ? <p role="status" className="notice"><T text={message}/></p> : null;
}
