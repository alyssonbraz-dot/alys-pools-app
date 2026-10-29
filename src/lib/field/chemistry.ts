import {serviceDay} from '../service-time';
import { type Dosage, type ReadingValues } from './types';
export type ChemistryEntry = {unit_system?:import('../units').UnitSystem;service_timezone?:string;technician_name?:string;reference_ranges?:Partial<Record<import('./types').ReadingKey,{min:number;max:number}>>;visit_id:string;completed_at:string;readings:ReadingValues;dosages:Dosage[]};
export type ChemistryRow = ChemistryEntry & {pool_id:string};
// Thirty service calendar days including the selected route day; DST never changes the day count.
export function chemistryPeriod(day:string) {
 const start=new Date(`${day}T12:00:00Z`);
 start.setUTCDate(start.getUTCDate()-29);
 return {from:start.toISOString().slice(0,10),through:day};
}
export function groupChemistry(rows:ChemistryRow[],day:string,zones:Record<string,string>={}):Record<string,ChemistryEntry[]> {
 const {from,through}=chemistryPeriod(day);
 const grouped:Record<string,ChemistryEntry[]>={};
 const seen=new Set<string>();
 for(const row of [...rows].sort((a,b)=>b.completed_at.localeCompare(a.completed_at)||a.visit_id.localeCompare(b.visit_id))){
  const completedDay=serviceDay(new Date(row.completed_at),zones[row.pool_id]??'America/New_York');
  const key=`${row.visit_id}:${row.pool_id}`;
  if(completedDay<from||completedDay>through||seen.has(key))continue;
  seen.add(key);
  if(!Object.values(row.readings).some(value=>typeof value==='number')&&!row.dosages.length)continue;
  (grouped[row.pool_id]??=[]).push({visit_id:row.visit_id,completed_at:row.completed_at,readings:row.readings,dosages:row.dosages,...(row.unit_system?{unit_system:row.unit_system}:{}),...(row.service_timezone?{service_timezone:row.service_timezone}:{}),...(row.technician_name?{technician_name:row.technician_name}:{}),...(row.reference_ranges?{reference_ranges:row.reference_ranges}:{})});
 }
 return grouped;
}
