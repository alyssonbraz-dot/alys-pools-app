/* Public assets only. Device drafts/photos remain in their existing IndexedDB. */
const VERSION = 'alys-field-shell-v221';
const META = '/__alys_offline_resources__';
const ICONS = ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png'];
let warming;
let lastError = '';
async function notify(data) { for (const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})) client.postMessage({type:'ALYS_OFFLINE_STATUS',...data}); }
async function installed(cache) {
 const shell=await cache.match('/offline');const meta=await cache.match(META);
 if(!shell||!meta)return false;
 try { const urls=await meta.json();return Array.isArray(urls)&&urls.length>ICONS.length&&(await Promise.all(urls.map(url=>cache.match(url)))).every(Boolean); } catch { return false; }
}
async function status() { return {ready:await installed(await caches.open(VERSION)),error:lastError}; }
async function warmOfflineShell() {
 if(warming)return warming;
 warming=(async()=>{
  await notify({ready:false,installing:true});
  const cache=await caches.open(VERSION);
  const response=await fetch('/offline',{cache:'no-store',credentials:'omit'});
  const final=new URL(response.url||'/offline',self.location.origin);
  if(!response.ok||final.origin!==self.location.origin||!['/offline','/offline/'].includes(final.pathname))throw new Error('Offline shell HTTP '+response.status);
  const html=await response.clone().text();
  const urls=[...new Set([...html.matchAll(/(?:src|href)="([^"<>]+)"/g)].map(m=>m[1].replaceAll('&amp;','&')).map(path=>new URL(path,self.location.origin)).filter(url=>url.origin===self.location.origin&&url.pathname.startsWith('/_next/static/')).map(url=>url.pathname+url.search))];
  if(!urls.some(url=>/\.js(?:\?|$)/.test(url)))throw new Error('Offline shell has no JavaScript assets');
  const resources=[...ICONS,...urls];
  // Keep deployment query strings. Cache each immutable asset before replacing
  // the last usable shell. A failed update never clears structured device work.
  for(const path of resources){const asset=await fetch(path,{cache:'reload',credentials:'omit'});if(!asset.ok||asset.type==='opaqueredirect')throw new Error('Offline asset HTTP '+asset.status+': '+new URL(path,self.location.origin).pathname);await cache.put(path,asset);}
  await cache.put('/offline',response);
  await cache.put(META,new Response(JSON.stringify(resources),{headers:{'Content-Type':'application/json'}}));
  lastError='';await notify(await status());
  // Only remove obsolete public shell caches after the replacement is complete.
  for(const key of await caches.keys())if((key.startsWith('alys-field-shell-')||key==='alys-pools-demo-v1')&&key!==VERSION)await caches.delete(key);
 })().catch(async error=>{lastError=error instanceof Error?error.message:'Offline resource unavailable';await notify(await status());}).finally(()=>{warming=undefined;});
 return warming;
}
self.addEventListener('install',event=>{event.waitUntil(warmOfflineShell().then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('message',event=>{
 if(event.data?.type==='WARM_OFFLINE_SHELL')event.waitUntil(warmOfflineShell());
 if(event.data?.type==='CHECK_OFFLINE_STATUS')event.waitUntil(status().then(data=>event.source?.postMessage({type:'ALYS_OFFLINE_STATUS',...data})));
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||request.headers.has('RSC'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).catch(async()=>{
   const keys=[VERSION,...(await caches.keys()).filter(k=>k.startsWith('alys-field-shell-')&&k!==VERSION)];
   for(const key of keys){const fallback=await (await caches.open(key)).match('/offline');if(fallback)return fallback;}
   return new Response('Offline shell unavailable. Reconnect and use Check offline installation in Settings.',{status:503,headers:{'Content-Type':'text/plain'}});
  }));return;
 }
 if(url.pathname.startsWith('/_next/static/')||ICONS.includes(url.pathname))event.respondWith((async()=>{
  const cached=await caches.match(request,{ignoreSearch:true});if(cached)return cached;
  const response=await fetch(request);if(response.ok)await (await caches.open(VERSION)).put(request,response.clone());return response;
 })());
});
