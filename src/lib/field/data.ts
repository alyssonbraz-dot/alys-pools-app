import 'server-only';
import {reportStatus,deliveryFailureExplanation} from '@/lib/email/status';
import {allRows,forIds} from '@/lib/pagination';
import type { getOperator } from '@/lib/auth';
import type { RouteData,RouteStop,PoolConfig,VisitHistory,VisitSnapshot } from './types';
import {routeFingerprint} from '@/lib/routing';
import {chemistryPeriod,groupChemistry,type ChemistryRow} from './chemistry';
type Operator=NonNullable<Awaited<ReturnType<typeof getOperator>>>;
export async function loadRoute(operator:Operator,date:string,timeZone?:string):Promise<RouteData> {
 const {db,user,profile}=operator;
 const {error:generateError}=await db.rpc('generate_route',{p_date:date});
 if(generateError)throw new Error('Route generation failed');
 const {data:preferences,error:preferencesError}=await db.rpc('operator_preferences');if(preferencesError)throw new Error('Operator preferences are unavailable.');
 const stops=await allRows((from,to)=>db.from('route_stops').select('id,property_id,technician_id,service_date,position,status,estimated_service_minutes,service_type').eq('service_date',date).order('position').order('id').range(from,to));
 const propertyIds=[...new Set(stops.map(s=>s.property_id))];
 const {data:context,error:contextError}=profile.role==='technician'?await db.rpc('assigned_route_context',{p_date:date}):{data:null,error:null};if(contextError)throw new Error('Unable to load assigned route.');
 const scoped=context as {properties:(RouteStop['property']&{customer_id:string})[];pools:(PoolConfig&{property_id:string})[];customers:{id:string;name:string}[]}|null;
 const [properties,pools,profiles,options]=await Promise.all([
  scoped?Promise.resolve(scoped.properties):forIds(propertyIds,(ids,from,to)=>db.from('properties').select('id,customer_id,name,address,gate_notes,latitude,longitude,service_timezone,unit_system,location_confirmed,country_code').in('id',ids).order('id').range(from,to)),
  scoped?Promise.resolve(scoped.pools):forIds(propertyIds,(ids,from,to)=>db.from('pools').select('id,property_id,name,gallons,checklist,required_readings,photo_required,photo_scope_required,reference_ranges').eq('status','active').in('property_id',ids).order('id').range(from,to)),
  allRows((from,to)=>db.from('profiles').select('id,display_name,role').order('id').range(from,to)),
  profile.role==='technician'?Promise.resolve([]):allRows((from,to)=>db.from('properties').select('id,name,address').order('id').range(from,to))
 ]);
 const customers=scoped?scoped.customers:await forIds([...new Set(properties.map(p=>p.customer_id))],(ids,from,to)=>db.from('customers').select('id,name').in('id',ids).order('id').range(from,to));
 // Chemical context is scoped to visible current properties; each RPC accepts at most300 IDs.
 const visibleIds=properties.map(p=>p.id);
 const window=chemistryPeriod(date);
 const history:ChemistryRow[]=[];
 for(let batch=0;batch<visibleIds.length;batch+=100)for(let offset=0;;offset+=500){
  const {data:rows,error:historyError}=await db.rpc('route_chemistry_history_v21',{p_property_ids:visibleIds.slice(batch,batch+100),p_from:window.from,p_through:window.through}).range(offset,offset+499);
  if(historyError)throw new Error('Unable to load chemical history');
  history.push(...(rows as ChemistryRow[]));
  if(rows.length<500)break;
 }
 const chemistry=groupChemistry(history,date,Object.fromEntries(pools.map(pool=>[pool.id,properties.find(p=>p.id===pool.property_id)?.service_timezone??'America/New_York'])));
 const mapped:RouteStop[]=stops.filter(s=>(!timeZone||properties.some(p=>p.id===s.property_id&&p.service_timezone===timeZone))&&(profile.role!=='technician'||properties.some(p=>p.id===s.property_id))).map(s=>{
   const property=properties?.find(p=>p.id===s.property_id);
   const customer=customers?.find(c=>c.id===property?.customer_id);
   if(!property||!customer)throw new Error('Stop relationships missing');
   const stopPools=(pools??[]).filter(p=>p.property_id===property.id) as PoolConfig[];
   const last:NonNullable<RouteStop['last_readings']>={};
   const poolHistory:NonNullable<RouteStop['chemistry_history']>={};
   for(const pool of stopPools){
    poolHistory[pool.id]=(chemistry[pool.id]??[]).map(entry=>({...entry,reference_ranges:pool.reference_ranges}));
    const recent=poolHistory[pool.id].find(entry=>Object.keys(entry.readings).length>0);
    if(recent)last[pool.id]={recorded_at:recent.completed_at,readings:recent.readings};
   }
   return {...s,property:{id:property.id,name:property.name,address:property.address,gate_notes:property.gate_notes,latitude:property.latitude,longitude:property.longitude,service_timezone:property.service_timezone,unit_system:property.unit_system,location_confirmed:property.location_confirmed,country_code:property.country_code},customer,pools:stopPools,last_readings:last,chemistry_history:poolHistory};
 });
 const plans=await allRows((from,to)=>db.from('route_plans').select('technician_id,start_latitude,start_longitude,start_time,calculation,fingerprint').eq('service_date',date).order('id').range(from,to));
 return {...preferences,timeZone:timeZone??preferences.timeZone,route_plans:Object.fromEntries((plans??[]).map(p=>{const open=mapped.filter(s=>s.technician_id===p.technician_id&&['pending','in_progress'].includes(s.status));const geo=open.filter(s=>s.property.location_confirmed&&s.property.latitude!=null&&s.property.longitude!=null).map(s=>({id:s.id,latitude:s.property.latitude!,longitude:s.property.longitude!,service_minutes:s.estimated_service_minutes??20}));return [p.technician_id,{...p,calculation:geo.length===open.length&&p.fingerprint===routeFingerprint(geo)&&(p.calculation?.service_timezone??'America/New_York')===(timeZone??preferences.timeZone)?p.calculation:null}];})),userId:user.id,orgId:profile.organization_id,displayName:profile.display_name,role:profile.role,date,stops:mapped,
  properties:options,technicians:profiles?.filter(p=>['owner','admin','technician'].includes(p.role)).map(({id,display_name})=>({id,display_name}))};
}
export async function loadHistory(operator:Operator,customerId?:string,options:{query?:string;status?:string;offset?:number;from?:string|null;technicianId?:string|null;visitId?:string|null}={}):Promise<VisitHistory[]> {
 const {db}=operator;
 const {data:visits,error}=await db.rpc('search_visits_v2',{p_customer:customerId??null,p_query:options.query??'',p_status:options.status??'all',p_offset:options.offset??0,p_limit:51,p_from:options.from??null,p_tech:options.technicianId??null,p_visit:options.visitId??null});
 if(error)throw new Error('History query failed');
 const allowed=visits??[];
 if(!allowed.length)return [];
 const ids=allowed.map((v:{id:string})=>v.id);
 const [photos,emails,corrections,details,people,issues,bodies]=await Promise.all([
  forIds(ids,(ids,from,to)=>db.from('visit_photos').select('visit_id,storage_path').in('visit_id',ids).order('id').range(from,to)),
  forIds(ids,(ids,from,to)=>db.from('email_delivery_logs').select('id,visit_id,status,error,sent_at,locked_until,delivered_at,delivery_outcome').in('visit_id',ids).order('id').range(from,to)),
  forIds(ids,(ids,from,to)=>db.from('visit_corrections').select('id,visit_id,note,created_at,actor_id').in('visit_id',ids).order('created_at').order('id').range(from,to)),
  forIds(ids,(ids,from,to)=>db.from('visit_service_details').select('visit_id,technician_notes,equipment_problems,filter_cleaning,repairs_performed').in('visit_id',ids).order('id').range(from,to)),
  allRows((from,to)=>db.from('profiles').select('id,display_name').order('id').range(from,to)),
  forIds(ids,(ids,from,to)=>db.from('visit_issue_flags').select('visit_id,flags').in('visit_id',ids).order('id').range(from,to)),
  forIds(ids,(ids,from,to)=>db.from('visit_photo_bodies').select('visit_id,storage_path,pool_id').in('visit_id',ids).order('id').range(from,to))
 ]);
 return allowed.map((v:{id:string;route_stop_id:string;completed_at:string;technician_id:string;snapshot:VisitSnapshot})=>({id:v.id,route_stop_id:v.route_stop_id,completed_at:v.completed_at,technician_name:v.snapshot.technician_name??people.find(p=>p.id===v.technician_id)?.display_name,snapshot:v.snapshot,issue_flags:issues.find(i=>i.visit_id===v.id)?.flags??[],service_details:details.find(d=>d.visit_id===v.id),photos:photos.filter(p=>p.visit_id===v.id).map(p=>({storage_path:p.storage_path,pool_name:v.snapshot.pools.find(pool=>pool.pool_id===bodies.find(b=>b.storage_path===p.storage_path)?.pool_id)?.pool_name})),email:((mail)=>mail?{...mail,display_status:reportStatus(mail),error:operator.profile.role==='owner'?deliveryFailureExplanation(mail.delivery_outcome&&mail.delivery_outcome!=='delivered'?mail.delivery_outcome:mail.error):null}:undefined)(emails.find(e=>e.visit_id===v.id)),corrections:corrections.filter(c=>c.visit_id===v.id)}));
}
