import type {CustomerBundle} from './onboarding';
/** Compare service terms, not database metadata or weekday ordering. */
export function scheduleTerms(value:CustomerBundle['properties'][number]['schedules'][number]){
 return JSON.stringify({technician_id:value.technician_id,days_of_week:[...value.days_of_week].sort((a,b)=>a-b),start_on:value.start_on,end_on:value.end_on||'',active:value.active,service_notes:value.service_notes||''});
}
export function customerEditPayload(value:CustomerBundle,initial?:CustomerBundle):CustomerBundle{
 if(!initial?.customer.id)return value;
 return {...value,properties:value.properties.map(property=>{const original=initial.properties.find(p=>p.id===property.id);return {...property,schedules:property.schedules.filter(sc=>{const before=original?.schedules.find(s=>s.id===sc.id);return !sc.id||!before||scheduleTerms(sc)!==scheduleTerms(before);})};})};
}

export type CustomerSubmission={body:string;id:string;rejected:boolean;uncertain:boolean};
/** A new payload gets a new ID only after a confirmed rejection. An unknown
 * acknowledgement may already have committed: keep its ID to prevent duplicates. */
export function nextCustomerSubmission(body:string,previous:CustomerSubmission|null,makeId:()=>string):CustomerSubmission{
 if(!previous||(previous.body!==body&&previous.rejected&&!previous.uncertain))return {body,id:makeId(),rejected:false,uncertain:false};
 return previous;
}
