import {zonedStart} from './service-time';
import {z} from 'zod';
export type GeoStop={id:string;latitude:number;longitude:number;service_minutes:number};
export type DrivingPlan={provider:'osrm';ordered_stop_ids:string[];distance_m:number;duration_s:number;service_minutes:number;geometry:[number,number][];arrivals:{stop_id:string;at:string;distance_m:number;duration_s:number}[];calculated_at:string};
const matrixSchema=z.object({code:z.literal('Ok'),durations:z.array(z.array(z.number().nonnegative().nullable())),distances:z.array(z.array(z.number().nonnegative().nullable())).optional()});
const routeSchema=z.object({code:z.literal('Ok'),routes:z.array(z.object({distance:z.number().nonnegative(),duration:z.number().nonnegative(),geometry:z.object({coordinates:z.array(z.tuple([z.number().min(-180).max(180),z.number().min(-90).max(90)]))}),legs:z.array(z.object({distance:z.number().nonnegative(),duration:z.number().nonnegative()}))})).min(1)});
// Directed road-duration costs, never straight-line distances. Greedy selection followed by improving swaps.
export function roadOrder(matrix:(number|null)[][],fixedStart=true):number[]{
 const n=matrix.length;if(!n||n>51||matrix.some(r=>r.length!==n))throw new Error('Invalid driving matrix');
 const remaining=new Set(Array.from({length:n-1},(_,i)=>i+1));const order=[0];
 while(remaining.size){const previous=order[order.length-1];const next=[...remaining].filter(i=>matrix[previous][i]!=null).sort((a,b)=>matrix[previous][a]!-matrix[previous][b]!)[0];if(next===undefined)throw new Error('No driving connection between stops');order.push(next);remaining.delete(next);}
 const cost=(o:number[])=>o.slice(1).reduce((sum,v,i)=>sum+(matrix[o[i]][v]??Infinity),0);
 for(let pass=0;pass<5;pass++){let improved=false;for(let i=fixedStart?1:0;i<n-1;i++)for(let j=i+1;j<n;j++){const next=[...order];[next[i],next[j]]=[next[j],next[i]];if(cost(next)+0.01<cost(order)){order.splice(0,n,...next);improved=true;}}if(!improved)break;}
 return order;
}
export function routeFingerprint(stops:GeoStop[]){return JSON.stringify(stops.map(s=>[s.id,s.latitude,s.longitude,s.service_minutes]));}
export function floridaStart(date:string,time:string,timeZone='America/New_York'){return zonedStart(date,time,timeZone);}
export async function calculateDriving(stops:GeoStop[],options:{baseUrl:string;optimize:boolean;start?:{latitude:number;longitude:number};startedAt:Date},fetcher:typeof fetch=fetch):Promise<DrivingPlan>{
 if(!stops.length||stops.length>50)throw new Error('Choose between 1 and 50 open stops');
 const base=new URL(options.baseUrl);if(base.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(base.hostname))throw new Error('Routing URL must use HTTPS');
 const origin=options.start;const points=origin?[origin,...stops]:stops;
 const coords=points.map(p=>`${p.longitude},${p.latitude}`).join(';');
 async function call(path:string){const response=await fetcher(new URL(path,base),{signal:AbortSignal.timeout(12000),cache:'no-store'});if(!response.ok)throw new Error('Driving provider unavailable');return response.json();}
 let indices=points.map((_,i)=>i);
 if(options.optimize&&points.length>2){const matrix=matrixSchema.parse(await call(`/table/v1/driving/${coords}?annotations=duration,distance`));if(matrix.durations.length!==points.length)throw new Error('Invalid driving matrix');indices=roadOrder(matrix.durations);}
 const ordered=indices.filter(i=>!origin||i!==0).map(i=>stops[origin?i-1:i]);
 const pathPoints=origin?[origin,...ordered]:ordered;
 if(pathPoints.length===1)return {provider:'osrm',ordered_stop_ids:ordered.map(s=>s.id),distance_m:0,duration_s:0,service_minutes:ordered[0].service_minutes,geometry:[[ordered[0].longitude,ordered[0].latitude]],arrivals:[{stop_id:ordered[0].id,at:options.startedAt.toISOString(),distance_m:0,duration_s:0}],calculated_at:new Date().toISOString()};
 const result=routeSchema.parse(await call(`/route/v1/driving/${pathPoints.map(p=>`${p.longitude},${p.latitude}`).join(';')}?overview=full&geometries=geojson&steps=false`)).routes[0];
 if(result.legs.length!==pathPoints.length-1)throw new Error('Invalid driving legs');
 let seconds=0;const arrivals=ordered.map((stop,index)=>{const leg=origin?result.legs[index]:index===0?{distance:0,duration:0}:result.legs[index-1];seconds+=leg.duration;const at=new Date(options.startedAt.getTime()+seconds*1000).toISOString();seconds+=stop.service_minutes*60;return {stop_id:stop.id,at,distance_m:leg.distance,duration_s:leg.duration};});
 return {provider:'osrm',ordered_stop_ids:ordered.map(s=>s.id),distance_m:result.distance,duration_s:result.duration,service_minutes:ordered.reduce((n,s)=>n+s.service_minutes,0),geometry:result.geometry.coordinates,arrivals,calculated_at:new Date().toISOString()};
}
