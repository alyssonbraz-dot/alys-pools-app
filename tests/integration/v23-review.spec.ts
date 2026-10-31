import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync('/tmp/alys-integration-fixture.json','utf8'));
async function login(page:Page){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(fixture.email);await page.getByLabel('Password',{exact:true}).fill(fixture.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('.mobile-dashboard')).toBeVisible();}
function response(url:string){const query=new URL(url).searchParams;return {userId:fixture.userId,orgId:fixture.orgId,role:'owner',date:query.get('date'),timeZone:query.get('timezone'),technicians:[],stops:[{id:'review-stop',technician_id:fixture.userId,status:'pending'}]};}

test('Dashboard rejects stale scope/date/timezone responses, retries and avoids attributing an unknown technician to Owner',async({page})=>{
 let calls=0;
 const invalid=['userId','orgId','date','timeZone'] as const;
 await page.route('**/api/route?*',async route=>{const data=response(route.request().url());if(calls<invalid.length)data[invalid[calls]]='wrong-value';calls++;await route.fulfill({json:data});});
 await login(page);
 for(let index=0;index<invalid.length;index++){await expect(page.locator('.technician-summary-list [role=alert]')).toContainText('Your route is unavailable');await expect(page.locator('.technician-summary-card')).toHaveCount(0);await page.getByRole('button',{name:'Try again',exact:true}).click();}
 await expect(page.locator('.technician-summary-card')).toHaveCount(1);await expect(page.locator('.technician-summary-card h2')).toHaveText('Assigned technician');expect(calls).toBe(5);
});

test('Dashboard clears old failure while loading, discards late responses and keeps chosen date in both route links',async({page})=>{
 let calls=0,release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);const dates:string[]=[];
 await page.route('**/api/route?*',async route=>{const url=route.request().url();dates.push(new URL(url).searchParams.get('date')!);calls++;if(calls===1){await route.fulfill({status:503,json:{error:'unavailable'}});return;}if(calls===2)await pending;try{await route.fulfill({json:response(url)});}catch{/* Expected: the previous date's request was aborted. */}});
 await login(page);await expect(page.locator('.technician-summary-list [role=alert]')).toBeVisible();await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.locator('.technician-summary-list [role=status]')).toBeVisible();await expect(page.locator('.technician-summary-list [role=alert]')).toHaveCount(0);
 await page.locator('.route-days button:not(.chosen)').first().click();await expect(page.locator('.technician-summary-card')).toHaveCount(1);const selected=dates.at(-1)!;expect(selected).not.toBe(dates[0]);release();
 for(const selector of ['.technician-summary-card','.dashboard-mobile-links a[href^="/route"]']){const href=await page.locator(selector).getAttribute('href');expect(new URL(href!,'http://localhost').searchParams.get('date')).toBe(selected);}
 await expect(page.locator('.technician-summary-list [role=alert]')).toHaveCount(0);
});

test('Map timezone changes preserve the maps destination',async({page})=>{
 await login(page);await page.goto('/maps');await page.locator('.route-planning-controls>summary').click();await page.locator('.route-timezone-control>summary').click();await page.locator('.route-timezone-control select').selectOption('America/Sao_Paulo');await expect(page).toHaveURL(/\/maps\?date=.*timezone=America%2FSao_Paulo/);
});
