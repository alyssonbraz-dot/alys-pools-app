'use client';
import {T,DateText,useLanguage} from './i18n';
import {formatDate} from '@/lib/i18n/core';
import type {DrivingPlan} from '@/lib/routing';
export function WeekCalendar({date,onChange,timeZone='America/New_York'}:{date:string;timeZone?:string;onChange:(date:string)=>void}){
 const {language}=useLanguage();const chosen=new Date(date+'T12:00:00Z');const monday=new Date(chosen);monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
 const shift=(n:number)=>{const next=new Date(chosen);next.setUTCDate(next.getUTCDate()+n);onChange(next.toISOString().slice(0,10));};

 return <section className="route-calendar"><div className="route-calendar-controls"><button className="field-button field-button-secondary field-button-small" onClick={()=>shift(-7)}><T text="← Previous week"/></button><button className="field-button field-button-secondary field-button-small" onClick={()=>shift(7)}><T text="Next week →"/></button></div><div className="route-days">{Array.from({length:7},(_,index)=>{const day=new Date(monday);day.setUTCDate(day.getUTCDate()+index);const value=day.toISOString().slice(0,10);return <button key={value} className={date===value?'chosen':''} aria-pressed={date===value} onClick={()=>onChange(value)}><span>{formatDate(day,language,{weekday:'short',timeZone})}</span><strong>{day.getUTCDate()}</strong></button>;})}</div></section>;
}
export function Arrival({plan,stopId,timeZone='America/New_York'}:{plan:DrivingPlan;stopId:string;timeZone?:string}){const leg=plan.arrivals.find(a=>a.stop_id===stopId);if(!leg)return null;const next=plan.arrivals[plan.arrivals.indexOf(leg)+1];return <p className="route-arrival"><T text="Estimated arrival"/>: <DateText value={leg.at} options={{hour:'numeric',minute:'2-digit',timeZone}}/>{next&&<> · <T text="Next stop"/>: {(next.distance_m/1609.344).toFixed(1)}<T text={" mi · "}/>{Math.round(next.duration_s/60)}<T text={" min"}/></>}</p>;}
