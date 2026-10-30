import {it,expect} from 'vitest';
import {nextAssignedStop} from '../src/lib/field/navigation';
import type {RouteStop} from '../src/lib/field/types';
const stop=(id:string,tech='tech',status:RouteStop['status']='pending')=>({id,technician_id:tech,status} as RouteStop);
it('advances in assigned order, skips queued/closed stops and never opens another technician assignment',()=>{const stops=[stop('a'),stop('other','other-tech'),stop('b'),stop('c'),stop('d','tech','skipped')];expect(nextAssignedStop(stops,stops[2],new Set(['b']))?.id).toBe('c');expect(nextAssignedStop(stops,stops[3],new Set(['b','c']))?.id).toBe('a');expect(nextAssignedStop(stops,stops[0],new Set(['a','b','c']))).toBeUndefined();});
