'use client';
import {useEffect,useRef,useState} from 'react';
import type {Map as LeafletMap} from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {T,LocaleInput,DateText,useLanguage} from './i18n';
import {Arrival} from './route-calendar';
import {routeFingerprint} from '@/lib/routing';
import type {RouteData,RouteStop} from '@/lib/field/types';
export function RoutePlanner({route,stops,technicianId,onSelect,onRefresh,selected,onHighlight}:{route:RouteData;stops:RouteStop[];technicianId:string;selected:string|null;onHighlight:(id:string)=>void;onSelect:(stop:RouteStop)=>void;onRefresh:()=>Promise<unknown>}){
 const {t}=useLanguage();const node=useRef<HTMLDivElement>(null),map=useRef<LeafletMap|null>(null);
 const existing=route.route_plans?.[technicianId];const [latitude,setLatitude]=useState(String(existing?.start_latitude??'')),[longitude,setLongitude]=useState(String(existing?.start_longitude??'')),[time,setTime]=useState(existing?.start_time??'08:00'),[error,setError]=useState(''),[warning,setWarning]=useState(''),[busy,setBusy]=useState(false),[expanded,setExpanded]=useState(false);
 useEffect(()=>{const media=window.matchMedia('(min-width:951px)');const update=()=>setExpanded(media.matches);queueMicrotask(update);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 const valid=stops.filter(s=>s.property.latitude!=null&&s.property.longitude!=null);const open=stops.filter(s=>['pending','in_progress'].includes(s.status));
 const fingerprint=routeFingerprint(open.filter(s=>s.property.latitude!=null&&s.property.longitude!=null).map(s=>({id:s.id,latitude:s.property.latitude!,longitude:s.property.longitude!,service_minutes:s.estimated_service_minutes??20})));
 const plan=existing?.fingerprint===fingerprint?existing.calculation:null;
 const chosen=stops.find(s=>s.id===selected);const geo=JSON.stringify(valid.map((s,i)=>({id:s.id,position:i+1,latitude:s.property.latitude,longitude:s.property.longitude,label:s.property.name||s.customer.name,status:s.status})));
 useEffect(()=>{
  let cancelled=false;let owned:LeafletMap|null=null;
  if(!expanded)return;
  void import('leaflet').then(L=>{if(cancelled||!node.current)return;owned=L.map(node.current,{scrollWheelZoom:false}).setView([26.1224,-80.1373],11);map.current=owned;
   L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).on('tileerror',()=>{if(!cancelled)setWarning('Map tiles are unavailable. Numbered coordinates remain visible.');}).addTo(owned);
   const points=JSON.parse(geo) as {id:string;position:number;latitude:number;longitude:number;label:string;status:string}[];
   for(const point of points){const icon=L.divIcon({className:'route-number-marker',html:`<span class="${point.id===selected?'selected':''}">${point.position}</span>`,iconSize:[34,34],iconAnchor:[17,17]});const marker=L.marker([point.latitude,point.longitude],{icon,title:point.label}).addTo(owned);const label=document.createElement('span');label.textContent=point.label;marker.bindTooltip(label).on('click',()=>onHighlight(point.id));}
   if(plan?.geometry.length){L.polyline(plan.geometry.map(p=>[p[1],p[0]] as [number,number]),{color:'#163e62',weight:4}).addTo(owned);}
   if(points.length)owned.fitBounds(L.latLngBounds(points.map(p=>[p.latitude,p.longitude] as [number,number])),{padding:[30,30],maxZoom:15});
   requestAnimationFrame(()=>owned?.invalidateSize());
  }).catch(()=>{if(!cancelled)setWarning('Map could not be loaded. The stop list remains available.');});
  return()=>{cancelled=true;owned?.remove();map.current=null;};
 },[geo,selected,plan,expanded,onHighlight]);
 async function calculate(action:'estimate'|'optimize'|'save_start'){
  setBusy(true);setError('');try{const response=await fetch('/api/routing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,date:route.date,technician_id:technicianId,start_latitude:latitude===''?null:Number(latitude),start_longitude:longitude===''?null:Number(longitude),start_time:time})});const body=await response.json();if(!response.ok)throw new Error(body.error||'Driving provider unavailable');await onRefresh();}catch(e){setError(e instanceof Error?e.message:'Driving provider unavailable');}finally{setBusy(false);}}
 const finished=plan?new Date(new Date(plan.arrivals[0]?.at||new Date()).getTime()+(plan.duration_s+plan.service_minutes*60-(plan.arrivals[0]?.duration_s??0))*1000):null;
 return <details className="route-planner" open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}><summary><T text="Route map & planning"/></summary><div className="route-map" ref={node} aria-label={t('Interactive route map')}/>{warning&&<p className="field-tiny"><T text={warning}/></p>}{valid.length<stops.length&&<p className="field-alert field-alert-warning"><T text="Some stops have no coordinates. Add latitude and longitude in Customers to place them on the map."/></p>}{error&&<p role="alert" className="field-alert field-alert-warning"><T text={error}/></p>}
 <div className="route-summary-grid">{[['Scheduled stops',stops.length],['Completed stops',stops.filter(s=>s.status==='completed').length],['Remaining stops',open.length],['Estimated driving distance',plan?`${(plan.distance_m/1609.344).toFixed(1)} mi`:t('Not calculated')],['Estimated driving time',plan?`${Math.round(plan.duration_s/60)} min`:t('Not calculated')],['Estimated service time',`${open.reduce((n,s)=>n+(s.estimated_service_minutes??20),0)} min`]].map(([label,value])=><div key={label}><span><T text={label}/></span><strong>{value}</strong></div>)}</div>{finished&&<p className="field-tiny"><T text="Estimated completion time"/>: <DateText value={finished} options={{hour:'numeric',minute:'2-digit'}}/></p>}
 <p className="field-tiny"><T text="Travel estimates apply to remaining stops and come from the configured driving provider. Service time is a planning estimate, not a measured duration."/></p>
 <details><summary><T text="Starting location & time"/></summary><div className="form-grid"><label className="form-field"><T text="Start latitude"/><LocaleInput type="number" step="any" min={-90} max={90} value={latitude} onChange={e=>setLatitude(e.target.value)}/></label><label className="form-field"><T text="Start longitude"/><LocaleInput type="number" step="any" min={-180} max={180} value={longitude} onChange={e=>setLongitude(e.target.value)}/></label><label className="form-field"><T text="Start time"/><LocaleInput type="time" value={time} onChange={e=>setTime(e.target.value)}/></label><button className="field-button field-button-secondary" disabled={busy} onClick={()=>void calculate('save_start')}><T text="Save starting location"/></button></div></details>
 <div className="field-row"><button className="field-button field-button-secondary" disabled={busy||!open.length||technicianId==='all'} onClick={()=>void calculate('estimate')}><T text={busy?'Calculating…':'Calculate driving route'}/></button><button className="field-button" disabled={busy||!open.length||technicianId==='all'} onClick={()=>void calculate('optimize')}><T text="Optimize Route"/></button></div>
 {chosen&&<section className="route-selection"><h3>{chosen.property.name||chosen.customer.name}</h3><p>{chosen.property.address}</p><p className="field-tiny"><T text={chosen.service_type??'Pool maintenance'}/></p>{chosen.property.gate_notes&&<p className="field-access">{chosen.property.gate_notes}</p>}<div className="field-row"><button className="field-button" onClick={()=>onSelect(chosen)}><T text="Start Visit"/></button><a className="field-button field-button-secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(chosen.property.address)}`} target="_blank" rel="noopener noreferrer"><T text="Navigate ↗"/></a></div>{plan?.arrivals.find(a=>a.stop_id===chosen.id)&&<Arrival plan={plan} stopId={chosen.id}/>}</section>}
 <p className="field-tiny"><T text="Drag stop cards on desktop to reorder. On mobile use the up/down buttons. Manual changes override the planned order."/></p>
 </details>;
}
