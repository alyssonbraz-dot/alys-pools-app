import { after } from 'next/server';
import { getOperator } from '@/lib/auth';
import { completionSchema } from '@/lib/field/validation';
import { boundedJson,sameOrigin,json,matchesDeviceScope } from '@/lib/http';
import { processEmailQueue } from '@/lib/email/worker';
export async function POST(request:Request) {
 if(!sameOrigin(request))return json({error:'Invalid request origin.'},403);
 try {
  const operator=await getOperator();if(!operator)return json({error:'Please sign in again before syncing.'},401);
  if(!matchesDeviceScope(request,operator.user.id,operator.profile.organization_id))return json({error:'Account changed. Sign in with the account that saved this visit.'},403);
  if(Number(request.headers.get('content-length')??0)>100000)return json({error:'Visit payload is too large.'},413);
  const parsed=completionSchema.safeParse(await boundedJson(request,100000));
  if(!parsed.success)return json({error:'Check readings, chemical amounts and units. This visit was not accepted; correct the saved visit and retry.'},422);
  const payload=parsed.data;
  const {db}=operator;
  const {data,error}=await db.rpc('complete_visit',{p_payload:payload});
  if(error){
   if(error.code==='22023')return json({error:'A required field or photo is missing, or the pool setup changed. Correct the saved visit and retry.'},422);
   if(error.code==='42501')return json({error:'Access denied. Sign in with the assigned account.'},403);
   if(error.code==='23505')return json({error:'This stop already has a completed visit. Check History before retrying.'},409);
   return json({error:'Confirmation was interrupted. Keep this saved visit and retry safely with its original ID.'},503);
  }
  // The transaction is already committed. Secondary queries must never turn acceptance into a validation failure.
  let nextId:null|string=null;
  try {
   const {data:stop}=await db.from('route_stops').select('service_date,technician_id').eq('id',payload.stop_id).single();
   if(stop){const {data:next}=await db.from('route_stops').select('id').eq('service_date',stop.service_date).eq('technician_id',stop.technician_id).in('status',['pending','in_progress']).order('position').order('id').limit(1);nextId=next?.[0]?.id??null;}
  }catch{/* Route refresh can recover the next stop without rewriting the visit. */}
  after(async()=>{try{await processEmailQueue({limit:3});}catch{/* The durable outbox remains available for the scheduled worker. */}});
  return json({...data,next_stop_id:nextId});
 }catch{return json({error:'Confirmation was interrupted. Your local visit is kept for safe retry.'},503);}
}
