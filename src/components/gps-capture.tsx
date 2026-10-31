'use client';
import {useEffect,useRef,useState} from 'react';
import {T,NumberText} from './i18n';
import {gpsError,validCoordinates} from '@/lib/location';
/** One explicit measurement only. Never starts tracking or saves a customer. */
export function GpsCapture({onPosition,serviceAddress=true}:{onPosition:(latitude:number,longitude:number)=>void;serviceAddress?:boolean}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[accuracy,setAccuracy]=useState<number|null>(null);
 const active=useRef(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 function capture(){
  setError('');setAccuracy(null);
  if(!window.isSecureContext||!navigator.geolocation){setError('GPS requires HTTPS and a browser with location support. Enter coordinates manually.');return;}
  setBusy(true);
  navigator.geolocation.getCurrentPosition(position=>{
   if(!active.current)return;setBusy(false);
   if(!validCoordinates(position.coords.latitude,position.coords.longitude)){setError(gpsError(2));return;}
   onPosition(position.coords.latitude,position.coords.longitude);
   setAccuracy(Number.isFinite(position.coords.accuracy)?Math.round(position.coords.accuracy):null);
  },failure=>{if(active.current){setBusy(false);setError(gpsError(failure.code));}},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
 }
 return <div className="gps-capture"><button className="btn btn-secondary" type="button" disabled={busy} onClick={capture}><T text={busy?'Getting GPS location…':'Use current GPS location'}/></button>{error&&<p className="notice" role="alert"><T text={error}/></p>}{accuracy!==null&&<p className="note" role="status"><T text="GPS accuracy (meters)"/>: ±<NumberText value={accuracy}/>. <T text={serviceAddress?'Check the pin before confirming. Use GPS only while at this service address.':'Check the coordinates before saving your route starting location.'}/></p>}</div>;
}
