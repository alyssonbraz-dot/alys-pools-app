export type ReadingKey = 'fc' | 'ph' | 'ta' | 'cya' | 'ch' | 'salt' | 'cc';
export type ReadingValues = Partial<Record<ReadingKey, number>>;
export type Dosage = { product: string; quantity: number; unit: string };
export type PoolConfig = { id:string; name:string; gallons:number; checklist:string[]; required_readings:ReadingKey[]; photo_required:boolean };
export type StopStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
export type RouteStop = {
 id:string; technician_id:string; service_date:string; position:number; status:StopStatus;
 property:{id:string; name:string; address:string; gate_notes:string};
 customer:{id:string;name:string}; pools:PoolConfig[];
 chemistry_history?:Record<string,import('./chemistry').ChemistryEntry[]>;
 last_readings?:Record<string,{recorded_at:string;readings:ReadingValues}>;
};
export type RouteData = {
 userId:string;orgId:string;displayName:string;role:'owner'|'admin'|'technician';date:string;stops:RouteStop[];
 properties?:{id:string;name:string;address:string}[];
 technicians?:{id:string;display_name:string}[];
};
export type PoolVisit = {pool_id:string; tasks:string[]; readings:ReadingValues; dosages:Dosage[]};
export type CompletionPayload = {id:string;stop_id:string;started_at?:string;completed_at?:string;pools:PoolVisit[];notes:string;photo_paths:string[]};
export type VisitSnapshot = {property_name:string;customer_name:string;notes:string;pools:(PoolVisit&{pool_name:string})[]};
export type VisitHistory = {corrections?:{id:string;note:string;created_at:string;actor_id:string}[];id:string;route_stop_id:string;completed_at:string;technician_name?:string;snapshot:VisitSnapshot;photos:{storage_path:string}[];email?:{id?:string;status:'pending'|'sent'|'failed';error?:string|null;sent_at?:string|null}};
export const DEFAULT_CHECKLIST=['Skim Surface','Brush Pool','Vacuum Pool','Empty Skimmer Basket','Empty Pump Basket','Check Equipment','Test Water','Add Chemicals'];
export const READING_LABELS:Record<ReadingKey,string>={fc:'Free Chlorine (ppm)',ph:'pH',ta:'Total Alkalinity (ppm)',cya:'Cyanuric Acid (ppm)',ch:'Calcium Hardness (ppm)',salt:'Salt (ppm)',cc:'Combined Chlorine (ppm)'};
export function floridaDay(date=new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
