'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Icon, type IconName } from '@/components/design/icon';
import { LanguageSwitcher, T, useLanguage } from '@/components/i18n';
import { serviceDay } from '@/lib/service-time';
import { flushVisits, getSyncStatus, listLocalVisits, queueVisit, reconcileRoute, watchDevice, type SyncStatus } from '@/lib/v4/device';
import type { RouteDay, VisitInput } from '@/lib/v4/types';
import { NextStop, ProgressCard, StopsList, Week } from './dashboard';
import { VisitForm } from './visit';
import './workspace.css';

const RouteMap = dynamic(() => import('./map'), {ssr:false, loading:() => <p role="status"><T text="Loading map…"/></p>});
const AddStop = dynamic(() => import('./add-stop').then(m=>m.AddStop));
const destinations: {key:string; label:string; icon:IconName}[] = [
  {key:'dashboard',label:'Today',icon:'home'}, {key:'route',label:'Route',icon:'route'},
  {key:'map',label:'Map',icon:'pin'}, {key:'reports',label:'Reports',icon:'reports'},
  {key:'account',label:'Account',icon:'settings'},
];
function subscribeLocation(listener:()=>void) {
  window.addEventListener('hashchange',listener);
  return () => window.removeEventListener('hashchange',listener);
}
function readScreen() { return window.location.hash.slice(1) || 'dashboard'; }
function navigate(screen:string) {
  window.location.hash = screen;
  window.scrollTo({top:0,behavior:'instant'});
}
function initials(name:string) { return name.trim().split(/\s+/).slice(0,2).map(word=>word[0]).join(''); }

export function V4App({initial,userId,orgId,canAdd=false}: {initial:RouteDay;userId:string;orgId:string;canAdd?:boolean}) {
  const {language,t} = useLanguage();
  const scope = useMemo(()=>({userId,orgId}),[userId,orgId]);
  const headers = useMemo(()=>({'X-ALYS-User-ID':userId,'X-ALYS-Organization-ID':orgId}),[userId,orgId]);
  const [route,setRoute] = useState(initial);
  const [local,setLocal] = useState<VisitInput[]>([]);
  const [status,setStatus] = useState<SyncStatus|null>(null);
  const [online,setOnline] = useState(true);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const [order,setOrder] = useState<string[]|null>(null);
  const requestId = useRef(0);
  const screen = useSyncExternalStore(subscribeLocation,readScreen,()=>'dashboard');
  const [tab,stopId] = screen.split('/');
  const currentTab = destinations.some(item=>item.key===tab) ? tab : ['visit','add'].includes(tab)?'route':'dashboard';
  const readError = useCallback(()=>setNotice('Device storage is unavailable. Check storage before starting another visit.'),[]);
  useEffect(()=>{
    let active = true;
    let sequence = 0;
    const update = async () => {
      const id = ++sequence;
      try {
        const [saved,counts] = await Promise.all([listLocalVisits(scope,route.date),getSyncStatus(scope)]);
        if(active && id===sequence){setLocal(saved);setStatus(counts);}
      } catch {if(active)readError();}
    };
    const unsubscribe = watchDevice(scope,()=>void update());
    void reconcileRoute(scope,route).then(update).catch(readError);
    return ()=>{active=false;unsubscribe();};
  },[scope,route,readError]);
  const sync = useCallback(()=>{void flushVisits(scope).catch(readError);},[scope,readError]);
  useEffect(()=>{
    const onConnection = ()=>{setOnline(navigator.onLine);if(navigator.onLine)sync();};
    const onVisible = ()=>{if(document.visibilityState==='visible')onConnection();};
    queueMicrotask(onConnection);
    window.addEventListener('online',onConnection);
    window.addEventListener('offline',onConnection);
    document.addEventListener('visibilitychange',onVisible);
    return ()=>{window.removeEventListener('online',onConnection);window.removeEventListener('offline',onConnection);document.removeEventListener('visibilitychange',onVisible);};
  },[sync]);
  useEffect(()=>{
    if(!status?.pending || !online)return;
    const timer = window.setInterval(sync,30000);
    return ()=>window.clearInterval(timer);
  },[online,status?.pending,sync]);
  const stops = useMemo(()=>route.stops.map(stop=>{
    const visit = local.find(record=>record.stopId===stop.id && record.date===route.date);
    return visit && !stop.completedAt ? {...stop,visit,completedAt:'local'} : stop;
  }),[local,route]);
  const next = stops.find(stop=>!stop.completedAt);
  const selected = stops.find(stop=>stop.id===stopId);
  const done = stops.filter(stop=>stop.completedAt);
  const displayDate = new Date(route.date+'T12:00:00Z').toLocaleDateString(language,{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'});
  const open = (id:string)=>navigate('visit/'+id);
  const loadDay = useCallback(async (date:string) => {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
    const id = ++requestId.current;
    setBusy(true);setNotice('');
    try {
      const response = await fetch('/api/v4/route?date='+date,{headers,cache:'no-store'});
      if(!response.ok)throw new Error('Route unavailable. Check your connection and sign-in.');
      const day:RouteDay = await response.json();
      if(day.date!==date)throw new Error('The requested day is unavailable.');
      if(id===requestId.current){
        const url = new URL(window.location.href);
        url.searchParams.set('date',date);
        window.history.replaceState(null,'',url);
        setRoute(day);setOrder(null);
      }
    } catch {if(id===requestId.current)setNotice('Could not load that day. Your open route is still available.');}
    finally {if(id===requestId.current)setBusy(false);}
  },[headers]);
  useEffect(()=>{
    function restoreDate() {
      const date = new URL(window.location.href).searchParams.get('date') ?? serviceDay();
      if(date!==route.date)void loadDay(date);
    }
    window.addEventListener('popstate',restoreDate);
    return ()=>window.removeEventListener('popstate',restoreDate);
  },[loadDay,route.date]);
  async function finish(input:VisitInput) {
    await queueVisit(scope,route.date,input);
    setLocal(current=>[...current.filter(item=>item.stopId!==input.stopId),input]);
    const following = stops.find(stop=>stop.id!==input.stopId && !stop.completedAt);
    navigate(following?'visit/'+following.id:'reports');
    sync();
  }
  async function persistOrder(mode:'save'|'reset') {
    setBusy(true);setNotice('');
    try {
      const response = await fetch('/api/v4/order',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({date:route.date,ids:order??stops.map(s=>s.id),mode})});
      if(!response.ok)throw new Error();
      const updated:RouteDay = await response.json();
      setRoute(updated);setOrder(null);setNotice(mode==='save'?'Default order saved.':'Default order restored.');
    } catch {setNotice('Order could not be saved. Reconnect and try again.');}
    finally {setBusy(false);}
  }
  const syncText = !online?t('Offline') : !status?t('Checking sync…') : status.blocked?t('Sync needs attention') : status.pending?t('Waiting to sync'):t('All changes synced');
  const syncLabel = status?.pending?`${syncText} · ${status.pending}`:syncText;
  const viewTitle = currentTab==='dashboard'?'Route dashboard':currentTab==='route'?'Daily route':currentTab==='map'?'Route map':currentTab==='reports'?'Visit reports':'Account';
  const isVisit = tab==='visit' && !!selected;
  return <div className="v4-workspace">
    {isVisit ? <VisitForm key={selected.id} stop={selected} userId={userId} orgId={orgId} date={route.date} onBack={()=>navigate('route')} onFinish={finish}/> :
    <>
      <header className="v4-mast"><div className="v4-mast-inner">
        <div className="v4-brand-row"><div className="v4-brand"><span className="v4-brand-symbol"><Icon name="pool" width="26" height="26"/></span><b>{t('ALYS')}</b><span>{t('Pool Services')}</span></div>
          <button className="v4-avatar" aria-label={t('Account')} onClick={()=>navigate('account')}>{initials(route.technician)}</button>
        </div>
        <div className="v4-heading-row"><div><p>{displayDate}</p><h1>{t(tab==='add'?'Add stop':viewTitle)}</h1></div>
          {['route','dashboard','map','reports'].includes(currentTab)&&tab!=='add'&&<label className="v4-calendar" title={t('Choose date')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18m-14 4h3m3 0h3"/></svg>
            <input type="date" aria-label={t('Choose date')} value={route.date} disabled={busy} onChange={e=>void loadDay(e.target.value)}/>
          </label>}
        </div>
        {currentTab!=='account'&&tab!=='add'&&<Week day={route.date} busy={busy} onDay={day=>void loadDay(day)}/>}
      </div></header>
      <main className="v4-main">
        <div className="v4-sync-row"><span role="status" className={'v4-sync '+(online&&status?.pending===0?'synced':'')}><i/>{syncLabel}</span>
          {busy?<small>{t('Loading…')}</small>:route.date!==serviceDay()&&<button onClick={()=>void loadDay(serviceDay())}>{t('Today')}</button>}</div>
        {notice && <p role="status" className="v4-notice">{t(notice)}</p>}
        {status?.blocked && status.message ? <p role="alert" className="v4-notice">{t(status.message)} <button onClick={sync}>{t('Retry sync')}</button></p>:null}
        {tab==='add' && canAdd ? <AddStop date={route.date} userId={userId} orgId={orgId} onAdded={()=>{navigate('route');void loadDay(route.date);}} onCancel={()=>navigate('route')}/> :
        <>
          {(currentTab==='dashboard'||currentTab==='route') && <>
            <ProgressCard stops={stops} technician={route.technician}/>
            {currentTab==='dashboard'&&next&&<NextStop stop={next} onOpen={()=>open(next.id)}/>}
            <div className="v4-section-head"><div><h2>{t('Route stops')} <span>{stops.length}</span></h2></div>
              {canAdd&&<button className="v4-quiet" aria-label={t('Add stop')} onClick={()=>navigate('add')}><Icon name="plus" width="16"/>{t('Add stop')}</button>}
            </div>
            {!stops.length?<section className="v4-card v4-empty"><Icon name="route"/><h3>{t('No scheduled stops')}</h3><p>{t('Choose another day to view its route.')}</p></section>:
              order && currentTab==='route'?<div className="v4-card v4-edit-order">
                <ol>{order.map((id,i)=><li key={id}><strong>{stops.find(stop=>stop.id===id)?.name}</strong>
                  {[-1,1].map(delta=><button key={delta} disabled={busy||i+delta<0||i+delta>=order.length} aria-label={t(delta===1?'Move down':'Move up')+' '+(i+1)} onClick={()=>{const copy=[...order];[copy[i],copy[i+delta]]=[copy[i+delta],copy[i]];setOrder(copy);}}>{delta===1?'↓':'↑'}</button>)}</li>)}</ol>
                <button className="v4-quiet" disabled={busy} onClick={()=>setOrder(null)}>{t('Cancel')}</button><button className="v4-blue-button" disabled={busy} onClick={()=>void persistOrder('save')}>{t('Save default order')}</button></div>:
              <StopsList stops={stops} onOpen={stop=>open(stop.id)}/>}
            {currentTab==='route'&&stops.length>1&&!order&&<div className="v4-tools"><button className="v4-quiet" onClick={()=>setOrder(stops.map(s=>s.id))}>{t('Edit stop order')}</button><button className="v4-quiet" disabled={busy} onClick={()=>void persistOrder('reset')}>{t('Reset to default order')}</button></div>}
          </>}
          {currentTab==='map'&&<RouteMap stops={stops} onOpen={open}/>}
          {currentTab==='reports'&&<><div className="v4-section-head"><div className="v4-overline">{t('Completed visits')} · {done.length}</div></div>{done.length?<StopsList stops={done} onOpen={stop=>open(stop.id)}/>:<p className="v4-card v4-empty">{t('Completed visits will appear here.')}</p>}</>}
          {currentTab==='account'&&<section className="v4-card v4-account"><span className="v4-overline">{t('Signed in as')}</span><h2>{route.technician}</h2><LanguageSwitcher/><p>{syncLabel}</p><button className="v4-quiet" onClick={sync}>{t('Retry sync')}</button>
            <button className="v4-quiet" onClick={async()=>{try{const response=await fetch('/api/v4/signout',{method:'POST',headers});if(!response.ok)throw new Error();window.location.replace('/v4/login');}catch{setNotice('Sign out failed. Reconnect and try again.');}}}>{t('Sign out')}</button>
          </section>}
        </>}
      </main>
    </>}
    <nav className="v4-nav" aria-label={t('Field navigation')}><div>
      {destinations.map(item=><button key={item.key} aria-current={currentTab===item.key?'page':undefined} onClick={()=>{setOrder(null);navigate(item.key);}}><span><Icon name={item.icon} width="21" height="21"/></span><small>{t(item.label)}</small></button>)}
    </div></nav>
  </div>;
}
