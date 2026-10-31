export type Location = {address:string;latitude?:number|null;longitude?:number|null;location_confirmed?:boolean};
export function validCoordinates(latitude:unknown,longitude:unknown):latitude is number {
 return typeof latitude==='number'&&Number.isFinite(latitude)&&latitude>=-90&&latitude<=90&&typeof longitude==='number'&&Number.isFinite(longitude)&&longitude>=-180&&longitude<=180;
}
/** Unconfirmed pins must not silently override a service address. */
export function navigationHref(location:Location,provider:'google'|'apple'='google') {
 const destination=location.location_confirmed&&validCoordinates(location.latitude,location.longitude)?`${location.latitude},${location.longitude}`:location.address;
 return (provider==='apple'?'https://maps.apple.com/?daddr=':'https://www.google.com/maps/dir/?api=1&destination=')+encodeURIComponent(destination);
}
export function gpsError(code:number) {
 return code===1?'Location permission denied. Allow location in your browser settings or enter coordinates manually.':code===3?'GPS timed out. Try again outdoors or enter coordinates manually.':'GPS is unavailable. Try again or enter coordinates manually.';
}
