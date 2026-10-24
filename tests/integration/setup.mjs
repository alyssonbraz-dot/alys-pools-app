// Local-only integration fixture. Never provision hosted data or send mail.
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
try { process.loadEnvFile('.env.local'); } catch { /* CI can inject local env. */ }
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname)||!key)throw new Error('Integration setup requires the local Supabase URL and server-only local admin key.');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
async function must(result,label){const r=await result;if(r.error)throw new Error(`${label}: ${r.error.message}`);return r.data;}
const run=randomUUID().slice(0,8),password=randomUUID()+'aA1!',email=`field-${run}@example.test`;
const {user}=await must(db.auth.admin.createUser({email,password,email_confirm:true}),'create local operator');
const otherPassword=randomUUID()+'aA1!';
const {user:other}=await must(db.auth.admin.createUser({email:`other-${run}@example.test`,password:otherPassword,email_confirm:true}),'create other-tenant user');
const orgId=randomUUID(),otherOrgId=randomUUID();
await must(db.from('organizations').insert([{id:orgId,name:`Integration ${run}`},{id:otherOrgId,name:`Other tenant ${run}`}]),'create organizations');
await must(db.from('profiles').insert([{id:user.id,organization_id:orgId,role:'owner',display_name:'Local Test Operator'},{id:other.id,organization_id:otherOrgId,role:'technician',display_name:'Other Tenant Technician'}]),'create profiles');
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const stops=[];
for(let i=1;i<=3;i++){
 const customerId=randomUUID(),propertyId=randomUUID(),poolId=randomUUID();
 await must(db.from('customers').insert({id:customerId,organization_id:orgId,name:`Fictional Client ${i}`,email:`report-${run}-${i}@example.test`,email_reports_enabled:true}),'create customer');
 await must(db.from('properties').insert({id:propertyId,organization_id:orgId,customer_id:customerId,name:`Test Property ${i}`,address:`Fictional Service Address ${i}, FL`,gate_notes:'PRIVATE GATE CODE MUST NEVER APPEAR IN REPORT'}),'create property');
 await must(db.from('pools').insert({id:poolId,organization_id:orgId,property_id:propertyId,name:`Pool ${i}`,gallons:15000,water_type:'chlorine',type:'residential',required_readings:['fc','ph'],photo_required:true}),'create pool');
 const stop=await must(db.from('route_stops').insert({organization_id:orgId,property_id:propertyId,technician_id:user.id,service_date:date,position:i}).select('id').single(),'create stop');
 stops.push({id:stop.id,propertyId,poolId,customerId,name:`Test Property ${i}`});
}
const fixture={url,email,password,userId:user.id,orgId,otherUserId:other.id,otherPassword,otherEmail:`other-${run}@example.test`,date,stops};
await writeFile('/tmp/alys-integration-fixture.json',JSON.stringify(fixture),{mode:0o600});
await sharp({create:{width:640,height:480,channels:3,background:{r:25,g:155,b:165}}}).jpeg().toFile('/tmp/alys-test-photo.jpg');
console.log('Local-only integration fixtures provisioned: 2 tenants, 3 stops; credentials stored in /tmp, not logged.');
