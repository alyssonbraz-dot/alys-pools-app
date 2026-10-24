import { describe,expect,it } from 'vitest';
import type { CompletionPayload,PoolConfig } from '@/lib/field/types';
import { reconcileDraft } from '../src/components/field/draft';
const main:PoolConfig={id:'main',name:'Main pool',gallons:15000,checklist:['Test Water'],required_readings:['fc','ph'],photo_required:false};
const spa:PoolConfig={...main,id:'spa',name:'Spa',gallons:1000};
const original:CompletionPayload={id:'stable-id',stop_id:'stop',started_at:'2026-10-22T12:00:00Z',completed_at:'2026-10-22T12:30:00Z',pools:[{pool_id:'main',tasks:['Test Water'],readings:{fc:3,ph:7.4},dosages:[{product:'Liquid Chlorine',quantity:1,unit:'gal'}]}],notes:'Recorded service',photo_paths:[]};
describe('configuration changes during a field visit',()=>{
 it('preserves entered work and completion time when a refreshed route adds a pool',()=>{
  const next=reconcileDraft(original,[main,spa]);
  expect(next.pools[0]).toBe(original.pools[0]);
  expect(next.pools[1]).toEqual({pool_id:'spa',tasks:[],readings:{},dosages:[]});
  expect(next.id).toBe(original.id);expect(next.completed_at).toBe(original.completed_at);
 });
 it('does not discard a retired pool or duplicate records on later refreshes',()=>{
  const next=reconcileDraft(original,[spa]);
  expect(next.pools.map(pool=>pool.pool_id)).toEqual(['main','spa']);
  expect(reconcileDraft(next,[spa])).toBe(next);
 });
});
