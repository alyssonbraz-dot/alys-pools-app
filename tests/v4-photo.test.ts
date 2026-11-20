import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { flushVisits, queueVisit, reconcileRoute } from '@/lib/v4/device';
import { getVisitPhoto, saveVisitPhoto } from '@/lib/v4/visit-photo';
import type { Stop, VisitInput } from '@/lib/v4/types';

afterEach(() => vi.unstubAllGlobals());

it('persists a photo until the private upload is confirmed and resends it on retry', async () => {
  const scope = {orgId:crypto.randomUUID(),userId:crypto.randomUUID()};
  const stopId = crypto.randomUUID();
  const visit: VisitInput = {id:crypto.randomUUID(),date:'2026-11-19',stopId,bodies:[],notes:''};
  const stop:Stop = {id:stopId,name:'Coral House',address:'',position:1,latitude:null,longitude:null,
    bodies:[],visit,completedAt:'2026-11-19T16:00:00Z'};
  const jpeg = new Blob(['retained image bytes'],{type:'image/jpeg'});
  await saveVisitPhoto(scope,stopId,jpeg);
  expect(await getVisitPhoto({...scope,userId:crypto.randomUUID()},stopId)).toBeNull();
  await queueVisit(scope,visit.date,visit);
  await expect(saveVisitPhoto(scope,stopId,new Blob(['stale photo']))).rejects.toThrow();
  const network = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({id:visit.id,stopId}))
    .mockRejectedValueOnce(new Error('upload interrupted'))
    .mockResolvedValueOnce(Response.json({id:visit.id,stopId}))
    .mockResolvedValueOnce(Response.json({saved:true,visitId:visit.id}));
  vi.stubGlobal('fetch',network);
  expect((await flushVisits(scope)).pending).toBe(1);
  await reconcileRoute(scope,{date:visit.date,technician:'Alex',stops:[stop]});
  expect(await (await getVisitPhoto(scope,stopId))?.text()).toBe(await jpeg.text());
  expect((await flushVisits(scope)).pending).toBe(0);
  expect(await getVisitPhoto(scope,stopId)).toBeNull();
  expect(network.mock.calls.map(call=>call[0])).toEqual([
    '/api/v4/visits','/api/v4/photos?visit='+visit.id,
    '/api/v4/visits','/api/v4/photos?visit='+visit.id,
  ]);
  for (const [,request] of network.mock.calls.filter(([url])=>String(url).includes('/photos'))) {
    expect(request?.headers).toMatchObject({'X-ALYS-User-ID':scope.userId,'X-ALYS-Organization-ID':scope.orgId});
    expect(await (request?.body as Blob).text()).toBe(await jpeg.text());
  }
});
