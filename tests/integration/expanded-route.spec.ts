import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
try{process.loadEnvFile('.env.local');}catch{/* Local CI injection supported. */}
const fixture=JSON.parse(readFileSync('/tmp/alys-integration-fixture.json','utf8'));
if(!['127.0.0.1','localhost'].includes(new URL(fixture.url).hostname))throw new Error('Local tests only');
const admin=createClient(fixture.url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
test('weekly routes and authorized road optimization persist, with manual override and map markers',async({page,baseURL})=>{
 const {data:user,error:userError}=await admin.auth.admin.createUser({email:`route-${randomUUID()}@example.test`,password:randomUUID()+'Aa1!',email_confirm:true});expect(userError).toBeNull();
 const technician=user.user!.id;await admin.from('profiles').insert({id:technician,organization_id:fixture.orgId,role:'technician',display_name:'Routing Test Technician'});
 const ids:string[]=[];
 for(let i=0;i<3;i++){const cid=randomUUID(),pid=randomUUID();await admin.from('customers').insert({id:cid,organization_id:fixture.orgId,name:`Routing Client ${i+1}`});await admin.from('properties').insert({id:pid,organization_id:fixture.orgId,customer_id:cid,name:`Routing Stop ${i+1}`,address:`Fictional Routing Address ${i+1}, FL`,latitude:26.12+i/1000,longitude:-80.14-i/1000});await admin.from('pools').insert({organization_id:fixture.orgId,property_id:pid,name:'Routing pool',gallons:12000,water_type:'chlorine',type:'residential'});const {data:stop,error}=await admin.from('route_stops').insert({organization_id:fixture.orgId,property_id:pid,technician_id:technician,service_date:fixture.date,position:i+1}).select('id').single();expect(error).toBeNull();ids.push(stop!.id);}
 await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(fixture.email);await page.getByLabel('Password',{exact:true}).fill(fixture.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();await page.goto('/route');await expect(page.getByRole('heading',{name:'Today’s Route'})).toBeVisible();
 await page.getByRole('combobox',{name:'Route for',exact:true}).selectOption(technician);await expect(page.getByRole('heading',{name:'Routing Stop 1',exact:true})).toBeVisible();
 await page.getByText('Route map & planning',{exact:true}).click();await expect(page.locator('.route-number-marker')).toHaveCount(3);await page.locator('.route-number-marker').nth(1).click();await expect(page.locator('.field-stop-selected')).toContainText('Routing Stop 2');await page.getByRole('button',{name:'Routing Stop 1',exact:true}).click();await expect(page.locator('.route-number-marker .selected')).toHaveText('1');
 await page.getByRole('button',{name:'Optimize Route',exact:true}).click();
 await expect.poll(async()=>{const {data}=await admin.from('route_stops').select('id').eq('technician_id',technician).eq('service_date',fixture.date).order('position');return data!.map(s=>s.id);}).toEqual([ids[0],ids[2],ids[1]]);
 await expect(page.locator('.route-summary-grid')).toContainText('1.3 mi');
 await expect(page.locator('.route-planner')).toContainText('Estimated completion time');
 await page.getByRole('button',{name:'Move Routing Stop 2 up',exact:true}).click();
 await expect.poll(async()=>{const {data}=await admin.from('route_stops').select('id').eq('technician_id',technician).eq('service_date',fixture.date).order('position');return data!.map(s=>s.id);}).toEqual(ids);
 await expect(page.locator('.route-summary-grid')).toContainText('Not calculated');
 await page.getByRole('button',{name:'Next week →',exact:true}).click();await expect(page.getByText('A clear route, ready to plan.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Today',exact:true}).click();await expect(page.getByRole('heading',{name:'Routing Stop 1',exact:true})).toBeVisible();
 const foreign=await page.request.post('/api/routing',{headers:{Origin:baseURL!},data:{date:fixture.date,technician_id:fixture.otherUserId,action:'save_start',start_latitude:null,start_longitude:null,start_time:'08:00'}});expect(foreign.ok()).toBe(false);
});
test('app language switch preserves labels and selected preference after reload',async({page})=>{
 await page.goto('/login');await page.getByRole('combobox',{name:'Language',exact:true}).selectOption('pt');await expect(page.getByRole('heading',{name:'Tudo pronto para sua rota?',exact:true})).toBeVisible();await page.getByRole('textbox',{name:'E-mail',exact:true}).fill('unchanged@example.test');await page.getByRole('combobox',{name:'Idioma',exact:true}).selectOption('es');await expect(page.getByRole('textbox',{name:'Correo electrónico',exact:true})).toHaveValue('unchanged@example.test');await expect(page.getByRole('button',{name:'Iniciar sesión',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('combobox',{name:'Idioma',exact:true})).toHaveValue('es');await expect(page.locator('html')).toHaveAttribute('lang','es-US');
});
