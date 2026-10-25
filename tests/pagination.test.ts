import {expect,it} from 'vitest';
import {allRows,forIds} from '../src/lib/pagination';
it('reads relationships after1000 records and propagates page errors',async()=>{
 const data=Array.from({length:1201},(_,id)=>({id}));
 expect(await allRows(async(a,b)=>({data:data.slice(a,b+1),error:null}))).toHaveLength(1201);
 await expect(allRows(async()=>({data:null,error:new Error('failed')}))).rejects.toThrow();
});
it('batches large sets of related IDs without dropping the final batch',async()=>{
 const ids=Array.from({length:301},(_,i)=>String(i));
 const rows=await forIds(ids,async(batch,a,b)=>({data:batch.slice(a,b+1),error:null}));expect(rows).toEqual(ids);
});
