import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
try{process.loadEnvFile('.env.local');}catch{}
const fixture=JSON.parse(readFileSync('/tmp/alys-integration-fixture.json','utf8'));
if(!['localhost','127.0.0.1'].includes(new URL(fixture.url).hostname)||process.env.NEXT_PUBLIC_SUPABASE_URL!==fixture.url)throw new Error('Recovery integration tests require the exact local Supabase fixture project');
const admin=createClient(fixture.url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const recovery=readFileSync('scripts/sql/recover-staging-owner.sql','utf8').match(/do \$alys_recovery\$[\s\S]*?\$alys_recovery\$;/i)![0];
function recover(config:Record<string,string>){const json=JSON.stringify(config).replaceAll("'","''");execFileSync('docker',['exec','-i','supabase_db_alys-pool-manager','psql','-U','postgres','-v','ON_ERROR_STOP=1'],{input:"begin;select set_config('alys.owner_recovery','"+json+"',true);\n"+recovery+'\ncommit;',stdio:['pipe','pipe','pipe']});}
async function login(page:Page,email:string,password:string){await page.goto('/app/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();}
test('existing Auth-only staging user recovers into the exact existing organization and reaches all Owner destinations',async({page})=>{
 const email='owner-recovery-'+randomUUID()+'@example.test',password=randomUUID()+'aA1!';
 const {data:created,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(error).toBeNull();const id=created.user!.id;
 const organization=(await admin.from('organizations').select('id,name').eq('id',fixture.orgId).single()).data!;
 const before=(await admin.from('organizations').select('id',{count:'exact',head:true})).count;
 await login(page,email,password);await expect(page).toHaveURL(/\/app\/login\?message=membership/);
 await expect(page.locator('.login-card').getByRole('alert')).toContainText('Your account needs an organization role.');
 expect((await page.request.get('/app/api/session')).status()).toBe(401);
 // Old initial-setup entry point now refuses to duplicate the matching organization.
 let setupError='';try{execFileSync(process.execPath,['scripts/setup-owner.mjs','--env-file=.env.local','--project-host=127.0.0.1','--email='+email,'--company='+organization.name],{env:{...process.env,ALYS_INITIAL_OWNER_PASSWORD:password},stdio:['ignore','pipe','pipe']});}catch(e){setupError=String((e as {stderr?:Buffer}).stderr);}
 expect(setupError).toContain('A matching organization already exists.');
 expect((await admin.from('profiles').select('id').eq('id',id)).data).toEqual([]);
 const config={confirmation:'I_VERIFIED_SEPARATE_STAGING_AND_ADMIN_AUTHORITY',user_id:id,email,organization_id:organization.id,organization_name:organization.name,expected_role:'missing',expected_access_state:'missing',display_name:'Fictional Recovered Owner',reason:'Local regression administrator approval'};
 recover(config);recover(config);
 const profile=(await admin.from('profiles').select('organization_id,role,access_state').eq('id',id).single()).data;
 expect(profile).toEqual({organization_id:organization.id,role:'owner',access_state:'active'});
 expect((await admin.from('organizations').select('id',{count:'exact',head:true})).count).toBe(before);
 expect((await admin.auth.admin.getUserById(id)).data.user?.email).toBe(email);
 expect((await admin.from('audit_log').select('id',{count:'exact',head:true}).eq('entity','staging_owner_recovery').eq('record_id',id)).count).toBe(1);
 // Same authenticated session starts working; no JWT metadata rewrite or password reset.
 for(const [path,heading] of [['/app/','Your day, simplified'],['/app/route','Today’s Route'],['/app/customers','Customers'],['/app/team','Team'],['/app/finance','Profitability']]){
  await page.goto(path);await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 for(const path of ['/app/api/customers','/app/api/team','/app/api/contribution?month='+fixture.date.slice(0,7)])expect((await page.request.get(path)).status()).toBe(200);
 // A suspended Owner stays blocked until this exact state is explicitly reviewed.
 expect((await admin.from('profiles').update({access_state:'suspended'}).eq('id',id)).error).toBeNull();
 await page.goto('/app/');await expect(page).toHaveURL(/message=inactive/);await expect(page.locator('.login-card').getByRole('alert')).toContainText('Your organization access is not active.');
 recover({...config,expected_role:'owner',expected_access_state:'suspended'});
 await login(page,email,password);await expect(page.locator('.v4-home')).toBeVisible();
});
