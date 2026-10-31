'use client';
import {Children,type ReactNode,type LiHTMLAttributes} from 'react';
import {T,useLanguage} from '@/components/i18n';
export function MobileHeader({title,address,eyebrow,action}:{title:ReactNode;address?:ReactNode;eyebrow?:ReactNode;action?:ReactNode}){return <header className="mobile-field-header"><div>{eyebrow&&<p>{eyebrow}</p>}<h1>{title}</h1>{address&&<div className="mobile-field-address">{address}</div>}</div>{action&&<div className="mobile-field-header-action">{action}</div>}</header>;}
export function ProgressDial({completed,total}:{completed:number;total:number}){const {t}=useLanguage();return <div className="mobile-progress-dial" role="progressbar" aria-label={t("Completed visits")} aria-valuemin={0} aria-valuemax={total||1} aria-valuenow={completed} style={{background:`conic-gradient(#1977b8 ${total?Math.min(1,completed/total)*360:0}deg,#dbe4eb 0)`}}><strong>{completed}/{total}</strong></div>;}
export function ServiceCard({title,children,id,action}:{title:string;children:ReactNode;id?:string;action?:ReactNode}){return <section className="rebuild-service-card field-section service-anchor" id={id}><header><h2><T text={title}/></h2>{action}</header><div className="rebuild-service-card-body">{children}</div></section>;}
export function RouteStopCard({number,customer,address,status,label,onSelect,meta,children,...props}:{number:number;customer:string;address:string;status:string;label:string;onSelect:()=>void;meta?:ReactNode;children:ReactNode}&LiHTMLAttributes<HTMLLIElement>){
 const actions=Children.toArray(children);
 return <li {...props} className={'field-stop route-stop-card '+(props.className??'')} data-status={status}>
  <div className="route-stop-ordinal" aria-hidden>{number}</div>
  <article><header><div><h2><button className="route-stop-select" onClick={onSelect}>{customer}</button></h2><p>{address}</p></div><span className={'field-badge field-badge-'+status}><T text={label}/></span></header>
   <div className="field-stop-actions route-primary-actions">{actions.slice(0,2)}</div>
   <details className="route-secondary-actions"><summary><T text="More"/></summary>{meta&&<div className="route-stop-meta">{meta}</div>}<div className="field-stop-actions">{actions.slice(2)}</div></details>
  </article>
 </li>;
}
