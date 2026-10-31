import {customerSummary} from '@/lib/customer-summary';
import {customerValidationMessage} from '@/lib/customer-errors';
import {getOperator} from '@/lib/auth';
import {sameOrigin,boundedJson,json,apiError} from '@/lib/http';
import {customerManagementSchema} from '@/lib/customer-management';
export async function GET(){
 try{
  const op=await getOperator();if(!op)return json({error:'Please sign in.'},401);
  if(!['owner','admin'].includes(op.profile.role))return json({error:'Manager access required.'},403);
  const {data:people,error:peopleError}=await op.db.from('profiles').select('id,display_name,role');if(peopleError)throw peopleError;
  const technicians=(people??[]).filter(t=>['owner','admin','technician'].includes(t.role));
  const owner=op.profile.role==='owner',customers:unknown[]=[],now=new Date();
  for(let offset=0;;offset+=500){
   const {data:page,error}=await op.db.from('customers').select('id,name,first_name,last_name,email,phone,status,created_at,service_frequency,assigned_technician_id,email_reports_enabled,customer_tags(tag),customer_details(billing_address,monthly_price_cents,internal_notes),contracts(source,billing_model,status,price_cents),properties(id,name,address,latitude,longitude,location_confirmed,created_at,service_timezone,pools(id,status),recurring_schedules(active,start_on,end_on,days_of_week,technician_id))').is('archived_at',null).order('name').order('id').range(offset,offset+499);
   if(error)throw error;
   for(const c of page??[]){
    c.properties.sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
    const {contracts,properties,...contact}=c;
    customers.push({...contact,customer_details:Array.isArray(c.customer_details)?c.customer_details[0]??null:c.customer_details,
     summary:customerSummary({...c,contracts},technicians,owner,now),
     properties:properties.map(({id,name,address,latitude,longitude,location_confirmed})=>({id,name,address,latitude,longitude,location_confirmed}))});
   }
   if(!page||page.length<500)break;
  }
  return json({customers,technicians});
 }catch(e){return apiError(e);}
}
export async function POST(request:Request){if(!sameOrigin(request))return json({error:'Invalid request origin.'},403);try{const op=await getOperator();if(!op)return json({error:'Please sign in.'},401);if(!['owner','admin'].includes(op.profile.role))return json({error:'Manager access required.'},403);const parsed=customerManagementSchema.safeParse(await boundedJson(request,18000));if(!parsed.success)return json({error:'Review the fields below and try again.',fieldErrors:parsed.error.issues.map(i=>({path:i.path.join('.'),message:customerValidationMessage(i.path.join('.'))}))},422);const payload=parsed.data;const {data,error}=await op.db.rpc('save_customer_profile',{p_payload:payload});if(error)throw error;return json({id:data});}catch(e){return apiError(e);}}
