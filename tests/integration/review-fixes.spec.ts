import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync('/tmp/alys-integration-fixture.json','utf8'));
async function login(page:Page){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(fixture.email);await page.getByLabel('Password',{exact:true}).fill(fixture.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();await page.goto('/route');await expect(page.getByRole('heading',{name:'Today’s Route',exact:true})).toBeVisible();}
test('a late old-day response cannot replace the selected date',async({page,baseURL})=>{
 await login(page);const original=await (await page.request.get('/api/route?date='+fixture.date)).json();
 const day=(n:number)=>{const d=new Date(fixture.date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const b=day(7),c=day(14);const add=await page.request.post('/api/stops',{headers:{Origin:baseURL!},data:{action:'add',property_id:original.stops[0].property.id,technician_id:fixture.userId,date:b}});expect(add.ok()).toBe(true);
 let release!:()=>void,seen!:()=>void,done!:()=>void;const held=new Promise<void>(r=>release=r),started=new Promise<void>(r=>seen=r),finished=new Promise<void>(r=>done=r);
 await page.route('**/api/route?date='+b+'*',async route=>{const response=await route.fetch();seen();await held;try{await route.fulfill({response});}catch{/* The previous-date request is intentionally cancelled. */}finally{done();}});
 await page.getByRole('button',{name:'Next week →',exact:true}).click();await started;
 await page.getByRole('button',{name:'Next week →',exact:true}).click();await expect(page.getByText('A clear route, ready to plan.',{exact:true})).toBeVisible();release();await finished;
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await expect(page.getByLabel('Service date',{exact:true})).toHaveValue(c);await expect(page.getByText('A clear route, ready to plan.',{exact:true})).toBeVisible();await expect(page.locator('.field-stop')).toHaveCount(0);
});
test('daily mobile stops have filters and quick actions, and sign out clears other tabs',async({page,context})=>{
 await login(page);await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link',{name:'Stops',exact:true}).click();await expect(page.getByRole('heading',{name:'Today’s Stops',exact:true})).toBeVisible();
 await expect(page.locator('.daily-stops .field-stop')).toHaveCount(3);await expect(page.getByRole('button',{name:'Start service →',exact:true}).first()).toBeVisible();await expect(page.getByRole('link',{name:/Navigate to/}).first()).toBeVisible();
 await page.getByRole('button',{name:'Completed',exact:true}).click();await expect(page.locator('.daily-stops .field-stop')).toHaveCount(0);await page.getByRole('button',{name:'All stops',exact:true}).click();await expect(page.locator('.daily-stops .field-stop')).toHaveCount(3);
 await page.screenshot({path:'/tmp/alys-daily-stops-mobile.png',fullPage:true});
 await page.route('**/api/stops',route=>route.request().postDataJSON()?.action==='start'?route.fulfill({json:{ok:true}}):route.continue());
 await page.getByRole('button',{name:'Start service →',exact:true}).first().click();await expect(page).toHaveURL(/view=stops/);await page.reload();await page.getByRole('button',{name:'← Back to route',exact:true}).click();await expect(page).toHaveURL(/\/stops\?date=/);await expect(page.getByRole('heading',{name:'Today’s Stops',exact:true})).toBeVisible();
 const second=await context.newPage();await second.goto('/stops');await expect(second.getByRole('heading',{name:'Today’s Stops',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Settings',exact:true}).click();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page).toHaveURL(/\/login$/);await expect(second).toHaveURL(/\/login$/);
 const count=await second.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('alys-field-device-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const values=await new Promise<{key:string}[]>((resolve,reject)=>{const r=db.transaction('records').objectStore('records').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();return values.filter(v=>v.key!=='device-epoch').length;});expect(count).toBe(0);
});
test('Portuguese draft status is translated and production CSP blocks untrusted inline scripts',async({page})=>{
 await login(page);const data=await (await page.request.get('/api/route?date='+fixture.date)).json();await page.goto('/visit/'+data.stops[0].id+'?date='+fixture.date);
 await page.getByRole('combobox',{name:'Language',exact:true}).selectOption('pt');await expect(page.getByRole('status').filter({hasText:'Rascunho salvo neste dispositivo'})).toBeVisible();
 const response=await page.request.get('/login');const policy=response.headers()['content-security-policy'];expect(policy).toContain("'strict-dynamic'");expect(policy).toMatch(/script-src[^;]*'nonce-/);expect(policy.split(';').find(s=>s.includes('script-src'))).not.toContain('unsafe-inline');
 await page.route('**/login',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('</head>',"<script>window.__untrustedScriptRan=true</script></head>")});});await page.goto('/login');expect(await page.evaluate(()=> '__untrustedScriptRan' in window)).toBe(false);
});
