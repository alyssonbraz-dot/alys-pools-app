import type {RouteStop} from './types';
/** Follow the assigned order, wrapping only after the final available stop. */
export function nextAssignedStop(stops:RouteStop[],current:RouteStop,queued:ReadonlySet<string>){const assigned=stops.filter(s=>s.technician_id===current.technician_id);const index=assigned.findIndex(s=>s.id===current.id);const available=(s:RouteStop)=>s.id!==current.id&&!queued.has(s.id)&&!['completed','skipped'].includes(s.status);return assigned.slice(index+1).find(available)??assigned.find(available);}
