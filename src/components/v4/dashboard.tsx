'use client';

import { Icon } from '@/components/design/icon';
import { useLanguage } from '@/components/i18n';
import { addServiceDays } from '@/lib/service-time';
import { directionsUrl } from '@/lib/v4/directions';
import type { Stop } from '@/lib/v4/types';

export function Week({ day, onDay, busy }: { day: string; onDay: (day: string) => void; busy: boolean }) {
  const {language,t} = useLanguage();
  const sunday = addServiceDays(day, -new Date(day + 'T12:00:00Z').getUTCDay());
  return <div className="v4-week" aria-label={t('Week')}>
    {Array.from({length:7}, (_, index) => {
      const date = addServiceDays(sunday, index);
      const instant = new Date(date + 'T12:00:00Z');
      return <button key={date} disabled={busy} aria-pressed={day === date}
        aria-label={instant.toLocaleDateString(language, { dateStyle:'full', timeZone:'UTC' })}
        onClick={() => onDay(date)}>
        <small>{instant.toLocaleDateString(language, {weekday:'short', timeZone:'UTC'})}</small>
        <strong>{instant.getUTCDate()}</strong>
      </button>;
    })}
  </div>;
}

export function ProgressCard({stops, technician}: {stops:Stop[]; technician:string}) {
  const {t} = useLanguage();
  const completed = stops.filter(stop => stop.completedAt).length;
  const percent = stops.length ? Math.round(completed * 100 / stops.length) : 0;
  return <section className="v4-progress v4-card" aria-label={t('Route progress')}>
    <div className="v4-ring" style={{background:`conic-gradient(var(--v4-blue) ${percent}%, #e5edf0 0)`}}>
      <div><strong>{completed}<span>/{stops.length}</span></strong><small>{t('stops')}</small></div>
    </div>
    <div className="v4-progress-copy">
      <div className="v4-overline">{t('Assigned technician')}</div>
      <h2>{technician}</h2>
      <div className="v4-meter"><i style={{width: percent+'%'}} /></div>
      <div className="v4-progress-count"><span>{percent}% {t('complete')}</span><span>{stops.length-completed} {t('left')}</span></div>
    </div>
  </section>;
}

export function NextStop({stop,onOpen}: {stop:Stop; onOpen:()=>void}) {
  const {t} = useLanguage();
  return <section className="v4-next">
    <div className="v4-next-copy">
      <div className="v4-overline"><i/> {t('Next stop')} <span>/ {String(stop.position).padStart(2,'0')}</span></div>
      <h2>{stop.name}</h2><p><Icon name="pin" width="15" height="15"/>{stop.address}</p>
    </div>
    <div className="v4-next-actions">
      <button className="v4-primary" onClick={onOpen}>{t('Start visit')} <Icon name="arrow" width="18"/></button>
      <a className="v4-directions" href={directionsUrl(stop)} target="_blank" rel="noreferrer"><Icon name="route" width="17"/>{t('Directions')}</a>
    </div>
  </section>;
}

export function StopsList({stops,onOpen}: {stops:Stop[];onOpen:(stop:Stop)=>void}) {
  const {language,t} = useLanguage();
  const next = stops.find(stop => !stop.completedAt);
  return <ol className="v4-stops">
    {stops.map(stop => <li key={stop.id}>
      <button className={'v4-stop'+(stop.completedAt?' done':stop===next?' next':'')} onClick={()=>onOpen(stop)}>
        <span className="v4-number">{stop.completedAt?<Icon name="check" width="18"/>:String(stop.position).padStart(2,'0')}</span>
        <span className="v4-stop-text"><strong>{stop.name}</strong><small>{stop.address}</small></span>
        <span className="v4-stop-trailing">{stop.completedAt ?
          (Number.isFinite(Date.parse(stop.completedAt))?new Date(stop.completedAt).toLocaleTimeString(language,{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}):t('Saved')) :
          stop===next?t('Up next'):null}<Icon name="chevron" width="15"/></span>
      </button>
    </li>)}
  </ol>;
}
