import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {contentPolicy} from './lib/security';
import { supabaseConfig } from './lib/supabase/config';
export async function proxy(request: NextRequest) {
  const nonce=Buffer.from(crypto.randomUUID()).toString('base64');
  const policy=contentPolicy(nonce,process.env.NODE_ENV==='development');
  request.headers.set('Content-Security-Policy',policy);
  const config = supabaseConfig();
  let response = NextResponse.next({request:{headers:request.headers}});
  if (!config){response.headers.set('Content-Security-Policy',policy);return response;}
  const client = createServerClient(config.url,config.key,{cookies:{
    getAll: () => request.cookies.getAll(),
    setAll: (items) => {
      items.forEach(({name,value})=>request.cookies.set(name,value));
      response = NextResponse.next({request:{headers:request.headers}});
      items.forEach(({name,value,options})=>response.cookies.set(name,value,options));
    }
  }});
  await client.auth.getUser();
  response.headers.set('Content-Security-Policy',policy);
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|icons/|manifest.webmanifest).*)'] };
