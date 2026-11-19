/** A deliberate button tap creates a new measurement; reference values are never inputs. */
export function adjustReading(value:number|undefined,direction:-1|1,ph:boolean,min:number,max:number){if(value===undefined)return direction<0?undefined:Math.max(min,Math.min(max,ph?7:1));const step=ph?20:100;return Math.max(min,Math.min(max,(Math.round(value*100)+direction*step)/100));}
