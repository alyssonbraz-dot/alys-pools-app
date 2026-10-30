'use client';
import {useEffect,useState} from 'react';
import {Shell} from '@/components/shell';
import {getActiveScope,getCachedRoute} from '@/lib/offline/store';
import type {RouteData} from '@/lib/field/types';
import {FieldApp} from './field-app';
export function OfflineWorkspace(){const [route,setRoute]=useState<RouteData|null>(null);useEffect(()=>{let active=true;void getActiveScope().then(scope=>scope?getCachedRoute(scope):null).then(saved=>{if(active)setRoute(saved);}).catch(()=>{});return()=>{active=false;};},[]);const speed=route?.role==='technician';const list=typeof window!=='undefined'&&['/stops','/route'].includes(window.location.pathname);return <Shell name={route?.displayName??''} role={route?.role??'technician'} demo={route?.demo}><FieldApp offline currentMode={speed} startInList={list}/></Shell>;}
