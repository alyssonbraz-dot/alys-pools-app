import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { CompletionPayload, RouteData } from '../src/lib/field/types';
import * as device from '../src/lib/offline/store';
const scope={userId:'user-a',organizationId:'org-a'};
const route:RouteData={userId:'user-a',orgId:'org-a',displayName:'Test technician',role:'technician',date:'2026-10-22',stops:[]};
const draft:CompletionPayload={id:'visit-a',stop_id:'stop-a',notes:'Only public notes',pools:[{pool_id:'pool-a',tasks:['Test Water'],readings:{fc:3,ph:7.4},dosages:[{product:'Salt',quantity:2,unit:'lb'}]}],photo_paths:[]};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});

beforeEach(async()=>{await device.clearDeviceData();vi.stubGlobal('navigator',{onLine:true});await device.cacheRoute(scope,route);});
afterEach(()=>vi.unstubAllGlobals());

describe('device persistence and scope',()=>{
 it('keeps drafts and photos after reopening the module without leaking another account',async()=>{
  await device.saveDraft(scope,draft);
  await device.savePhoto(scope,draft.stop_id,new Blob(['jpeg-test'],{type:'image/jpeg'}));
  vi.resetModules();
  const reopened=await import('../src/lib/offline/store');
  expect(await reopened.getDraft(scope,draft.stop_id)).toEqual(draft);
  expect((await reopened.listPhotos(scope,draft.stop_id))[0].blob.size).toBe(9);
  expect(await reopened.getDraft({userId:'other',organizationId:'org-a'},draft.stop_id)).toBeNull();
  expect(await reopened.getCachedRoute({userId:'user-a',organizationId:'other'})).toBeNull();
 });
 it('atomically retains one stable visit ID for repeated completion of the same stop',async()=>{
  await Promise.all([device.enqueueCompletion(scope,draft),device.enqueueCompletion(scope,{...draft,id:'second-id'})]);
  const queue=await device.getQueue(scope);
  expect(queue).toHaveLength(1);
  expect(queue[0].payload.id).toBe(draft.id);
 });
 it('clears pending work and identity on explicit device logout',async()=>{
  await device.enqueueCompletion(scope,draft);
  expect((await device.getLocalWorkCount()).pending).toBe(1);
  await device.clearDeviceData();
  expect(await device.getActiveScope()).toBeNull();
  expect(await device.getDraft(scope,draft.stop_id)).toBeNull();
 });
});
describe('recoverable completion queue',()=>{
 it('retains an uploaded photo across interruption and confirms only after the visit transaction succeeds',async()=>{
  const photo=await device.savePhoto(scope,draft.stop_id,new Blob(['image'],{type:'image/jpeg'}));
  await device.enqueueCompletion(scope,draft);
  let failVisit=true;const bodies:CompletionPayload[]=[];
  const network=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const path=String(input);
   if(path.startsWith('/api/session'))return json(route);
   if(path==='/api/photos'){
    expect((init?.body as FormData).get('photo_id')).toBe(photo.id);
    return json({path:'org-a/stop-a/photo.jpg'});
   }
   bodies.push(JSON.parse(String(init?.body)));
   if(failVisit)throw new TypeError('Connection lost');
   return json({visit_id:draft.id,next_stop_id:'stop-b'});
  });vi.stubGlobal('fetch',network);
  const interrupted=await device.syncQueue(scope);
  expect(interrupted).toMatchObject({synced:0,pending:1});
  expect((await device.getQueue(scope))[0].status).toBe('failed');
  expect((await device.listPhotos(scope,draft.stop_id))[0].path).toBe('org-a/stop-a/photo.jpg');
  failVisit=false;
  const recovered=await device.syncQueue(scope);
  expect(recovered).toMatchObject({synced:1,pending:0});
  expect(recovered.completions[0].next_stop_id).toBe('stop-b');
  expect(network.mock.calls.filter(([path])=>path==='/api/photos')).toHaveLength(1);
  expect(bodies.map(body=>body.id)).toEqual([draft.id,draft.id]);
  expect(bodies[1].photo_paths).toEqual(['org-a/stop-a/photo.jpg']);
  expect(await device.getDraft(scope,draft.stop_id)).toBeNull();
  expect(await device.listPhotos(scope,draft.stop_id)).toHaveLength(0);
 });
 it('marks the cached stop completed atomically with server confirmation before clearing the queue',async()=>{
  const savedRoute={...route,stops:[{id:'stop-a',technician_id:scope.userId,service_date:route.date,position:1,status:'pending' as const,property:{id:'property-a',name:'Fictional property',address:'Fictional address',gate_notes:''},customer:{id:'customer-a',name:'Fictional'},pools:[]}]};
  await device.cacheRoute(scope,savedRoute);
  await device.enqueueCompletion(scope,draft);
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>String(input).startsWith('/api/session')?json(savedRoute):json({visit_id:draft.id,next_stop_id:null})));
  expect((await device.syncQueue(scope)).synced).toBe(1);
  expect((await device.getCachedRoute(scope))?.stops[0].status).toBe('completed');
  expect(await device.getQueue(scope)).toHaveLength(0);
 });
 it('reuses the same photo identifier if the upload acknowledgement is lost',async()=>{
  const photo=await device.savePhoto(scope,draft.stop_id,new Blob(['image'],{type:'image/jpeg'}));
  await device.enqueueCompletion(scope,draft);
  const identifiers:string[]=[];let interrupted=true;
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
   if(String(input).startsWith('/api/session'))return json(route);
   if(input==='/api/photos'){
    identifiers.push(String((init?.body as FormData).get('photo_id')));
    if(interrupted){interrupted=false;throw new TypeError('Upload response was lost');}
    return json({path:'org-a/stop-a/stable.jpg'});
   }
   return json({visit_id:draft.id,next_stop_id:null});
  }));
  expect((await device.syncQueue(scope)).pending).toBe(1);
  expect((await device.syncQueue(scope)).synced).toBe(1);
  expect(identifiers).toEqual([photo.id,photo.id]);
 });
 it('does not upload queued data through a different account session',async()=>{
  await device.enqueueCompletion(scope,draft);
  const network=vi.fn(async()=>json({...route,userId:'user-b'}));vi.stubGlobal('fetch',network);
  const result=await device.syncQueue(scope);
  expect(result).toMatchObject({synced:0,pending:1,authRequired:true});
  expect(network).toHaveBeenCalledTimes(1);
 });
 it('makes no network claim while offline and retains the visit',async()=>{
  await device.enqueueCompletion(scope,draft);vi.stubGlobal('navigator',{onLine:false});
  const network=vi.fn();vi.stubGlobal('fetch',network);
  expect(await device.syncQueue(scope)).toMatchObject({synced:0,pending:1});
  expect(network).not.toHaveBeenCalled();
 });
 it('preserves the original completion time when a visit syncs on a later attempt',async()=>{
  const timestamped={...draft,completed_at:'2026-10-22T16:20:00.000Z'};
  await device.enqueueCompletion(scope,timestamped);
  const timestamps:unknown[]=[];let fail=true;
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
   if(String(input).startsWith('/api/session'))return json(route);
   timestamps.push(JSON.parse(String(init?.body)).completed_at);
   if(fail){fail=false;throw new TypeError('Offline overnight');}
   return json({visit_id:draft.id,next_stop_id:null});
  }));
  await device.syncQueue(scope);await device.syncQueue(scope);
  expect(timestamps).toEqual([timestamped.completed_at,timestamped.completed_at]);
 });
 it('allows correction only after a definite 422 rollback and retains draft and photo',async()=>{
  await device.savePhoto(scope,draft.stop_id,new Blob(['photo'],{type:'image/jpeg'}));
  await device.enqueueCompletion(scope,draft);
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{
   if(String(input).startsWith('/api/session'))return json(route);
   if(input==='/api/photos')return json({path:'org-a/stop-a/photo.jpg'});
   return json({error:'A current pH reading is required'},422);
  }));
  await device.syncQueue(scope);
  expect((await device.getQueue(scope))[0].http_status).toBe(422);
  await device.releaseRejectedCompletion(scope,draft.stop_id);
  expect(await device.getQueue(scope)).toHaveLength(0);
  expect((await device.getDraft(scope,draft.stop_id))?.id).toBe(draft.id);
  expect(await device.listPhotos(scope,draft.stop_id)).toHaveLength(1);
 });
 it('keeps ambiguous server errors read-only because the visit may have committed',async()=>{
  await device.enqueueCompletion(scope,draft);
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>String(input).startsWith('/api/session')?json(route):json({error:'Server response interrupted'},503)));
  await device.syncQueue(scope);
  await expect(device.releaseRejectedCompletion(scope,draft.stop_id)).rejects.toThrow('Only a visit rejected');
  expect(await device.getQueue(scope)).toHaveLength(1);
 });
 it('aborts in-flight synchronization before logout erases data and rejects late writes',async()=>{
  await device.savePhoto(scope,draft.stop_id,new Blob(['photo'],{type:'image/jpeg'}));
  await device.enqueueCompletion(scope,draft);
  let started:()=>void=()=>{};
  const uploading=new Promise<void>(resolve=>{started=resolve;});
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
   if(String(input).startsWith('/api/session'))return json(route);
   started();
   return new Promise<Response>((_,reject)=>{
    init?.signal?.addEventListener('abort',()=>reject(new DOMException('Logged out','AbortError')),{once:true});
   });
  }));
  const syncing=device.syncQueue(scope);
  await uploading;
  await device.clearDeviceData();
  await syncing;
  expect(await device.getActiveScope()).toBeNull();
  expect(await device.getQueue(scope)).toHaveLength(0);
  expect(await device.listPhotos(scope,draft.stop_id)).toHaveLength(0);
  await expect(device.saveDraft(scope,draft)).rejects.toThrow('active account changed');
 });
 it('rejects a stale route response that arrives after logout',async()=>{
  const epoch=await device.getDeviceEpoch();
  await device.clearDeviceData();
  await expect(device.cacheRoute(scope,route,epoch)).rejects.toThrow('signed out');
  expect(await device.getCachedRoute(scope)).toBeNull();
 });
 it('shares an in-flight sync so repeated clicks cannot send the queue twice',async()=>{
  await device.enqueueCompletion(scope,draft);
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>String(input).startsWith('/api/session')?json(route):json({visit_id:draft.id,next_stop_id:null})));
  const first=device.syncQueue(scope),second=device.syncQueue(scope);
  expect(first).toBe(second);
  expect((await first).synced).toBe(1);
 });
});

it('freezes the entire queued submission and rejects stale-tab edits after completion',async()=>{
 const photo=await device.savePhoto(scope,draft.stop_id,new Blob(['original']));
 await device.enqueueCompletion(scope,draft);
 await device.enqueueCompletion(scope,{...draft,id:'replacement',notes:'changed',pools:[]});
 expect((await device.getQueue(scope))[0].payload).toEqual(draft);
 await expect(device.saveDraft(scope,{...draft,notes:'late'})).rejects.toThrow('read-only');
 await expect(device.savePhoto(scope,draft.stop_id,new Blob(['late']))).rejects.toThrow('read-only');
 await expect(device.removePhoto(scope,photo.id)).rejects.toThrow('read-only');
 expect(await device.listPhotos(scope,draft.stop_id)).toHaveLength(1);
});
it('drains visits completed during an in-flight upload without retrying failures in a tight loop',async()=>{
 await device.savePhoto(scope,draft.stop_id,new Blob(['photo'],{type:'image/jpeg'}));await device.enqueueCompletion(scope,draft);
 let release!:()=>void,started!:()=>void;const held=new Promise<void>(r=>release=r),uploading=new Promise<void>(r=>started=r);
 const completed:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(input==='/api/session')return json(route);
  if(input==='/api/photos'){started();await held;return json({error:'Storage unavailable'},503);}
  const payload=JSON.parse(String(init?.body));completed.push(payload.stop_id);return json({visit_id:payload.id,next_stop_id:null});
 }));
 const work=device.syncQueue(scope);await uploading;
 await device.enqueueCompletion(scope,{...draft,id:'visit-b',stop_id:'stop-b'});release();
 expect(await work).toMatchObject({synced:1,pending:1});expect(completed).toEqual(['stop-b']);
 const calls=vi.mocked(fetch).mock.calls.length;
 expect(await device.syncQueue(scope,{automatic:true})).toMatchObject({synced:0,pending:1});expect(vi.mocked(fetch).mock.calls).toHaveLength(calls);
 expect((await device.getQueue(scope))[0]).toMatchObject({status:'failed',attempts:1});
});
it('persists flags offline and retries them with exactly the original visit ID and readings',async()=>{
 const flagged={...draft,issue_flags:['green_pool','equipment_issue'] as const};
 await device.enqueueCompletion(scope,{...flagged,issue_flags:[...flagged.issue_flags]});let fail=true;const sent:CompletionPayload[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(input==='/api/session')return json(route);sent.push(JSON.parse(String(init?.body)));if(fail){fail=false;throw new TypeError('lost acknowledgement');}return json({visit_id:draft.id,next_stop_id:null});
 }));
 await device.syncQueue(scope);await device.syncQueue(scope);expect(sent[0]).toEqual(sent[1]);expect(sent[1].issue_flags).toEqual(flagged.issue_flags);
});
