import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Contract } from './domain';
// PostgREST limits response size. Read every page before calculating totals.
export async function loadContracts(db:SupabaseClient):Promise<Contract[]> {
  const rows:Contract[]=[];
  for(let offset=0;;offset+=500) {
    const {data,error}=await db.from('contracts').select('source,billing_model,price_cents,status').order('id').range(offset,offset+499);
    if(error)throw new Error('Unable to load contracts');
    rows.push(...(data as Contract[]));
    if(data.length<500)return rows;
  }
}
