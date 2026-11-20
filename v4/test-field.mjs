// Exercises a new local-only route so the seeded route remains available for review.
import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, devices, expect } from '@playwright/test';
import sharp from 'sharp';

const base = new URL(process.env.TEST_BASE_URL || 'http://127.0.0.1:3004');
assert.ok(['localhost','127.0.0.1'].includes(base.hostname), 'Local V4 only');
const fixture = JSON.parse(await readFile(join(tmpdir(),'alys-v4-fixture.json'),'utf8'));
const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium'});
try {
  const context = await browser.newContext({...devices['iPhone 13'],baseURL:base.origin});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/v4');
  await page.getByLabel('Email',{exact:true}).fill(fixture.email);
  await page.getByLabel('Password',{exact:true}).fill(fixture.password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Route dashboard'})).toBeVisible();
  await expect(page.getByText('All changes synced',{exact:true})).toBeVisible();
  const pictures = process.env.V4_SCREENSHOTS;
  if (pictures) {
    await mkdir(pictures,{recursive:true});
    await page.screenshot({path:join(pictures,'dashboard.png')});
  }

  const headers = {Origin:base.origin,'X-ALYS-User-ID':fixture.userId,'X-ALYS-Organization-ID':fixture.orgId};
  // Choose an empty day before inserting disposable fixtures. The test never clears other routes.
  let day;
  for (let i=0;i<8;i++) {
    const candidate = new Date(Date.UTC(2040,0,1+randomInt(3650))).toISOString().slice(0,10);
    const response = await context.request.get('/api/v4/route?date='+candidate,{headers});
    assert.equal(response.status(),200);
    if (!(await response.json()).stops.length) {day=candidate;break;}
  }
  assert.ok(day);
  for (const name of ['Field test north','Field test south']) {
    const added = await context.request.post('/api/v4/stops',{headers,data:{
      id:randomUUID(),date:day,name,address:'Fictional service lane',kind:'pool',gallons:12000,
    }});
    assert.equal(added.status(),201);
  }
  await page.getByLabel('Choose date').fill(day);
  await page.getByRole('heading',{name:'Field test north'}).waitFor();
  await page.getByRole('button',{name:'Start visit'}).click();
  await expect(page.getByLabel('pH',{exact:true})).toHaveValue('');
  await context.setOffline(true);
  await page.getByRole('button',{name:'pH 7.4',exact:true}).click();
  await page.getByRole('button',{name:'Free chlorine 3',exact:true}).click();
  const jpeg = await sharp({create:{width:480,height:360,channels:3,background:'#53bcb0'}}).jpeg().toBuffer();
  await page.getByLabel('Choose service photo').setInputFiles({name:'pool.jpg',mimeType:'image/jpeg',buffer:jpeg});
  await expect(page.getByAltText('Service photo')).toBeVisible();
  if(pictures) await page.screenshot({path:join(pictures,'visit.png')});
  await page.getByRole('button',{name:'Back to route'}).click();
  await page.getByRole('button',{name:/Field test north/}).click();
  await expect(page.getByLabel('pH',{exact:true})).toHaveValue('7.4');
  const started = performance.now();
  await page.getByRole('button',{name:'Finish & Next'}).click();
  await expect(page.getByRole('heading',{name:'Field test south'})).toBeVisible();
  const elapsed = Math.round(performance.now()-started);
  await expect(page.getByLabel('Free chlorine',{exact:true})).toHaveValue('');
  await context.setOffline(false);
  await page.getByRole('button',{name:'Reports',exact:true}).click();
  await expect(page.getByText('All changes synced',{exact:true})).toBeVisible();
  const refreshed = await context.request.get('/api/v4/route?date='+day,{headers});
  const route = await refreshed.json();
  assert.equal(route.stops.length,2);
  assert.equal(route.stops[0].visit.bodies[0].ph,7.4);
  assert.equal(route.stops[0].visit.bodies[0].fc,3);
  assert.equal(route.stops[1].visit,null);
  const photo = await context.request.get('/api/v4/photos?visit='+route.stops[0].visit.id,{headers});
  assert.equal(photo.status(),200);
  assert.equal(photo.headers()['content-type'],'image/jpeg');
  assert.deepEqual(errors,[]);
  console.log(`Offline visit, photo and next stop passed. Finish to next heading: ${elapsed} ms (emulated iPhone 13, local Chromium).`);
} finally {
  await browser.close();
}
