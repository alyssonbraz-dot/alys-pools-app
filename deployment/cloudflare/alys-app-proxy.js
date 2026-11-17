/**
 * Route: alyspools.com/app* (and optionally www.alyspools.com/app*).
 * Requires an app build with Next.js basePath '/app' deployed at Netlify.
 * Do NOT run this worker on the site root; Hostinger remains untouched.
 * Configure env ALYS_NETLIFY_ORIGIN to the app's stable Netlify hostname.
 */
const worker = {
 async fetch(request,env){
  const incoming=new URL(request.url);
  if(!['alyspools.com','www.alyspools.com'].includes(incoming.hostname))
   return new Response('Unknown host',{status:421});
  if(incoming.pathname!=='/app'&&!incoming.pathname.startsWith('/app/'))
   return fetch(request); // Worker route must only cover /app paths
  if(incoming.hostname==='www.alyspools.com'){incoming.hostname='alyspools.com';return Response.redirect(incoming.toString(),308);}
  let origin;try{origin=new URL(env.ALYS_NETLIFY_ORIGIN);}catch{return new Response('App origin not configured',{status:503});}
  if(!origin.hostname.endsWith('.netlify.app')||origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)
   return new Response('App origin not configured',{status:503});
  if(incoming.pathname==='/app'){incoming.pathname='/app/';return Response.redirect(incoming.toString(),308);}
  const target=new URL(incoming.pathname+incoming.search,origin);
  // Browser stays on alyspools.com so authenticated requests are same-origin.
  const outbound=new Request(target,request);
  outbound.headers.set('x-forwarded-host',incoming.host);
  outbound.headers.set('x-forwarded-proto',incoming.protocol.slice(0,-1));
  const response=await fetch(outbound,{redirect:'manual',cache:'no-store'});
  const headers=new Headers(response.headers);
  const location=headers.get('location');
  if(location){
   const redirect=new URL(location,target);
   if(redirect.origin===origin.origin){
    redirect.protocol=incoming.protocol;
    redirect.host=incoming.host;
    headers.set('location',redirect.toString());
   }
  }
  // Do not rewrite or cache credentials, cookies, authorization or Set-Cookie.
  headers.delete('content-length');
  headers.set('Cache-Control','private, no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 }
};

export default worker;
