import {z} from 'zod';
import {verifyResendWebhook} from '@/lib/email/webhook';
import {administration} from '@/lib/team/server';
export const runtime='nodejs';
export async function POST(request:Request){
 // Validate the exact original bytes before parsing; no provider payload is logged.
 if(Number(request.headers.get('content-length')??0)>1000000)return new Response(null,{status:413});
 const reader=request.body?.getReader();if(!reader)return new Response(null,{status:400});let raw='';const decoder=new TextDecoder();let count=0;while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>1000000){await reader.cancel();return new Response(null,{status:413});}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();
 if(!verifyResendWebhook(raw,request.headers,process.env.RESEND_WEBHOOK_SECRET))return new Response(null,{status:401});
 try{const event=z.object({type:z.string(),created_at:z.iso.datetime({offset:true}).optional(),data:z.object({email_id:z.string().min(1).max(200)})}).parse(JSON.parse(raw));if(!['email.delivered','email.bounced','email.complained','email.failed'].includes(event.type))return new Response(null,{status:204});const {error}=await administration().rpc('record_report_event',{p_id:request.headers.get('svix-id'),p_provider:event.data.email_id,p_type:event.type,p_occurred:event.created_at??new Date().toISOString()});return new Response(null,{status:error?503:204});}catch{return new Response(null,{status:400});}
}
