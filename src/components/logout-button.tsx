"use client";
import {T,useLanguage} from '@/components/i18n';
import { useState } from 'react';
import { logout } from '@/app/actions';
import { clearDeviceData,getLocalWorkCount } from '@/lib/offline/store';
export function LogoutButton() {
 const {t}=useLanguage();
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 async function signOut(){
  setBusy(true);setError('');
  try{
   const work=await getLocalWorkCount();
   if((work.drafts||work.pending)&&!window.confirm(t('This device has local drafts or visits waiting to sync. Signing out removes them from this device. Sign out anyway?'))){setBusy(false);return;}
   await clearDeviceData();
  }catch{setBusy(false);setError('Unable to clear local data. Please try again before signing out.');return;}
  await logout();
 }
 return <><button type="button" className="nav-item" disabled={busy} onClick={signOut}>{busy?<T text={"Signing out…"}/>:<T text={"Sign out"}/>}</button>{error&&<p role="alert"><T text={error}/></p>}</>;
}
