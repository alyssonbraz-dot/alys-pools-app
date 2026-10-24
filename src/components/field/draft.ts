import type { CompletionPayload, PoolConfig } from '@/lib/field/types';

// A new pool always starts with empty work records. Existing measurements are never replaced.
// Retired pools remain in the draft so the operator can resolve a configuration mismatch explicitly.
export function reconcileDraft(draft:CompletionPayload,pools:PoolConfig[]):CompletionPayload {
  const added=pools.filter(pool=>!draft.pools.some(record=>record.pool_id===pool.id));
  if(!added.length)return draft;
  return {...draft,pools:[...draft.pools,...added.map(pool=>({pool_id:pool.id,tasks:[],readings:{},dosages:[]}))]};
}
