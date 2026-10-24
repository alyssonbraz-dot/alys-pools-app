import { getOperator } from '@/lib/auth';
import { stopMutationSchema } from '@/lib/field/validation';
import { boundedJson,sameOrigin,apiError,json } from '@/lib/http';
export async function POST(request:Request) {
 if(!sameOrigin(request))return json({error:'Invalid request origin.'},403);
 try {
 const operator=await getOperator();if(!operator)return json({error:'Please sign in.'},401);
 const data=stopMutationSchema.parse(await boundedJson(request,20000));
 const {db,user,profile}=operator;
 let result;
 if(data.action==='add'){
  if(!['owner','admin'].includes(profile.role))return json({error:'Manager access required.'},403);
  result=await db.rpc('add_route_stop',{p_property_id:data.property_id,p_technician_id:data.technician_id??user.id,p_date:data.date});
 }else if(data.action==='reorder')result=await db.rpc('reorder_route',{p_stop_ids:data.stop_ids});
 else result=await db.rpc('set_stop_status',{p_stop_id:data.stop_id,p_status:data.action==='start'?'in_progress':'skipped'});
 if(result.error)throw new Error('Stop mutation failed');
 return json({ok:true,id:result.data});
 }catch(error){return apiError(error);}
}
