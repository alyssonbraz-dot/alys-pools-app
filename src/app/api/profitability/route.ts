import {z} from 'zod';
import {getOperator} from '@/lib/auth';
import {sameOrigin,boundedJson,json,apiError} from '@/lib/http';

const money=z.number().int().min(0).max(10000000);
const inputSchema=z.object({
 customer_id:z.uuid(),
 visits_per_month:z.number().finite().min(0).max(62),
 technician_cost_per_visit_cents:money,
 chemicals_per_visit_cents:money,
 fuel_vehicle_per_visit_cents:money,
 other_per_visit_cents:money,
 monthly_overhead_cents:money
}).strict();

export async function POST(request:Request){
 if(!sameOrigin(request))return json({error:'Invalid origin.'},403);
 try{
  const op=await getOperator();
  if(!op)return json({error:'Please sign in.'},401);
  if(op.profile.role!=='owner')return json({error:'Owner access required.'},403);
  const parsed=inputSchema.safeParse(await boundedJson(request,3000));
  if(!parsed.success)return json({error:'Check the cost fields and try again.'},422);
  const input=parsed.data;
  const {data:customer,error:lookupError}=await op.db.from('customers').select('id').eq('id',input.customer_id).eq('organization_id',op.profile.organization_id).is('archived_at',null).maybeSingle();
  if(lookupError)throw lookupError;
  if(!customer)return json({error:'Customer not found.'},404);
  const {error}=await op.db.from('customer_profit_costs').upsert({...input,organization_id:op.profile.organization_id,updated_at:new Date().toISOString()},{onConflict:'customer_id'});
  if(error)throw error;
  return json({ok:true});
 }catch(error){return apiError(error);}
}
