import { describe, expect, it, vi } from 'vitest';
import { emailConfiguration } from '../src/lib/email/config';
import { createServiceReport } from '../src/lib/email/report';
import { DeliveryError, sendReport } from '../src/lib/email/provider';
const snapshot = {
  customer_name: 'Test Customer', property_name: 'Beach & Pool <Test>',
  gate_notes: 'GATE-SECRET-123', internal_notes: 'PRIVATE-TECH-SECRET',
  pools: [{ pool_id: 'pool-1', pool_name: 'Pool 1', tasks: ['Skim Surface'], readings: {fc:3,ph:7.5}, dosages:[{product:'Liquid Chlorine',quantity:1,unit:'gal'},{product:'Muriatic Acid',quantity:12,unit:'fl oz'}] }]
};
const make = () => createServiceReport({snapshot,completedAt:'2026-10-22T15:30:00Z',recipient:'test@example.com',from:'ALYS <reports@example.com>',photos:[{content:'real-image-bytes-base64',filename:'service-photo-1.jpg'}]});
describe('customer service report', () => {
 it('contains only recorded tasks, readings, quantities and actual inline attachment', () => {
  const report=make();
  expect(report.to).toEqual(['test@example.com']);
  expect(report.html).toContain('Skim Surface');
  expect(report.html).not.toContain('Brush Pool');
  expect(report.html).toContain('3 ppm');
  expect(report.html).toContain('Muriatic Acid: 12 fl oz');
  expect(report.html).not.toContain('GATE-SECRET');expect(report.text).not.toContain('PRIVATE-TECH');
  expect(report.html).toContain('Beach &amp; Pool &lt;Test&gt;');
  expect(report.html).toContain('cid:service-photo-1');
  expect(report.attachments[0]).toMatchObject({content:'real-image-bytes-base64',content_id:'service-photo-1'});
 });
 it('does not invent missing measurements or checklist tasks',()=>{
  const report=createServiceReport({snapshot:{...snapshot,pools:[{pool_id:'p',pool_name:'Spa',tasks:[],readings:{},dosages:[]}]},completedAt:'2026-01-01T02:00:00Z',recipient:'test@example.com',from:'reports@example.com'});
  expect(report.subject).toContain('December 31, 2025');
  expect(report.html).not.toContain('WATER TEST RESULTS');
  expect(report.attachments).toEqual([]);
 });
 it('rejects an invalid recipient before provider invocation',()=>{expect(()=>createServiceReport({snapshot,completedAt:'2026-10-22',recipient:'invalid\nBcc:other@example.com',from:'reports@example.com'})).toThrow();});
});
describe('email delivery provider',()=>{
 it('uses the same key and request bytes on a retry and only accepts a provider acknowledgement',async()=>{
  const calls:{key:string;body:string}[]=[];
  const provider=vi.fn(async (_url:unknown, init?:RequestInit)=>{
   calls.push({key:new Headers(init?.headers).get('Idempotency-Key')!,body:String(init?.body)});
   return calls.length===1?new Response('unavailable',{status:503}):Response.json({id:'provider-receipt-1'});
  });
  const request=make();
  await expect(sendReport(request,'stable-visit-key','test-key',provider)).rejects.toMatchObject({retryable:true});
  await expect(sendReport(request,'stable-visit-key','test-key',provider)).resolves.toBe('provider-receipt-1');
  expect(calls[0]).toEqual(calls[1]);
 });
 it('does not treat an empty successful response as sent',async()=>{
  await expect(sendReport(make(),'key','test-key',vi.fn(async()=>Response.json({})))).rejects.toBeInstanceOf(DeliveryError);
 });
 it('does not automatically retry a rejected sender/recipient',async()=>{
  await expect(sendReport(make(),'key','test-key',vi.fn(async()=>new Response('',{status:422})))).rejects.toMatchObject({retryable:false});
 });
 it('is disabled without explicit enablement and complete server config',()=>{
  expect(emailConfiguration({})).toBeNull();
  expect(emailConfiguration({EMAIL_DELIVERY_ENABLED:'true',RESEND_API_KEY:'key'})).toBeNull();
  expect(emailConfiguration({EMAIL_DELIVERY_ENABLED:'true',RESEND_API_KEY:'key',SUPABASE_SERVICE_ROLE_KEY:'service',NEXT_PUBLIC_SUPABASE_URL:'https://local.example.com',EMAIL_FROM:'ALYS <reports@example.com>'})).not.toBeNull();
 });
});
