import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@supabase/supabase-js',()=>({createClient:vi.fn()}));
import { createClient } from '@supabase/supabase-js';
import { processEmailQueue } from '../src/lib/email/worker';
import type { ProviderPayload } from '../src/lib/email/report';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
function environment() {
 vi.stubEnv('EMAIL_DELIVERY_ENABLED','true');vi.stubEnv('RESEND_API_KEY','fake-provider-key');
 vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','fake-local-server-key');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','http://127.0.0.1:54321');vi.stubEnv('EMAIL_FROM','reports@example.test');
}
function fakeOutbox() {
 const job={id:'job-1',visit_id:'visit-1',recipient:'customer@example.test',claim_token:'claim-1',idempotency_key:'visit-1',request_payload:null as ProviderPayload|null,status:'pending'};
 const audit:{success:boolean;error?:string}[]=[];
 const rows:Record<string,unknown>={
  visits:{route_stop_id:'stop-1',completed_at:'2026-10-22T16:00:00Z',snapshot:{property_name:'Fictional Pool',customer_name:'Fictional Customer',pools:[{pool_id:'pool-1',pool_name:'Pool',tasks:['Test Water'],readings:{fc:3,ph:7.5},dosages:[]}]}},
  route_stops:{property_id:'property-1'},properties:{customer_id:'customer-1'},customers:{email:job.recipient,email_reports_enabled:true,organization_id:'local-org'},organizations:{settings:{}},visit_issue_flags:{flags:['equipment_issue']},visit_photos:[{storage_path:'private/photo.jpg'}]
 };
 function chain(value:unknown) {
  return {select:()=>chain(value),eq:()=>chain(value),single:async()=>({data:value,error:null}),maybeSingle:async()=>({data:value,error:null}),order:async()=>({data:value,error:null})};
 }
 const download=vi.fn(async()=>({data:new Blob(['actual-photo-bytes'],{type:'image/jpeg'}),error:null}));
 const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{
  if(name==='claim_email_jobs')return {data:job.status==='sent'?[]:[{...job}],error:null};
  if(name==='freeze_email_payload') {job.request_payload??=args.p_payload as ProviderPayload;return {data:job.request_payload,error:null};}
  if(name==='finish_email_job') {job.status=args.p_success?'sent':'failed';audit.push({success:!!args.p_success,error:args.p_error as string|undefined});return {data:true,error:null};}
  return {data:null,error:null};
 });
 const db={rpc,from:(table:string)=>chain(rows[table]),storage:{from:()=>({download})}};
 vi.mocked(createClient).mockReturnValue(db as unknown as ReturnType<typeof createClient>);
 return {job,audit,rpc,download,rows};
}
describe('background email worker',()=>{
 it('does not claim jobs or contact a provider while disabled',async()=>{
  vi.stubEnv('EMAIL_DELIVERY_ENABLED','false');
  expect(await processEmailQueue()).toEqual({enabled:false,processed:0,sent:0});expect(createClient).not.toHaveBeenCalled();
 });
 it('keeps a failed attempt retryable and sends once with identical frozen request/photo after recovery',async()=>{
  environment();const state=fakeOutbox();const sentBodies:string[]=[];
  const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{
   sentBodies.push(String(init?.body));
   expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('alys-service-visit-1');
   if(sentBodies.length===1)throw new Error('lost connection');
   return Response.json({id:'provider-receipt'});
  });
  vi.stubGlobal('fetch',fetcher);
  expect(await processEmailQueue()).toEqual({enabled:true,processed:1,sent:0});
  expect(state.job.status).toBe('failed');expect(state.audit[0].success).toBe(false);
  expect(await processEmailQueue()).toEqual({enabled:true,processed:1,sent:1});
  expect(state.job.status).toBe('sent');expect(state.audit[1].success).toBe(true);
  expect(sentBodies[0]).toBe(sentBodies[1]);expect(JSON.parse(sentBodies[0]).attachments[0].content).toBe(Buffer.from('actual-photo-bytes').toString('base64'));
  expect(state.download).toHaveBeenCalledTimes(1);
  expect(await processEmailQueue()).toEqual({enabled:true,processed:0,sent:0});expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('honors a customer disabling reports before the queued job is sent',async()=>{
  environment();const state=fakeOutbox();
  state.rows.customers={email:'customer@example.test',email_reports_enabled:false};
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  expect((await processEmailQueue()).sent).toBe(0);expect(fetcher).not.toHaveBeenCalled();expect(state.audit[0].error).toContain('disabled');
 });
});

it('blocks real provider calls for demo tenants and bounced recipients even when mail is configured',async()=>{
 for(const mode of ['demo','bounce']){environment();const state=fakeOutbox();if(mode==='demo')state.rows.organizations={settings:{demo:true}};else state.rows.customers={email:'customer@example.test',email_reports_enabled:true,email_delivery_state:'bounced',organization_id:'local-org'};const provider=vi.fn();vi.stubGlobal('fetch',provider);expect((await processEmailQueue()).sent).toBe(0);expect(provider).not.toHaveBeenCalled();expect(state.audit[0].error).toBe(mode==='demo'?'demo_delivery_blocked':'recipient_delivery_blocked');}
});
