import {describe,it,expect} from 'vitest';
import {navigationHref,validCoordinates,gpsError} from '../src/lib/location';
import {translate} from '../src/lib/i18n/core';
describe('GPS destinations',()=>{
 it('uses only valid confirmed coordinates, including zero, for both navigation providers',()=>{
  const property={address:'Fictional customer address',latitude:0,longitude:0,location_confirmed:true};
  expect(new URL(navigationHref(property)).searchParams.get('destination')).toBe('0,0');
  expect(new URL(navigationHref(property,'apple')).searchParams.get('daddr')).toBe('0,0');
  for(const invalid of [{location_confirmed:false},{latitude:null},{longitude:181},{latitude:NaN},{longitude:Infinity}])expect(new URL(navigationHref({...property,...invalid})).searchParams.get('destination')).toBe(property.address);
 });
 it('rejects out of range and non numeric GPS values',()=>{expect(validCoordinates(-90,180)).toBe(true);for(const coords of [[91,0],[0,-181],['1',2],[null,0],[NaN,0]])expect(validCoordinates(...coords as [unknown,unknown])).toBe(false);});
 it('localizes denied, timed out and unavailable GPS errors',()=>{for(const code of [1,2,3])for(const lang of ['pt','es'] as const)expect(translate(gpsError(code),lang)).not.toBe(gpsError(code));});
});
