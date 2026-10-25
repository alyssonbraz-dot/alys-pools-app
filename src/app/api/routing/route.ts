import {z} from 'zod';
import {getOperator} from '@/lib/auth';
import {sameOrigin,boundedJson,json,apiError} from '@/lib/http';
import {calculateDriving,floridaStart,routeFingerprint,type GeoStop} from '@/lib/routing';
const schema=z.object({date:z.iso.date(),technician_id:z.uuid(),action:z.enum(['estimate','optimize','save_start']),start_latitude:z.number().min(-90).max(90).nullable(),start_longitude:z.number().min(-180).max(180).nullable(),start_time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)}).refine(p=>(p.start_latitude===null)===(p.start_longitude===null));
export async function POST(request:Request){if(!sameOrigin(request))return json({error:'Invalid request origin.'},403);try{const op=await getOperator();if(!op)return json({error:'Please sign in.'},401);const input=schema.parse(await boundedJson(request,2000));if(!['owner','admin'].includes(op.profile.role)&&input.technician_id!==op.user.id)return json({error:'Route access denied.'},403);
const {data:stops,error}=await op.db.from('route_stops').select('id,status,position,property_id,estimated_service_minutes,properties(latitude,longitude)').eq('service_date',input.date).eq('technician_id',input.technician_id).order('position').order('id');if(error)throw error;
const open=(stops??[]).filter(s=>['pending','in_progress'].includes(s.status));
const row={organization_id:op.profile.organization_id,technician_id:input.technician_id,service_date:input.date,start_latitude:input.start_latitude,start_longitude:input.start_longitude,start_time:input.start_time,calculation:null as unknown,fingerprint:null as string|null};
let reorderedIds:string[]|null=null;
if(input.action!=='save_start'){
 const url=process.env.ROUTING_API_URL;if(!url)return json({error:'Driving estimates require ROUTING_API_URL. No road distance or optimization has been calculated.'},503);
 const geo:GeoStop[]=open.map(s=>{const p=Array.isArray(s.properties)?s.properties[0]:s.properties;if(!p||p.latitude==null||p.longitude==null)throw new Error('Coordinates are missing. Set latitude and longitude in the customer record.');return {id:s.id,latitude:p.latitude,longitude:p.longitude,service_minutes:s.estimated_service_minutes};});
 const plan=await calculateDriving(geo,{baseUrl:url,optimize:input.action==='optimize',start:input.start_latitude==null?undefined:{latitude:input.start_latitude,longitude:input.start_longitude!},startedAt:floridaStart(input.date,input.start_time)});
 const byId=new Map(geo.map(s=>[s.id,s]));if(input.action==='optimize'){const queue=[...plan.ordered_stop_ids];const ids=stops!.map(s=>['pending','in_progress'].includes(s.status)?queue.shift()!:s.id);reorderedIds=ids;}
 row.calculation=plan;row.fingerprint=routeFingerprint(plan.ordered_stop_ids.map(id=>byId.get(id)!));
}
const {error:saveError}=await op.db.rpc('save_driving_plan',{p_row:row,p_ids:reorderedIds,p_expected:(stops??[]).map(({id,status,position})=>({id,status,position}))});if(saveError?.code==='40001')return json({error:'Route changed. Refresh and calculate again.'},409);if(saveError)throw saveError;return json({plan:row.calculation});
}catch(e){if(e instanceof Error&&['Driving provider unavailable','No driving connection between stops','Coordinates are missing. Set latitude and longitude in the customer record.','Choose between 1 and 50 open stops'].includes(e.message))return json({error:e.message},422);return apiError(e);}}
