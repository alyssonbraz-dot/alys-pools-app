'use client';
import type {ReactNode} from 'react';
import {T} from '@/components/i18n';
import {Icon,type IconName} from '@/components/design/icon';
export function PageHeading({title,subtitle,eyebrow,action}:{title:ReactNode;subtitle?:ReactNode;eyebrow?:ReactNode;action?:ReactNode}){return <header className="v4-page-heading"><div>{eyebrow&&<p className="v4-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{subtitle&&<div className="v4-subtitle">{subtitle}</div>}</div>{action&&<div className="v4-heading-action">{action}</div>}</header>;}
export function SectionHeading({title,action}:{title:string;action?:ReactNode}){return <div className="v4-section-heading"><h2><T text={title}/></h2>{action}</div>;}
export function Metric({label,value,icon}:{label:string;value:ReactNode;icon?:IconName}){return <div className="v4-metric">{icon&&<Icon name={icon}/>}<span><T text={label}/></span><strong>{value}</strong></div>;}
export function SyncState({state}:{state:'device'|'syncing'|'synced'|'attention'}){const labels={device:'Saved on device',syncing:'Syncing',synced:'Synced',attention:'Needs attention'};return <span className={'v4-sync-state v4-sync-'+state} role="status"><Icon name={state==='synced'?'check':state==='attention'?'shield':'sync'}/><T text={labels[state]}/></span>;}
