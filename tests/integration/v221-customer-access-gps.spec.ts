import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {translate,type Language} from '../../src/lib/i18n/core';
try{process.loadEnvFile('.env.local');}catch{}
const fixture=JSON.parse(readFileSync('/tmp/alys-integration-fixture.json','utf8'));
if(!['localhost','127.0.0.1'].includes(new URL(fixture.url).hostname))throw new Error('Local tests only');
const admin=createClient(fixture.url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const authClient=()=>createClient(fixture.url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
async function login(page:Page,email=fixture.email,password=fixture.password){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('.field-app,.dashboard-focus').first()).toBeVisible();}
async function member(role='technician',org=fixture.orgId,access='active'){
 const email='credentials-'+randomUUID()+'@example.test',password=randomUUID()+'Aa1!';
 const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(error).toBeNull();
 const id=data.user!.id;expect((await admin.from('profiles').insert({id,organization_id:org,role,access_state:access,display_name:'Fictional credential '+id})).error).toBeNull();
 return {id,email,password};
}
test('Owner edits technician email and password with reauthentication, preserving tenant and role boundaries',async({page,browser,baseURL})=>{
 const tech=await member(),other=(await admin.rpc('team_identity',{p_email:fixture.otherEmail})).data[0].organization_id;
 const outsider=await member('technician',other),invited=await member('technician',fixture.orgId,'invited');
 const email='changed-'+randomUUID()+'@example.test',password=randomUUID()+'Bb2!';
 const post=(data:unknown,origin=baseURL!)=>page.request.post('/api/team/credentials',{headers:{Origin:origin},data});
 expect((await post({id:tech.id,current_password:fixture.password,password})).status()).toBe(403);
 await login(page);expect((await post({id:tech.id,current_password:fixture.password,password},'https://invalid.example')).status()).toBe(403);
 for(const id of [outsider.id,fixture.userId,invited.id])expect((await post({id,current_password:fixture.password,password})).status()).toBe(403);
 expect((await post({id:tech.id,current_password:'Wrong owner password',password})).status()).toBe(403);
 expect((await post({id:tech.id,current_password:fixture.password,password:'short'})).status()).toBe(400);
 await page.goto('/team');const row=page.locator('tbody tr').filter({hasText:tech.email});await row.getByText('Manage technician login',{exact:true}).click();
 await row.getByLabel('Login email',{exact:true}).fill(email);await row.getByLabel('New password (at least 16 characters)',{exact:true}).fill(password);await row.getByLabel('Confirm new password',{exact:true}).fill(password);await row.getByLabel('Your current administrator password',{exact:true}).fill(fixture.password);
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/team/credentials'));await row.getByRole('button',{name:'Save technician login',exact:true}).click();expect((await saved).status()).toBe(200);
 await expect(page.getByText('Technician login updated. Share the new credentials securely.',{exact:true})).toBeVisible();
 expect((await(await page.request.get('/api/session')).json()).userId).toBe(fixture.userId);
 const check=authClient();expect((await check.auth.signInWithPassword({email:tech.email,password:tech.password})).error).toBeTruthy();expect((await check.auth.signInWithPassword({email,password})).error).toBeNull();
 const team=await(await page.request.get('/api/team')).json();expect(team.people.find((p:{id:string})=>p.id===tech.id).email).toBe(email);expect(JSON.stringify(team)).not.toContain(password);
 const audit=await admin.from('audit_log').select('operation,new_data,old_data').eq('entity','team_credentials').eq('record_id',tech.id).order('id');expect(audit.data?.map(r=>r.operation)).toEqual(['REQUESTED','UPDATED']);expect(JSON.stringify(audit.data)).not.toContain(password);expect(JSON.stringify(audit.data)).not.toContain(fixture.password);
 const context=await browser.newContext(),technician=await context.newPage();await login(technician,email,password);expect((await technician.request.post(baseURL+'/api/team/credentials',{headers:{Origin:baseURL!},data:{id:tech.id,current_password:password,password:randomUUID()+'Cc3!'}})).status()).toBe(403);await context.close();
});
test('GPS fills an unsaved customer address, preserves coordinates after denial and saves only after confirmation',async({page,context})=>{
 await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:26.1224,longitude:-80.1373,accuracy:8});await login(page);await page.goto('/customers/new');
 const name='GPS '+randomUUID();await page.getByLabel('First name',{exact:true}).fill(name);await page.getByLabel('Phone',{exact:true}).fill('+15550190000');await page.getByLabel('Service address',{exact:true}).fill('Fictional GPS customer address');
 await page.getByRole('button',{name:'Use current GPS location',exact:true}).click();await expect(page.getByLabel('Latitude',{exact:true})).toHaveValue('26.1224');await expect(page.getByLabel('Longitude',{exact:true})).toHaveValue('-80.1373');await expect(page.getByLabel('I confirm this service location',{exact:true})).not.toBeChecked();expect((await admin.from('customers').select('id',{count:'exact',head:true}).eq('name',name)).count).toBe(0);
 await page.evaluate(()=>{Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(_ok:unknown,fail:(error:{code:number})=>void)=>fail({code:1})}});});await page.getByRole('button',{name:'Use current GPS location',exact:true}).click();await expect(page.locator('.gps-capture [role=alert]')).toContainText('Location permission denied.');await expect(page.getByLabel('Latitude',{exact:true})).toHaveValue('26.1224');
 await page.getByLabel('I confirm this service location',{exact:true}).check();const saved=page.waitForResponse(r=>r.url().endsWith('/api/customers/onboard'));await page.getByRole('button',{name:'Save Customer & Activate Service',exact:true}).click();const result=await saved;expect(result.status()).toBe(200);const id=(await result.json()).id;
 await page.goto('/customers/'+id+'?tab=properties');await expect(page.getByRole('link',{name:'Navigate',exact:true})).toHaveAttribute('href',/destination=26\.1224%2C-80\.1373/);
 const stored=await admin.from('properties').select('latitude,longitude,location_confirmed').eq('customer_id',id).single();expect(stored.data).toEqual({latitude:26.1224,longitude:-80.1373,location_confirmed:true});
});
test('Customers owns address/pool navigation and GPS/credential controls translate without overflow',async({page})=>{
 await member();await login(page);for(const old of ['/pools','/locations']){await page.goto(old);await expect(page).toHaveURL(/\/customers$/);}
 await page.locator('.customer-advanced summary').click();await page.getByLabel('Only properties missing coordinates',{exact:true}).check();await expect(page).toHaveURL(/locations=missing/);await page.getByLabel('Only properties missing coordinates',{exact:true}).uncheck();await expect(page).toHaveURL(/\/customers$/);
 for(const language of ['pt','es','en'] as Language[]){await page.getByRole('combobox',{name:/Language|Idioma/}).selectOption(language);await page.goto('/more');await expect(page.locator('a[href="/locations"],a[href="/pools"]')).toHaveCount(0);await page.goto('/customers/new');for(const width of [320,390]){await page.setViewportSize({width,height:844});await expect(page.getByRole('button',{name:translate('Use current GPS location',language),exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}await page.goto('/team');const control=page.getByText(translate('Manage technician login',language),{exact:true}).first();await control.click();await expect(page.getByLabel(translate('Your current administrator password',language),{exact:true}).first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});
test('Assigned navigation and Owner GPS route origin use confirmed coordinates and explicit save',async({page,context,browser,baseURL})=>{
 const tech=await member(),customer=randomUUID(),property=randomUUID(),pool=randomUUID(),stop=randomUUID();
 for(const [table,row] of [
  ['customers',{id:customer,organization_id:fixture.orgId,name:'Fictional GPS route customer'}],
  ['properties',{id:property,organization_id:fixture.orgId,customer_id:customer,name:'GPS assigned stop',address:'Fictional GPS navigation address',latitude:26.11,longitude:-80.12,location_confirmed:true}],
  ['pools',{id:pool,organization_id:fixture.orgId,property_id:property,name:'GPS pool',type:'residential',water_type:'chlorine',gallons:12000}],
  ['route_stops',{id:stop,organization_id:fixture.orgId,property_id:property,technician_id:tech.id,service_date:fixture.date,position:1}],
 ] as const)expect((await admin.from(table).insert(row)).error).toBeNull();
 await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:26.1224,longitude:-80.1373,accuracy:8});
 await login(page,tech.email,tech.password);await expect(page.locator('.current-pool').getByRole('link',{name:'Navigate',exact:true})).toHaveAttribute('href',/destination=26\.11%2C-80\.12/);
 // Fast Technician Mode keeps planning controls out of the stop workflow.
 const ownerContext=await browser.newContext({viewport:page.viewportSize()??{width:390,height:844},permissions:['geolocation'],geolocation:{latitude:26.1224,longitude:-80.1373,accuracy:8}}),owner=await ownerContext.newPage();
 await login(owner);await owner.goto('/route?date='+fixture.date+'&technician='+tech.id);const planner=owner.locator('.route-planner');await expect(planner).toBeVisible();if(await planner.getAttribute('open')===null)await planner.locator('summary').first().click();await planner.getByText('Starting location & time',{exact:true}).click();
 await planner.getByRole('button',{name:'Use current GPS location',exact:true}).click();await expect(planner.getByLabel('Start latitude',{exact:true})).toHaveValue('26.1224');await expect(planner.getByLabel('Start longitude',{exact:true})).toHaveValue('-80.1373');
 expect((await admin.from('route_plans').select('technician_id').eq('technician_id',tech.id)).data).toEqual([]);
 const response=owner.waitForResponse(r=>r.url().endsWith('/api/routing'));await planner.getByRole('button',{name:'Save starting location',exact:true}).click();expect((await response).status()).toBe(200);
 expect((await admin.from('route_plans').select('start_latitude,start_longitude').eq('technician_id',tech.id).single()).data).toEqual({start_latitude:26.1224,start_longitude:-80.1373});
 expect((await page.request.post('/api/routing',{headers:{Origin:baseURL!},data:{action:'save_start',date:fixture.date,technician_id:fixture.userId,start_latitude:0,start_longitude:0,start_time:'08:00'}})).status()).toBe(403);
 await ownerContext.close();
});
