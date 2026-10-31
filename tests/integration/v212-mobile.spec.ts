import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import sharp from 'sharp';
import {translate,type Language} from '../../src/lib/i18n/core';
try{process.loadEnvFile('.env.local');}catch{}
const fixture=JSON.parse(readFileSync('/tmp/alys-integration-fixture.json','utf8'));
if(!['localhost','127.0.0.1'].includes(new URL(fixture.url).hostname))throw new Error('Local hotfix tests only');
const admin=createClient(fixture.url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const heic=readFileSync('tests/fixtures/pool.heic');
async function login(page:Page){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(fixture.email);await page.getByLabel('Password',{exact:true}).fill(fixture.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();}
async function makeStop(){const customer=randomUUID(),property=randomUUID(),pool=randomUUID(),stop=randomUUID(),visit=randomUUID(),photo=randomUUID(),suffix=stop.slice(0,6);for(const [table,values] of [
 ['customers',{id:customer,organization_id:fixture.orgId,name:'Fictional photo client '+suffix,email:'nobody@example.test',email_reports_enabled:true}],
 ['properties',{id:property,organization_id:fixture.orgId,customer_id:customer,name:'Photo stop '+suffix,address:'Fictional mobile address'}],
 ['pools',{id:pool,organization_id:fixture.orgId,property_id:property,name:'Photo pool',gallons:10000,water_type:'chlorine',type:'residential',photo_required:true,required_readings:['fc','ph'],checklist:['Test Water']}],
 ['route_stops',{id:stop,organization_id:fixture.orgId,property_id:property,technician_id:fixture.userId,service_date:fixture.date,position:90,status:'in_progress'}]
 ] as const){expect((await admin.from(table).insert(values)).error).toBeNull();}
 return {stop,pool,visit,photo};}
async function seedLegacy(page:Page,entry:Awaited<ReturnType<typeof makeStop>>,bytes:Buffer,type:string){
 const payload={id:entry.visit,stop_id:entry.stop,started_at:new Date(Date.now()-360000).toISOString(),completed_at:new Date(Date.now()-60000).toISOString(),notes:'Original offline note',pools:[{pool_id:entry.pool,readings:{fc:3,ph:7.4},tasks:['Test Water'],dosages:[{product:'Liquid Chlorine',quantity:1,unit:'gal'}]}],photo_paths:[]};
 await page.evaluate(async({entry,payload,bytes,type,scope})=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('alys-field-device-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const prefix=scope.orgId+':'+scope.userId+':';
  const blob=new Blob([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],{type});
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction('records','readwrite'),records=tx.objectStore('records');records.put({key:prefix+'queue:'+entry.stop,value:{id:entry.visit,payload,status:'failed',http_status:400,error:'Upload a JPEG up to 2 MB.',attempts:1,next_retry_at:'2099-01-01T00:00:00.000Z',updated_at:payload.completed_at}});records.put({key:prefix+'draft:'+entry.stop,value:payload});records.put({key:prefix+'photo:'+entry.photo,value:{id:entry.photo,stop_id:entry.stop,pool_id:entry.pool,blob,created_at:payload.started_at}});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
 },{entry,payload,bytes:bytes.toString('base64'),type,scope:{orgId:fixture.orgId,userId:fixture.userId}});
 await page.reload();await expect(page.locator('.field-sync-notice')).toContainText('Upload a JPEG up to 2 MB.');return payload;
}
async function counts(visit:string){const [v,r,c]=await Promise.all([admin.from('visits').select('id',{count:'exact',head:true}).eq('id',visit),admin.from('email_delivery_logs').select('id',{count:'exact',head:true}).eq('visit_id',visit),admin.from('chemical_readings').select('id',{count:'exact',head:true}).eq('visit_id',visit)]);return [v.count,r.count,c.count];}
for(const format of ['JPEG small','JPEG large','HEIC','HEIF'])test('repairs pre-upgrade failed '+format+' queue and retries without duplicate visit or report',async({page,baseURL})=>{
 const entry=await makeStop();await login(page);await page.goto('/stops');await expect(page.locator('.route-date-navigation')).toBeVisible();
 let bytes:Buffer,type:string;
 if(format.startsWith('JPEG')){type='image/jpeg';bytes=await sharp({create:{width:1800,height:1400,channels:3,background:'#176f9b'}}).jpeg().toBuffer();if(format==='JPEG large'){bytes=await sharp(randomBytes(2200*1800*3),{raw:{width:2200,height:1800,channels:3}}).jpeg({quality:95}).toBuffer();expect(bytes.length).toBeGreaterThan(2*1024*1024);}}else{bytes=heic;type=format==='HEIC'?'image/heic':'image/heif';}
 const payload=await seedLegacy(page,entry,bytes,type);let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);let uploadId='';let posts=0;let completion:Record<string,unknown>|undefined;
 await page.route('**/api/photos',async route=>{const body=route.request().postDataBuffer()!;expect(body.length).toBeLessThan(2*1024*1024+65536);expect(body.toString('latin1')).toContain('Content-Type: image/jpeg');uploadId=body.toString('latin1');await held;await route.continue();});
 await page.route('**/api/visits',async route=>{if(route.request().method()!=='POST'){await route.continue();return;}posts++;completion=route.request().postDataJSON();if(posts===1){await route.fetch();await route.abort('failed');}else await route.continue();});
 await page.getByRole('button',{name:'Retry sync',exact:true}).click();await expect.poll(()=>uploadId).not.toBe('');
 const stored=await page.evaluate(async({org,user,photo})=>{const db=await new Promise<IDBDatabase>(r=>{const req=indexedDB.open('alys-field-device-v1',1);req.onsuccess=()=>r(req.result);});const record=await new Promise<{value:{blob:Blob;upload_blob:Blob}}>(r=>{const req=db.transaction('records').objectStore('records').get(org+':'+user+':photo:'+photo);req.onsuccess=()=>r(req.result);});db.close();return {original:record.value.blob.size,prepared:record.value.upload_blob.size,type:record.value.upload_blob.type};},{org:fixture.orgId,user:fixture.userId,photo:entry.photo});
 expect(stored.original).toBe(bytes.length);expect(stored.prepared).toBeLessThanOrEqual(2*1024*1024);expect(stored.type).toBe('image/jpeg');expect((await counts(entry.visit))[0]).toBe(0);release();
 await expect(page.locator('.field-sync-notice')).toContainText('Failed');await expect.poll(()=>counts(entry.visit)).toEqual([1,1,1]);await page.getByRole('button',{name:'Retry sync',exact:true}).click();await expect(page.locator('.field-sync-notice')).toHaveCount(0);expect(completion).toMatchObject({...payload,photo_paths:expect.arrayContaining([expect.any(String)])});expect(uploadId).toContain(entry.photo);expect(posts).toBe(2);expect(await counts(entry.visit)).toEqual([1,1,1]);
 const replay=await page.request.post('/api/visits',{headers:{Origin:baseURL!},data:completion});expect(replay.ok()).toBe(true);expect((await replay.json()).already_completed).toBe(true);expect(await counts(entry.visit)).toEqual([1,1,1]);
});
test('failed HEIF conversion stays saved and one actionable notice permits replacing its photo',async({page})=>{
 const entry=await makeStop();await login(page);await page.goto('/stops');await expect(page.locator('.route-date-navigation')).toBeVisible();
 const original=Buffer.concat([heic.subarray(0,64),Buffer.from('broken HEIF payload')]);const originalPayload=await seedLegacy(page,entry,original,'image/heif');
 await page.getByRole('button',{name:'Retry sync',exact:true}).click();await expect(page.locator('.field-sync-notice')).toContainText('HEIC/HEIF conversion failed.');await expect(page.locator('.field-alert')).toHaveCount(0);expect(await counts(entry.visit)).toEqual([0,0,0]);
 await page.getByRole('button',{name:'Replace photo',exact:true}).click();const jpeg=await sharp({create:{width:900,height:600,channels:3,background:'#268ab4'}}).jpeg().toBuffer();await page.getByLabel('Replace photo 1',{exact:true}).setInputFiles({name:'replacement.jpg',mimeType:'image/jpeg',buffer:jpeg});await expect(page.getByLabel('Replace photo 1',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Retry sync',exact:true}).click();await expect(page.locator('.field-sync-notice')).toHaveCount(0);expect(await counts(entry.visit)).toEqual([1,1,1]);
 const {data}=await admin.from('visits').select('completed_at,snapshot').eq('id',entry.visit).single();expect(new Date(data!.completed_at).toISOString()).toBe(originalPayload.completed_at);expect(data?.snapshot.notes).toBe('Original offline note');
});
test('five Owner tabs never overlap in EN PT ES and route date survives visit return',async({page})=>{
 await login(page);
 for(const language of ['en','pt','es'] as Language[]){const t=(s:string)=>translate(s,language);await page.getByRole('combobox',{name:/Language|Idioma/}).selectOption(language);for(const width of [320,375,390,430]){await page.setViewportSize({width,height:844});const nav=page.getByRole('navigation',{name:t('Mobile navigation')});await expect(nav.getByRole('link')).toHaveCount(5);await expect(nav.getByRole('link',{name:t('More'),exact:true}).locator('.mobile-nav-label')).toHaveText(t('More'));const boxes=await nav.getByRole('link').evaluateAll(els=>els.map(el=>{const a=el.getBoundingClientRect(),label=el.querySelector('.mobile-nav-label')!;const range=document.createRange();range.selectNodeContents(label);return {left:a.left,right:a.right,width:a.width,height:a.height,rects:Array.from(range.getClientRects()).map(r=>({left:r.left,right:r.right}))};}));for(let i=0;i<boxes.length;i++){const b=boxes[i];expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);if(i)expect(b.left).toBeGreaterThanOrEqual(boxes[i-1].right);for(const r of b.rects){expect(r.left).toBeGreaterThanOrEqual(b.left-1);expect(r.right).toBeLessThanOrEqual(b.right+1);}}expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(language==='pt'&&width===320)await page.screenshot({path:'/tmp/alys-212-nav-pt-320.png',fullPage:false});}}
 await page.getByRole('combobox',{name:/Language|Idioma/}).selectOption('en');await page.goto('/stops?date='+fixture.date);await expect(page.getByLabel('Service date',{exact:true})).toHaveValue(fixture.date);await page.getByRole('button',{name:'Start service →',exact:true}).first().click();await page.getByRole('button',{name:'← Back to route',exact:true}).click();await expect(page.getByLabel('Service date',{exact:true})).toHaveValue(fixture.date);expect((await page.locator('.route-date-navigation').boundingBox())!.height).toBeLessThanOrEqual(70);
});
