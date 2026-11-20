// Requires the loopback-only V4 seed and an app connected to that V4 instance.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, devices } from '@playwright/test';

const url = new URL(process.env.TEST_BASE_URL || 'http://127.0.0.1:3004');
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('V4 integration tests require loopback.');
const fixture = JSON.parse(await readFile(join(tmpdir(), 'alys-v4-fixture.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium' });
try {
  const context = await browser.newContext({ ...devices['iPhone 13'], baseURL: url.origin });
  const page = await context.newPage();
  const api = context.request;
  assert.equal((await api.get('/api/v4/session')).status(), 401);
  await page.goto('/v4');
  assert.equal(new URL(page.url()).pathname, '/v4/login');
  await page.getByLabel('Email', {exact:true}).fill(fixture.email);
  await page.getByLabel('Password', {exact:true}).fill(fixture.password);
  await page.getByRole('button', {name:'Sign in', exact:true}).click();
  await page.waitForURL(current => current.pathname === '/v4');

  const session = await api.get('/api/v4/session');
  assert.equal(session.status(), 200);
  assert.deepEqual(await session.json(), {userId:fixture.userId, orgId:fixture.orgId});
  const headers = {
    Origin: url.origin,
    'X-ALYS-User-ID': fixture.userId,
    'X-ALYS-Organization-ID': fixture.orgId,
  };
  const routeUrl = '/api/v4/route?date=' + fixture.date;
  assert.equal((await api.get(routeUrl, {headers:{...headers, 'X-ALYS-Organization-ID':randomUUID()}})).status(), 403);
  const routeResponse = await api.get(routeUrl, {headers});
  assert.equal(routeResponse.status(), 200);
  const route = await routeResponse.json();
  assert.equal(route.date, fixture.date);
  assert.ok(fixture.stopIds.every(id => route.stops.some(stop => stop.id === id)));
  const completed = route.stops.find(stop => stop.id === fixture.stopIds[0])?.visit;
  assert.ok(completed, 'The seed must contain a completed visit.');
  const path = '/api/v4/visits';
  assert.equal((await api.post(path, {headers:{Origin:url.origin}, data:completed})).status(), 403);
  assert.equal((await api.post(path, {headers:{...headers, 'X-ALYS-User-ID':randomUUID()}, data:completed})).status(), 403);
  assert.equal((await api.post(path, {headers:{...headers, Origin:'https://example.test'}, data:completed})).status(), 403);
  assert.equal((await api.post(path, {headers, data:{...completed, bodies:[]}})).status(), 422);
  const retry = await api.post(path, {headers, data:completed});
  assert.equal(retry.status(), 200);
  assert.deepEqual(await retry.json(), {id:completed.id, stopId:completed.stopId});
  assert.equal((await api.post(path, {headers, data:{...completed, id:randomUUID()}})).status(), 409);
  assert.equal((await api.post('/api/v4/signout', {headers})).status(), 200);
  assert.equal((await api.get(routeUrl)).status(), 401);
  console.log('V4 login, tenant scope, route, idempotent visit replay, request validation and sign-out passed.');
} finally {
  await browser.close();
}
