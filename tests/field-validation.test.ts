import {describe,it,expect} from 'vitest';
import {completionSchema} from '../src/lib/field/validation';
import {boundedJson,sameOrigin,matchesDeviceScope} from '../src/lib/http';
const payload={id:'00000000-0000-4000-8000-000000000001',stop_id:'00000000-0000-4000-8000-000000000002',notes:'',photo_paths:[],pools:[{pool_id:'00000000-0000-4000-8000-000000000003',tasks:['Test Water'],readings:{fc:0,ph:7.5},dosages:[{product:'Liquid Chlorine',quantity:1,unit:'gal'}]}]};
describe('field payload validation',()=>{
 it('preserves zero FC, missing optional readings and exact recorded doses',()=>{expect(completionSchema.parse(payload)).toEqual(payload);});
 it('rejects negative readings, oversized units, amounts and undeclared fields',()=>{
  for(const changed of [
   {...payload,pools:[{...payload.pools[0],readings:{fc:-1}}]},
   {...payload,pools:[{...payload.pools[0],dosages:[{product:'Other',quantity:10001,unit:'lb'}]}]},
   {...payload,pools:[{...payload.pools[0],dosages:[{product:'Other',quantity:1,unit:'a'.repeat(21)}]}]},
   {...payload,organization_id:'other'}
  ])expect(completionSchema.safeParse(changed).success).toBe(false);
 });
 it('accepts an explicit device completion time for delayed sync',()=>{const input={...payload,completed_at:'2026-10-21T20:00:00Z'};expect(completionSchema.parse(input).completed_at).toBe(input.completed_at);});
});
it('rejects cross-origin and wrong queued identity',()=>{
 const req=new Request('https://app.example/api/visits',{headers:{origin:'https://evil.example','x-alys-user-id':'other'}});
 expect(sameOrigin(req)).toBe(false);expect(matchesDeviceScope(req,'user','org')).toBe(false);
});
it('bounds chunked JSON before parsing regardless of content-length',async()=>{
 const request=new Request('https://app.example/api/visits',{method:'POST',body:'{"body":"'+'a'.repeat(101)+'"}'});
 await expect(boundedJson(request,100)).rejects.toThrow('Payload too large');
 expect(await boundedJson(new Request('https://app.example',{method:'POST',body:'{"ok":true}'}),100)).toEqual({ok:true});
});
it('checks incoming host when Next request URL uses its bind hostname',()=>{
 const internal=new Request('http://0.0.0.0:3000/api/photos',{headers:{host:'127.0.0.1:3000',origin:'http://127.0.0.1:3000','sec-fetch-site':'same-origin'}});
 expect(sameOrigin(internal)).toBe(true);
 const hostile=new Request('http://0.0.0.0:3000/api/photos',{headers:{host:'127.0.0.1:3000',origin:'https://evil.example'}});
 expect(sameOrigin(hostile)).toBe(false);
});
it('accepts only distinct predefined issue flags and never invents readings for access problems',()=>{
 expect(completionSchema.parse({...payload,issue_flags:['green_pool','equipment_issue','low_water','access_denied','other']})).toMatchObject({issue_flags:['green_pool','equipment_issue','low_water','access_denied','other']});
 expect(completionSchema.safeParse({...payload,issue_flags:['invented']})).toMatchObject({success:false});
 expect(completionSchema.safeParse({...payload,issue_flags:['green_pool','green_pool']})).toMatchObject({success:false});
});
it('accepts staff-only service details alongside body-specific photo metadata without changing field names',()=>{
 const payload={id:'a0000000-0000-4000-8000-000000000001',stop_id:'a0000000-0000-4000-8000-000000000002',notes:'Public note',pools:[{pool_id:'a0000000-0000-4000-8000-000000000003',tasks:['Test Water'],readings:{fc:3,ph:7.4},dosages:[]}],photo_paths:[],photo_assignments:{},service_details:{technician_notes:'Private note',equipment_problems:'Pump',filter_cleaning:'Checked',repairs_performed:''}};
 expect(completionSchema.parse(payload).service_details).toEqual(payload.service_details);
});
