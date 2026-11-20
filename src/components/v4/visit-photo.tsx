'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/design/icon';
import { useLanguage } from '@/components/i18n';
import { compressPhoto, snapshotPhoto } from '@/lib/field/photos';
import { getVisitPhoto, saveVisitPhoto } from '@/lib/v4/visit-photo';
import './visit-photo.css';

type Props = {
  userId:string; orgId:string; stopId:string; visitId?:string; readOnly:boolean;
  onBusy:(busy:boolean)=>void;
};

export function VisitPhoto({userId,orgId,stopId,visitId,readOnly,onBusy}:Props) {
  const {t} = useLanguage();
  const [preview,setPreview] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const current = useRef('');
  const photoVersion = useRef<symbol | null>(null);
  function show(blob:Blob | null) {
    URL.revokeObjectURL(current.current);
    current.current = blob ? URL.createObjectURL(blob) : '';
    setPreview(current.current);
  }

  useEffect(() => {
    const version = Symbol();
    photoVersion.current = version;
    const controller = new AbortController();
    async function restore() {
      let photo = await getVisitPhoto({userId,orgId},stopId);
      if (!photo && readOnly && visitId) {
        const response = await fetch('/api/v4/photos?visit='+encodeURIComponent(visitId),{
          cache:'no-store',signal:controller.signal,headers:{'X-ALYS-User-ID':userId,'X-ALYS-Organization-ID':orgId},
        });
        if (response.ok) photo = await response.blob();
        else if (response.status !== 404) throw new Error('Reconnect to load the service photo.');
      }
      if (version === photoVersion.current) show(photo);
    }
    restore().catch(() => {
      if (version === photoVersion.current) setError('Unable to load the service photo.');
    });
    return () => {
      photoVersion.current = null;
      controller.abort();
      URL.revokeObjectURL(current.current);
      current.current = '';
    };
  },[userId,orgId,stopId,readOnly,visitId]);

  async function capture(file:File) {
    const version = Symbol();
    photoVersion.current = version;
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      const photo = await compressPhoto(await snapshotPhoto(file));
      await saveVisitPhoto({userId,orgId},stopId,photo);
      if (version === photoVersion.current) show(photo);
    } catch {
      if (version === photoVersion.current) setError('Photo could not be saved. Choose the image again.');
    } finally {
      if (version === photoVersion.current) setBusy(false);
      onBusy(false);
    }
  }

  return <section className="v4v-card">
    <h2>{t('Service photo')}</h2>
    <div className="v4v-inset v4-photo">
      {preview && <Image unoptimized className="v4-photo-preview" src={preview} width={320} height={180} alt={t('Service photo')}/>}
      {readOnly && !preview && !error && <p>{t('No service photo')}</p>}
      {!readOnly && <div className="v4-photo-actions">{(['camera','library'] as const).map(source =>
        <label key={source} className="v4-photo-picker">
          <Icon name={source === 'camera' ? 'camera' : 'plus'}/>
          {t(source === 'camera' ? 'Camera' : 'Photo library')}
          <input type="file" aria-label={t(source === 'camera' ? 'Take service photo' : 'Choose service photo')}
            accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
            capture={source === 'camera' ? 'environment' : undefined} disabled={busy}
            onChange={event => {const file=event.target.files?.[0];if(file)void capture(file);event.target.value='';}}/>
        </label>)}</div>}
      {busy && <p role="status">{t('Saving photo…')}</p>}
      {error && <p role="alert">{t(error)}</p>}
    </div>
  </section>;
}
