import 'server-only';
import type { getOperator } from '@/lib/auth';
import type { RouteData,RouteStop,PoolConfig,VisitHistory,VisitSnapshot } from './types';
import {routeFingerprint} from '@/lib/routing';
import {chemistryPeriod,groupChemistry,type ChemistryRow} from './chemistry';
type Operator=NonNullable<Awaited<ReturnType<typeof getOperator>>>;
export async function loadRoute(operator:Operator,date:string):Promise<RouteData> {
 const {db,user,profile}=operator;
 const {error:generateError}=await db.rpc('generate_route',{p_date:date});
 if(generateError)throw new Error('Route generation failed');
 const [{data:stops,error},{data:properties,error:propertyError},{data:pools,error:poolError},{data:customers,error:customerError},{data:profiles,error:profileError}]=await Promise.all([
  db.from('route_stops').select('id,property_id,technician_id,service_date,position,status,estimated_service_minutes,service_type').eq('service_date',date).order('position').order('id').limit(1000),
  db.from('properties').select('id,customer_id,name,address,gate_notes,latitude,longitude').limit(1000),
  db.from('pools').select('id,property_id,name,gallons,checklist,required_readings,photo_required').eq('status','active').limit(1000),
  db.from('customers').select('id,name').limit(1000),
  db.from('profiles').select('id,display_name,role').limit(1000)
 ]);
 if(error||propertyError||poolError||customerError||profileError)throw new Error('Route query failed');
 // Fetch only chemical context for this day's properties, with pagination rather than a tenant-wide history cap.
 const propertyIds=[...new Set((stops??[]).map(s=>s.property_id))];
 const window=chemistryPeriod(date);
 const history:ChemistryRow[]=[];
 if(propertyIds.length)for(let offset=0;;offset+=500){
  const {data:rows,error:historyError}=await db.rpc('route_chemistry_history',{p_property_ids:propertyIds,p_from:window.from,p_through:window.through}).range(offset,offset+499);
  if(historyError)throw new Error('Unable to load chemical history');
  history.push(...(rows as ChemistryRow[]));
  if(rows.length<500)break;
 }
 const chemistry=groupChemistry(history,date);
 const mapped:RouteStop[]=(stops??[]).map(s=>{
   const property=properties?.find(p=>p.id===s.property_id);
   const customer=customers?.find(c=>c.id===property?.customer_id);
   if(!property||!customer)throw new Error('Stop relationships missing');
   const stopPools=(pools??[]).filter(p=>p.property_id===property.id) as PoolConfig[];
   const last:NonNullable<RouteStop['last_readings']>={};
   const poolHistory:NonNullable<RouteStop['chemistry_history']>={};
   for(const pool of stopPools){
    poolHistory[pool.id]=chemistry[pool.id]??[];
    const recent=poolHistory[pool.id].find(entry=>Object.keys(entry.readings).length>0);
    if(recent)last[pool.id]={recorded_at:recent.completed_at,readings:recent.readings};
   }
   return {...s,property:{id:property.id,name:property.name,address:property.address,gate_notes:property.gate_notes,latitude:property.latitude,longitude:property.longitude},customer,pools:stopPools,last_readings:last,chemistry_history:poolHistory};
 });
 const {data:plans,error:plansError}=await db.from('route_plans').select('technician_id,start_latitude,start_longitude,start_time,calculation,fingerprint').eq('service_date',date);
 if(plansError)throw new Error('Unable to load route plans');
 return {route_plans:Object.fromEntries((plans??[]).map(p=>{const open=mapped.filter(s=>s.technician_id===p.technician_id&&['pending','in_progress'].includes(s.status));const geo=open.filter(s=>s.property.latitude!=null&&s.property.longitude!=null).map(s=>({id:s.id,latitude:s.property.latitude!,longitude:s.property.longitude!,service_minutes:s.estimated_service_minutes??20}));return [p.technician_id,{...p,calculation:geo.length===open.length&&p.fingerprint===routeFingerprint(geo)?p.calculation:null}];})),userId:user.id,orgId:profile.organization_id,displayName:profile.display_name,role:profile.role,date,stops:mapped,
  properties:properties?.map(({id,name,address})=>({id,name,address})),technicians:profiles?.filter(p=>['owner','admin','technician'].includes(p.role)).map(({id,display_name})=>({id,display_name}))};
}
export async function loadHistory(operator:Operator,customerId?:string):Promise<VisitHistory[]> {
 const {db}=operator;
 let query=db.from('visits').select('id,route_stop_id,completed_at,snapshot,technician_id,route_stops!inner(properties!inner(customer_id))');
 if(customerId)query=query.eq('route_stops.properties.customer_id',customerId);
 const {data:visits,error}=await query.order('completed_at',{ascending:false}).limit(200);
 if(error)throw new Error('History query failed');
 const allowed=visits??[];
 if(!allowed.length)return [];
 const ids=allowed.map(v=>v.id);
 const [{data:photos,error:photoError},{data:emails,error:emailError},{data:corrections,error:correctionError},{data:details,error:detailError}]=await Promise.all([
  db.from('visit_photos').select('visit_id,storage_path').in('visit_id',ids),
  db.from('email_delivery_logs').select('id,visit_id,status,error,sent_at').in('visit_id',ids),
  db.from('visit_corrections').select('id,visit_id,note,created_at,actor_id').in('visit_id',ids).order('created_at'),
  db.from('visit_service_details').select('visit_id,technician_notes,equipment_problems,filter_cleaning,repairs_performed').in('visit_id',ids)
 ]);
 if(photoError||emailError||correctionError||detailError)throw new Error('History detail query failed');
 return allowed.map(v=>({id:v.id,route_stop_id:v.route_stop_id,completed_at:v.completed_at,snapshot:v.snapshot as VisitSnapshot,service_details:details?.find(d=>d.visit_id===v.id),photos:(photos??[]).filter(p=>p.visit_id===v.id).map(p=>({storage_path:p.storage_path})),email:emails?.find(e=>e.visit_id===v.id),corrections:(corrections??[]).filter(c=>c.visit_id===v.id)}));
}
