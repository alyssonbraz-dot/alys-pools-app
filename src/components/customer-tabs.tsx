'use client';
import Link from 'next/link';
import {T,useLanguage} from './i18n';
export function CustomerTabs({id,selected}:{id:string;selected:string}){const {t}=useLanguage();return <nav className="customer-section-tabs" aria-label={t('Customer sections')}>{[['overview','Overview'],['properties','Properties & Pools'],['service','Service'],['history','History']].map(([value,label])=><Link key={value} href={'/customers/'+id+'?tab='+value} aria-current={selected===value?'page':undefined}><T text={label}/></Link>)}</nav>;}
