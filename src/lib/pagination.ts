/** Read every page with a stable order supplied by the caller. Never silently truncate relationships. */
export async function allRows<T>(read:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>,size=500):Promise<T[]> {
 const rows:T[]=[];
 for(let from=0;;from+=size){const {data,error}=await read(from,from+size-1);if(error)throw new Error('Unable to load records');rows.push(...(data??[]));if(!data||data.length<size)return rows;}
}
export async function forIds<T>(ids:string[],read:(ids:string[],from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>):Promise<T[]> {
 const rows:T[]=[];for(let i=0;i<ids.length;i+=100)rows.push(...await allRows((from,to)=>read(ids.slice(i,i+100),from,to)));return rows;
}
