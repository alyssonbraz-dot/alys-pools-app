'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Icon } from '@/components/design/icon';
import { useLanguage } from '@/components/i18n';
import './add-stop.css';

type Props = {
  date: string;
  userId: string;
  orgId: string;
  onAdded: () => void;
  onCancel: () => void;
};

export function AddStop({ date, userId, orgId, onAdded, onCancel }: Props) {
  const { t, language } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef('');
  const inFlight = useRef(false);
  const dateLabel = new Intl.DateTimeFormat(language, {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(date + 'T12:00:00Z'));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const fields = new FormData(event.currentTarget);
    inFlight.current = true;
    setError('');
    setBusy(true);
    try {
      requestId.current ||= crypto.randomUUID();
      const response = await fetch('/api/v4/stops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-ALYS-User-ID': userId, 'X-ALYS-Organization-ID': orgId },
        body: JSON.stringify({
          id: requestId.current, date, name: fields.get('name'), address: fields.get('address'),
          kind: fields.get('kind'), gallons: fields.get('gallons') ? Number(fields.get('gallons')) : null,
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? 'Could not add the stop. Try again.');
      }
      onAdded();
    } catch (cause) {
      setError(cause instanceof TypeError ? 'Connect to the internet and try again.' : cause instanceof Error ? cause.message : 'Could not add the stop.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <form className="v4-add-stop" onSubmit={submit}>
    <header><div><h2>{t('Add stop')}</h2><p>{dateLabel}</p></div>
      <button className="v4-add-close" type="button" onClick={onCancel} disabled={busy} aria-label={t('Cancel')}><Icon name="close"/></button>
    </header>
    <label>{t('Customer name')}<input name="name" autoComplete="off" maxLength={120} required/></label>
    <label>{t('Service address')}<input name="address" autoComplete="off" maxLength={320} required/></label>
    <div className="v4-add-body">
      <label>{t('Water body')}<select name="kind" defaultValue="pool"><option value="pool">{t('Pool')}</option><option value="spa">{t('Spa')}</option></select></label>
      <label>{t('Gallons (optional)')}<input name="gallons" type="number" inputMode="numeric" min="1" max="100000000" step="1"/></label>
    </div>
    {error && <p className="v4-add-error" role="alert">{t(error)}</p>}
    <button className="v4-add-submit" disabled={busy} type="submit">{t(busy ? 'Saving…' : 'Add to route')}<Icon name="arrow"/></button>
  </form>;
}
