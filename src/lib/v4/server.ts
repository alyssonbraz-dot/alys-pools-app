import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { json, sameOrigin } from '@/lib/http';
import { v4Config, v4CookieOptions } from './server-config';
import type { RouteDay } from './types';

export async function v4Client() {
  const config = v4Config();
  if (!config) return null;
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: v4CookieOptions,
    cookies: {
      getAll: () => store.getAll(),
      setAll: items => {
        // The proxy refreshes cookies for read-only Server Component requests.
        try { for (const {name, value, options} of items) store.set(name, value, options); }
        catch { /* Server Components cannot set cookies. */ }
      },
    },
  });
}

type V4Operator = {
  db: NonNullable<Awaited<ReturnType<typeof v4Client>>>;
  userId: string;
  orgId: string;
  role: string;
};
type V4Auth = { operator: V4Operator; error?: never } | { operator?: never; error: Response };

export async function v4Operator(): Promise<V4Auth> {
  const db = await v4Client();
  if (!db) return { error: json({error:'V4 database is unavailable.'}, 503) };
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) {
    return { error: json({error:'Sign in to your V4 account.'}, error?.status && error.status >= 500 ? 503 : 401) };
  }
  const { data: profile, error: denied } = await db.from('profiles')
    .select('organization_id,role').eq('id', data.user.id).maybeSingle();
  if (denied) return { error: json({error:'Unable to verify your workspace.'}, 503) };
  if (!profile) return { error: json({error:'Your account needs access to this workspace.'}, 403) };
  return { operator: { db, userId: data.user.id, orgId: profile.organization_id as string, role: profile.role as string } };
}

export async function authorizedV4Request(request: Request): Promise<V4Auth> {
  const mutation = request.method !== 'GET';
  if (mutation && !sameOrigin(request)) return { error: json({error:'Invalid request origin.'}, 403) };
  const auth = await v4Operator();
  if (!auth.operator) return auth;
  const { userId, orgId } = auth.operator;
  const expectedUser = request.headers.get('x-alys-user-id');
  const expectedOrg = request.headers.get('x-alys-organization-id');
  if (mutation || expectedUser !== null || expectedOrg !== null) {
    if (expectedUser !== userId || expectedOrg !== orgId) {
      return { error: json({error:'Account changed. Switch back to the account that saved this visit.'}, 403) };
    }
  }
  return auth;
}

export async function loadV4Route(operator: V4Operator, day: string) {
  const { data, error } = await operator.db.rpc('v4_route', {p_day: day});
  if (error) throw new Error('Unable to load the route.');
  return data as RouteDay;
}

export function v4DatabaseError(code: string) {
  if (code === '42501') return json({error:'You no longer have access to this stop.'}, 403);
  if (['23505','P0001','40001'].includes(code)) return json({error:'The saved stop has changed. Review its current status.'}, 409);
  if (['22023','23514','22P02'].includes(code)) return json({error:'Check the stop, readings and route date.'}, 422);
  return json({error:'Unable to save right now. Please try again.'}, 503);
}
