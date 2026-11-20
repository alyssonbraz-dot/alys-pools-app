'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/design/icon';
import { useLanguage } from '@/components/i18n';
import { CHEMICAL_UNITS } from '@/lib/chemical-entry';
import { formatDate, formatNumber } from '@/lib/i18n/core';
import { readDraft, saveDraft } from '@/lib/v4/device';
import type { BodyService, Stop, VisitInput, WaterBody } from '@/lib/v4/types';
import { VisitPhoto } from './visit-photo';
import './visit.css';

type Props = {
  stop: Stop;
  userId: string;
  orgId: string;
  date: string;
  onFinish: (input: VisitInput) => Promise<void>;
  onBack: () => void;
};
type Dose = { product: string; amount: string; unit: string };
type BodyDraft = { ph: string; fc: string; alkalinity: string; chemicals: Dose[]; tasks: string[] };
type VisitDraft = { id: string; bodies: Record<string, BodyDraft>; notes: string };
const emptyBody: BodyDraft = { ph: '', fc: '', alkalinity: '', chemicals: [], tasks: [] };
const tasks = ['Skim surface', 'Brush walls', 'Empty baskets'];
const products = Object.keys(CHEMICAL_UNITS).filter(name => name !== 'Other');

function numeric(text: string, max: number) {
  const normalized = text.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value <= max ? value : null;
}

function ReadingInput({ label, unit, presets, value, change }: {
  label: string; unit?: string; presets: number[]; value: string; change: (value: string) => void;
}) {
  const { t } = useLanguage();
  return <div className="v4v-reading">
    <label><span>{t(label)}{unit && <small> {unit}</small>}</span>
      <input type="text" aria-label={t(label)} inputMode="decimal" autoComplete="off"
        placeholder="—" maxLength={8} value={value} onChange={e => change(e.target.value)}/>
    </label>
    {presets.length > 0 && <div className="v4v-chips">{presets.map(n => <button type="button"
      key={n} aria-label={t(label) + ' ' + n} aria-pressed={numeric(value, Infinity) === n}
      onClick={() => change(String(n))}>{n}</button>)}</div>}
  </div>;
}

function WaterBodyDetails({ body }: { body: WaterBody }) {
  const { language, t } = useLanguage();
  return <>
    <details className="v4v-card"><summary>{t('Recent activity')}</summary>
      {body.history.length ? <table className="v4v-table">
        <thead><tr><th>{t('Date')}</th><th>pH</th><th>{t('Free chlorine')} <small>{t('ppm')}</small></th><th>{t('Alkalinity')} <small>{t('ppm')}</small></th></tr></thead>
        <tbody>{body.history.map(row => <tr key={row.date}><th>{formatDate(row.date, language, { month: 'short', day: 'numeric' })}</th>
          <td>{row.ph}</td><td>{row.fc}</td><td>{row.alkalinity ?? '—'}</td></tr>)}</tbody>
      </table> : <p className="v4v-inset">{t('No readings recorded yet.')}</p>}
    </details>
    <details className="v4v-card"><summary>{t(body.kind === 'spa' ? 'Spa info' : 'Pool info')}</summary>
      <dl className="v4v-inset v4v-facts">
        <div><dt>{t('Gallons')}</dt><dd>{body.gallons === null ? '—' : formatNumber(body.gallons, language)}</dd></div>
        <div><dt>{t('Equipment')}</dt><dd>{body.equipment.length ? body.equipment.join(' · ') : t('None listed')}</dd></div>
      </dl>
    </details>
  </>;
}

function Dosages({ doses, change }: { doses: Dose[]; change: (doses: Dose[]) => void }) {
  const { t } = useLanguage();
  function edit(index: number, patch: Partial<Dose>) {
    change(doses.map((dose, i) => i === index ? { ...dose, ...patch } : dose));
  }
  return <details className="v4v-card"><summary>{t('Chemicals')} <span>{doses.length}</span></summary>
    <div className="v4v-inset v4v-stack">
      {doses.map((dose, i) => <div className="v4v-dose" key={i}>
        <label>{t('Product')}<select value={dose.product} onChange={e => edit(i, { product: e.target.value, unit: CHEMICAL_UNITS[e.target.value][0] })}>
          {products.map(product => <option key={product} value={product}>{t(product)}</option>)}</select></label>
        <label>{t('Amount')}<input inputMode="decimal" placeholder="—" maxLength={12} value={dose.amount} onChange={e => edit(i, { amount: e.target.value })}/></label>
        <label>{t('Unit')}<select value={dose.unit} onChange={e => edit(i, { unit: e.target.value })}>
          {CHEMICAL_UNITS[dose.product].map(unit => <option key={unit}>{unit}</option>)}</select></label>
        <button type="button" className="v4v-link" onClick={() => change(doses.filter((_, index) => index !== i))}>{t('Remove')}</button>
      </div>)}
      <button type="button" className="v4v-ghost" disabled={doses.length >= 16}
        onClick={() => change([...doses, { product: products[0], amount: '', unit: CHEMICAL_UNITS[products[0]][0] }])}>
        <Icon name="plus" width={16}/>{t('Add chemical')}
      </button>
    </div>
  </details>;
}

function RecordedBody({ service }: { service: BodyService }) {
  const { t } = useLanguage();
  return <section className="v4v-card"><h2>{t('Visit report')}</h2>
    <dl className="v4v-inset v4v-facts">
      <div><dt>pH</dt><dd>{service.ph}</dd></div><div><dt>{t('Free chlorine')}</dt><dd>{service.fc} {t('ppm')}</dd></div>
      {service.alkalinity !== null && <div><dt>{t('Alkalinity')}</dt><dd>{service.alkalinity} {t('ppm')}</dd></div>}
      <div><dt>{t('Chemicals')}</dt><dd>{service.chemicals.length ? service.chemicals.map(d => t(d.product) + ' · ' + d.amount + ' ' + d.unit).join(', ') : '—'}</dd></div>
      <div><dt>{t('Checklist')}</dt><dd>{service.tasks.map(t).join(' · ') || '—'}</dd></div>
    </dl>
  </section>;
}

export function VisitForm(props: Props) {
  return <VisitEditor key={[props.userId, props.orgId, props.date, props.stop.id].join('/')} {...props}/>;
}

function VisitEditor({ stop, userId, orgId, date, onFinish, onBack }: Props) {
  const { t, language } = useLanguage();
  const [tab, setTab] = useState(stop.bodies[0]?.id ?? 'info');
  const [draft, setDraft] = useState<VisitDraft | null>(null);
  const [status, setStatus] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const finishing = useRef(false);
  const write = useRef<Promise<void>>(Promise.resolve());
  const revision = useRef(0);
  const completed = Boolean(stop.visit || stop.completedAt);
  const body = stop.bodies.find(item => item.id === tab);
  const reading = draft?.bodies[tab] ?? emptyBody;
  const service = stop.visit?.bodies.find(item => item.bodyId === tab);

  useEffect(() => {
    if (completed) return;
    let active = true;
    readDraft<VisitDraft>({ userId, orgId }, date, stop.id).then(stored => {
      if (!active) return;
      setDraft(stored ?? { id: crypto.randomUUID(), bodies: {}, notes: '' });
      if (stored) setStatus('Draft restored');
    }).catch(() => { if (active) setProblem('Could not open the saved draft. Reopen this stop to retry.'); });
    return () => { active = false; };
  }, [completed, date, orgId, stop.id, userId]);

  function update(next: VisitDraft) {
    const version = ++revision.current;
    setDraft(next);
    setProblem('');
    setStatus('Saving…');
    // Start the IndexedDB transaction on this interaction so a quick return to the stop reads the latest edit.
    write.current = saveDraft({ userId, orgId }, date, stop.id, next).then(() => {
      if (revision.current === version) setStatus('Draft saved');
    }).catch(() => {
      if (revision.current === version) setStatus('Draft could not be saved on this device.');
    });
  }

  function editBody(patch: Partial<BodyDraft>) {
    if (draft && body) update({ ...draft, bodies: { ...draft.bodies, [body.id]: { ...reading, ...patch } } });
  }

  async function finish() {
    if (finishing.current || photoBusy || !draft) return;
    const bodies: BodyService[] = [];
    for (const water of stop.bodies) {
      const data = draft.bodies[water.id] ?? emptyBody;
      const ph = numeric(data.ph, 14), fc = numeric(data.fc, 100);
      const alkalinity = numeric(data.alkalinity, 2000);
      let error = '';
      if (ph === null || fc === null) error = 'Enter pH (0–14) and free chlorine (0–100 ppm).';
      else if (data.alkalinity.trim() && alkalinity === null) error = 'Enter alkalinity between 0 and 2,000 ppm.';
      const chemicals = data.chemicals.map(dose => ({ ...dose, amount: numeric(dose.amount, 10000) ?? 0 }));
      if (!error && chemicals.some(dose => !dose.amount)) error = 'Enter a chemical amount above 0 and up to 10,000.';
      if (error || ph === null || fc === null) {
        setTab(water.id); setProblem(water.name + ' · ' + t(error));
        return;
      }
      bodies.push({ bodyId: water.id, ph, fc, alkalinity, chemicals, tasks: data.tasks });
    }
    finishing.current = true;
    setBusy(true);
    try {
      await write.current;
      await onFinish({ id: draft.id, stopId: stop.id, date, notes: draft.notes.trim(), bodies });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t('Could not save this visit. Try again.'));
    } finally { finishing.current = false; setBusy(false); }
  }

  return <div className="v4v">
    <header className="v4v-head">
      <button type="button" className="v4v-back" aria-label={t('Back to route')} onClick={async () => { await write.current; onBack(); }} disabled={busy || photoBusy}><Icon name="back"/></button>
      <div><h1>{stop.name}</h1><p>{stop.address}</p></div>
      <div className="v4v-mark" aria-label={t('Stop') + ' ' + stop.position}>{stop.position.toString().padStart(2, '0')}</div>
    </header>
    <nav className="v4v-tabs" aria-label={t('Visit details')}>
      <button type="button" aria-current={tab === 'info' ? 'page' : undefined} onClick={() => setTab('info')}>{t('Info')}</button>
      {stop.bodies.map(water => <button type="button" key={water.id}
        aria-current={tab === water.id ? 'page' : undefined} onClick={() => setTab(water.id)}>{water.name}</button>)}
    </nav>
    <div className="v4v-content">
      {tab === 'info' && <section className="v4v-card"><h2>{t('Visit details')}</h2>
        <dl className="v4v-facts v4v-inset"><div><dt>{t('Date')}</dt><dd>{formatDate(date, language, { month: 'short', day: 'numeric', weekday: 'short' })}</dd></div>
          <div><dt>{t('Address')}</dt><dd>{stop.address}</dd></div>
          <div><dt>{t('Pools & spas')}</dt><dd>{stop.bodies.map(w => w.name).join(' · ') || '—'}</dd></div></dl>
      </section>}
      {body && <>
        {completed && service && <RecordedBody service={service}/>}
        {!completed && draft && <fieldset className="v4v-fields" disabled={busy} key={body.id}>
          <section className="v4v-card"><h2>{t('Water readings')}</h2>
            <div className="v4v-inset v4v-stack">
              <ReadingInput label="pH" value={reading.ph} change={ph => editBody({ ph })} presets={[7.2, 7.4, 7.6, 7.8]}/>
              <ReadingInput label="Free chlorine" unit="ppm" value={reading.fc} change={fc => editBody({ fc })} presets={[1, 2, 3, 5]}/>
              <details className="v4v-more"><summary>{t('Alkalinity')} <small>{reading.alkalinity ? reading.alkalinity + ' ppm' : t('Optional')}</small></summary>
                <ReadingInput label="Total alkalinity" unit="ppm" value={reading.alkalinity} change={alkalinity => editBody({ alkalinity })} presets={[]}/>
              </details>
            </div>
          </section>
          <Dosages doses={reading.chemicals} change={chemicals => editBody({ chemicals })}/>
          <details className="v4v-card"><summary>{t('Checklist')} <span>{reading.tasks.length}/{tasks.length}</span></summary>
            <div className="v4v-checks">{tasks.map(task => <label key={task}><input type="checkbox" checked={reading.tasks.includes(task)}
              onChange={e => editBody({ tasks: e.target.checked ? [...reading.tasks, task] : reading.tasks.filter(item => item !== task) })}/>{t(task)}</label>)}</div>
          </details>
        </fieldset>}
        <WaterBodyDetails body={body}/>
      </>}
      <VisitPhoto userId={userId} orgId={orgId} stopId={stop.id} visitId={stop.visit?.id} readOnly={completed || busy} onBusy={setPhotoBusy}/>
      <details className="v4v-card"><summary>{t('Notes & issues')}</summary>
        <div className="v4v-inset">{completed ? <p>{stop.visit?.notes || t('No notes recorded.')}</p> :
          <textarea aria-label={t('Visit notes')} value={draft?.notes ?? ''} maxLength={2000} disabled={!draft || busy}
            onChange={e => { if (draft) update({ ...draft, notes: e.target.value }); }}/>}</div>
      </details>
      {completed && <p className="v4v-complete"><Icon name="check"/>{t('Visit completed')}{stop.completedAt && Number.isFinite(Date.parse(stop.completedAt)) && <> · {formatDate(stop.completedAt, language, { hour: 'numeric', minute: '2-digit' })}</>}</p>}
    </div>
    {!completed && <div className="v4v-actions">
      {problem && <p role="alert">{t(problem)}</p>}
      {status && <span role="status">{t(status)}</span>}
      <button className="v4v-finish" type="button" disabled={busy || photoBusy || !draft || !stop.bodies.length} onClick={finish}>
        {t(busy ? 'Saving…' : 'Finish & Next')}<Icon name="arrow"/></button>
    </div>}
  </div>;
}
