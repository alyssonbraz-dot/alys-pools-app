'use client';
import Link from 'next/link';
import {T} from '@/components/i18n';
import {BusinessCard,Money} from '@/components/business/ui';
import {CustomerContribution} from '@/components/business/payment-rate';
export function CustomerServiceSummary({customerId,address,technicians,days,monthlyCents,showMoney,serviceHref}:{customerId:string;address?:string;technicians:string[];days:number[];monthlyCents:number|null;showMoney:boolean;serviceHref:string}){return <BusinessCard title="Service at a glance"><p className="business-profile-address">{address||<T text="No property yet"/>}</p><div className="business-inline"><span><T text="Assigned technician"/></span><strong>{technicians.join(', ')||<T text="Unassigned"/>}</strong></div><p className="business-profile-days">{days.map(day=><span key={day}><T text={['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]}/></span>)}</p>{showMoney&&<div className="business-inline"><T text="Monthly service"/><strong><Money cents={monthlyCents}/></strong></div>}<Link className="business-inline" href={serviceHref}><T text="Edit schedule & assignment"/> →</Link>{showMoney&&<CustomerContribution customerId={customerId}/>}</BusinessCard>;}
