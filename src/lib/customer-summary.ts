import {serviceDay} from './service-time';
export type ServiceProperty={id:string;name:string;address:string;latitude:number|null;longitude:number|null;service_timezone?:string;pools:{id:string;status:string}[];recurring_schedules:{active:boolean;start_on:string;end_on:string|null;days_of_week:number[];technician_id:string}[]};
type Agreement={source:string;billing_model:string;status:string;price_cents?:number};
export type CustomerSummary={property_count:number;water_body_count:number;days:number[];technician_names:string[];contract_status:'active'|'inactive'|'none';own_mrr_cents?:number;has_subcontract:boolean};
/** Matches owner_overview eligibility: count agreements once, never per pool. */
export function customerSummary(customer:{status:string;properties:ServiceProperty[];contracts:Agreement[]},technicians:{id:string;display_name:string}[],owner:boolean,now=new Date()):CustomerSummary{
 const activeSchedules=customer.properties.flatMap(property=>{const today=serviceDay(now,property.service_timezone??'America/New_York');return property.recurring_schedules.filter(s=>s.active&&s.start_on<=today&&(!s.end_on||s.end_on>=today));});
 const assigned=[...new Set(activeSchedules.map(s=>s.technician_id))];
 return {
  property_count:customer.properties.length,
  water_body_count:customer.properties.reduce((sum,p)=>sum+p.pools.length,0),
  days:[...new Set(activeSchedules.flatMap(s=>s.days_of_week))].sort((a,b)=>a-b),
  technician_names:assigned.map(id=>technicians.find(t=>t.id===id)?.display_name).filter((name):name is string=>!!name),
  contract_status:customer.contracts.some(c=>c.status==='active')?'active':customer.contracts.length?'inactive':'none',
  has_subcontract:customer.contracts.some(c=>c.source==='subcontract'&&c.status==='active'),
  ...(owner?{own_mrr_cents:customer.status==='active'&&activeSchedules.length?customer.contracts.filter(c=>c.source==='own'&&c.billing_model==='monthly'&&c.status==='active').reduce((sum,c)=>sum+(c.price_cents??0),0):0}:{})
 };
}
