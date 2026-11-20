import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {contentPolicy} from './lib/security';
import { supabaseConfig } from './lib/supabase/config';
import { v4Config, v4CookieOptions } from './lib/v4/server-config';
export async function proxy(request: NextRequest) {
  const nonce=Buffer.from(crypto.randomUUID()).toString('base64');
  const policy=contentPolicy(nonce,process.env.NODE_ENV==='development');
  request.headers.set('Content-Security-Policy',policy);
  const path = request.nextUrl.pathname;
  const isV4 = path === '/v4' || path.startsWith('/v4/') || path.startsWith('/api/v4/');
  const config = isV4 ? v4Config() : supabaseConfig();
  let response = NextResponse.next({request:{headers:request.headers}});
  if (!config || (isV4 && (path.startsWith('/api/') || !request.cookies.getAll().some(cookie => cookie.name.startsWith(v4CookieOptions.name))))) {
    response.headers.set('Content-Security-Policy',policy);
    if (isV4) response.headers.set('Cache-Control','private, no-store');
    return response;
  }
  const client = createServerClient(config.url,config.key,{cookieOptions:isV4 ? v4CookieOptions : undefined,cookies:{
    getAll: () => request.cookies.getAll(),
    setAll: (items) => {
      items.forEach(({name,value})=>request.cookies.set(name,value));
      response = NextResponse.next({request:{headers:request.headers}});
      items.forEach(({name,value,options})=>response.cookies.set(name,value,options));
    }
  }});
  // V4 validates the user in each page/handler. Only refresh the cookie here.
  if (isV4) await client.auth.getSession();
  else await client.auth.getUser();
  response.headers.set('Content-Security-Policy',policy);
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|icons/|manifest.webmanifest).*)'] };
