import { getOperator } from '@/lib/auth';
import { loadHistory } from '@/lib/field/data';
import { boundedJson,sameOrigin,apiError,json } from '@/lib/http';
import { z } from 'zod';
export async function GET(request:Request) {
 try {
 const operator=await getOperator();if(!operator)return json({error:'Please sign in.'},401);
 const params=new URL(request.url).searchParams;
 const customer=params.get('customer_id');
 const options=z.object({from:z.iso.date().nullable(),technicianId:z.uuid().nullable(),visitId:z.uuid().nullable(),query:z.string().max(100),status:z.enum(['all','pending','sent','failed']),offset:z.coerce.number().int().min(0).max(1000000)}).parse({from:params.get('from'),technicianId:params.get('technician_id'),visitId:params.get('visit_id'),query:params.get('q')??'',status:params.get('status')??'all',offset:params.get('offset')??0});
 if(customer)z.uuid().parse(customer);
 const visits=await loadHistory(operator,customer??undefined,options);
 return json({role:operator.profile.role,visits:visits.slice(0,50),hasMore:visits.length>50});
 }catch(error){return apiError(error);}
}

export async function POST(request:Request){
 if(!sameOrigin(request))return json({error:'Invalid request origin.'},403);
 try{
 const operator=await getOperator();if(!operator)return json({error:'Please sign in.'},401);
 if(!['owner','admin'].includes(operator.profile.role))return json({error:'Manager access required.'},403);
 const parsed=z.object({visit_id:z.uuid(),note:z.string().trim().min(2).max(2000)}).parse(await boundedJson(request,10000));
 const {error}=await operator.db.rpc('add_visit_correction',{p_visit_id:parsed.visit_id,p_note:parsed.note});
 if(error)throw new Error('Correction rejected');
 return json({ok:true});
 }catch(error){return apiError(error);}
}
