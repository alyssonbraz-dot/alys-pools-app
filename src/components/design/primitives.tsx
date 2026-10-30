import type {ReactNode} from 'react';
import {T} from '@/components/i18n';
import {Icon,type IconName} from './icon';
export function PageHeader({title,description,eyebrow,actions}:{title:string;description?:string;eyebrow?:string;actions?:ReactNode}){return <header className="page-header"><div>{eyebrow&&<p className="page-kicker"><T text={eyebrow}/></p>}<h1><T text={title}/></h1>{description&&<p><T text={description}/></p>}</div>{actions&&<div className="header-actions">{actions}</div>}</header>;}
export function SectionHeader({title,action}:{title:string;action?:ReactNode}){return <div className="section-header"><h2><T text={title}/></h2>{action}</div>;}
export function Card({children,className=''}:{children:ReactNode;className?:string}){return <section className={`surface ${className}`}>{children}</section>;}
export function StatCard({label,value,icon='service',detail}:{label:string;value:ReactNode;icon?:IconName;detail?:string}){return <section className="stat-card"><span className="stat-icon"><Icon name={icon}/></span><div><span className="stat-top"><T text={label}/></span><strong className="stat-value">{value}</strong>{detail&&<small><T text={detail}/></small>}</div></section>;}
export function StatusIndicator({label,tone='neutral'}:{label:string;tone?:'neutral'|'success'|'warning'|'error'}){return <span className={`status-indicator status-${tone}`}><span/><T text={label}/></span>;}
export function EmptyState({title,description,action,icon='pool'}:{title:string;description:string;action?:ReactNode;icon?:IconName}){return <section className="empty-state"><span className="empty-state-icon"><Icon name={icon}/></span><h2><T text={title}/></h2><p><T text={description}/></p>{action}</section>;}
export function LoadingSkeleton(){return <div className="loading-skeleton" aria-busy="true"><span/><span/><span/></div>;}
export function ErrorState({message,action}:{message:string;action?:ReactNode}){return <div className="error-state" role="alert"><Icon name="shield"/><p><T text={message}/></p>{action}</div>;}
export function StickyActionBar({children}:{children:ReactNode}){return <div className="sticky-action-bar">{children}</div>;}
export function MobileDataCard({title,subtitle,children,actions}:{title:ReactNode;subtitle?:ReactNode;children?:ReactNode;actions?:ReactNode}){return <article className="mobile-data-card"><div className="mobile-data-card-header"><strong>{title}</strong>{subtitle&&<small>{subtitle}</small>}</div>{children}{actions&&<div className="card-actions">{actions}</div>}</article>;}
export function ResponsiveDataTable({children,label}:{children:ReactNode;label:string}){return <div className="responsive-data-table" role="region" aria-label={label} tabIndex={0}>{children}</div>;}
