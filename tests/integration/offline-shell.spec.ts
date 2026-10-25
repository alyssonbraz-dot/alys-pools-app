import { test, expect } from '@playwright/test';

// Independent PWA check: fictitious device cache, no Supabase user or customer is provisioned.
// The integration route test separately exercises authenticated synchronization.
const baseURL=process.env.TEST_BASE_URL??'http://127.0.0.1:3000';

test('public shell reopens scoped route and draft after offline tab closure', async ({ browser }) => {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'allow'});
  const page=await context.newPage();
  await page.goto(baseURL+'/login');
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await expect.poll(()=>page.evaluate(async()=>!!(await (await caches.open('alys-field-shell-v1')).match('/offline')))).toBe(true);
  const fixture={userId:'offline-fixture-user',orgId:'offline-fixture-org',displayName:'Offline fixture',role:'technician',date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),stops:[
    {id:'offline-stop-a',technician_id:'offline-fixture-user',service_date:'2026-10-22',position:1,status:'pending',property:{id:'property-a',name:'Fictional Offline Residence',address:'Fictional address A',gate_notes:''},customer:{id:'customer-a',name:'Fictional Test Customer'},pools:[{id:'pool-a',name:'Fictional pool',gallons:12000,checklist:['Test Water','Brush Pool'],required_readings:['fc','ph'],photo_required:false}]},
    {id:'offline-stop-b',technician_id:'offline-fixture-user',service_date:'2026-10-22',position:2,status:'pending',property:{id:'property-b',name:'Fictional Next Stop',address:'Fictional address B',gate_notes:''},customer:{id:'customer-b',name:'Fictional Other Customer'},pools:[{id:'pool-b',name:'Fictional spa',gallons:2000,checklist:['Test Water'],required_readings:[],photo_required:false}]}
  ]};
  await page.evaluate(async route=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('alys-field-device-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('records',{keyPath:'key'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const tx=db.transaction('records','readwrite');const store=tx.objectStore('records');
    const prefix=`${route.orgId}:${route.userId}:`;
    store.put({key:'active-scope',value:{userId:route.userId,organizationId:route.orgId}});
    store.put({key:prefix+'latest-route:',value:route.date});
    store.put({key:prefix+'route:'+route.date,value:route});
    await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
  },fixture);
  await context.setOffline(true);
  await page.goto(baseURL+'/');
  await expect(page.getByRole('heading',{name:'Today’s Route'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Fictional Offline Residence'})).toBeVisible();
  await page.getByRole('button',{name:'Start service →'}).first().click();
  await expect(page.getByRole('heading',{name:'Fictional Offline Residence'})).toBeVisible();
  await page.getByRole('checkbox',{name:'Test Water',exact:true}).check();
  await page.getByRole('button',{name:'Fictional pool FC 5 ppm',exact:true}).click();
  await expect(page.getByRole('spinbutton',{name:'Fictional pool Free Chlorine (ppm)'})).toHaveValue('5');
  await page.getByRole('button',{name:'Fictional pool pH 7.2',exact:true}).click();
  await expect(page.getByRole('spinbutton',{name:'Fictional pool pH'})).toHaveValue('7.2');
  await page.getByRole('spinbutton',{name:'Fictional pool Free Chlorine (ppm)'}).fill('3.2');
  await page.getByRole('spinbutton',{name:'Fictional pool pH'}).fill('7.5');
  await expect(page.getByText('Draft saved on this device',{exact:false})).toBeVisible();
  await page.close();
  const reopened=await context.newPage();
  await reopened.goto(baseURL+'/');
  await expect(reopened.getByRole('heading',{name:'Today’s Route'})).toBeVisible();
  await reopened.getByRole('button',{name:'Start service →'}).first().click();
  await expect(reopened.getByRole('spinbutton',{name:'Fictional pool Free Chlorine (ppm)'})).toHaveValue('3.2');
  await expect(reopened.getByRole('spinbutton',{name:'Fictional pool pH'})).toHaveValue('7.5');
  await expect(reopened.getByRole('checkbox',{name:'Test Water',exact:true})).toBeChecked();
  await reopened.getByRole('button',{name:'COMPLETE & NEXT →'}).click();
  await expect(reopened.getByRole('heading',{name:'Fictional Next Stop'})).toBeVisible();
  await expect(reopened.getByText('1 visit waiting to sync',{exact:true})).toBeVisible();
  const cachedPaths=await reopened.evaluate(async()=>{
    const cache=await caches.open('alys-field-shell-v1');return (await cache.keys()).map(request=>new URL(request.url).pathname);
  });
  expect(cachedPaths).toContain('/offline');
  expect(cachedPaths.some(path=>path.startsWith('/api/')||path==='/login'||path==='/')).toBe(false);
  await reopened.goto(baseURL+'/stops');
  await expect(reopened.getByRole('heading',{name:'Today’s Stops',exact:true})).toBeVisible();
  await expect(reopened.getByRole('heading',{name:'Fictional Next Stop',exact:true})).toBeVisible();
  await context.close();
});
