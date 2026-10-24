// Integration assertions through real local Auth, PostgREST and Storage; no external emails.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
try{process.loadEnvFile('.env.local');}catch{/* Allow local CI bindings. */}
const fixture=JSON.parse(await readFile('/tmp/alys-integration-fixture.json','utf8'));
if(!['127.0.0.1','localhost'].includes(new URL(fixture.url).hostname))throw new Error('Local integration only.');
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const db=createClient(fixture.url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const other=createClient(fixture.url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const anon=createClient(fixture.url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const signup=await anon.auth.signUp({email:`signup-denied-${randomUUID()}@example.test`,password:randomUUID()+'aA1!'});assert.ok(signup.error,'public signup remains disabled');
assert.equal((await db.auth.signInWithPassword({email:fixture.email,password:fixture.password})).error,null,'owner login');
assert.equal((await other.auth.signInWithPassword({email:fixture.otherEmail,password:fixture.otherPassword})).error,null,'other-tenant login');
assert.equal((await db.from('route_stops').select('id')).data.length,3,'owner reads own route');
assert.equal((await other.from('route_stops').select('id')).data.length,0,'other tenant cannot read route');
assert.equal((await other.from('customers').select('id')).data.length,0,'other technician cannot read customers');
assert.ok((await anon.from('customers').select('id')).error,'anon customers denied');
assert.ok((await other.from('customers').insert({organization_id:fixture.orgId,name:'Forbidden fixture'})).error,'cross-tenant write denied');
assert.ok((await db.from('profiles').update({role:'admin'}).eq('id',fixture.userId)).error,'browser role changes denied');
const before=await db.from('visits').select('id');assert.equal(before.data.length,0,'no visits initially');
const payload={id:randomUUID(),stop_id:fixture.stops[0].id,pools:[{pool_id:fixture.stops[0].poolId,tasks:[],readings:{fc:3,ph:7.5},dosages:[]}],notes:'',photo_paths:[]};
const incomplete=await db.rpc('complete_visit',{p_payload:payload});assert.ok(incomplete.error,'required photo enforced');
assert.equal((await db.from('visits').select('id')).data.length,0,'invalid completion rolled back');
const upload=await db.storage.from('visit-photos').upload(`${fixture.orgId}/${fixture.stops[0].id}/${randomUUID()}.jpg`,Buffer.from('invalid JPEG'),{contentType:'image/jpeg'});
assert.ok(upload.error,'direct browser Storage insertion denied');
assert.equal((await db.rpc('claim_email_jobs',{p_limit:1})).error?.code,'42501','session cannot claim worker jobs');
console.log('Actual local Auth/PostgREST/Storage assertions passed: login, tenant scopes, validation, rollback, immutable roles, private uploads, privileged outbox.');
