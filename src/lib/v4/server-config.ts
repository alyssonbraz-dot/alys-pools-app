import 'server-only';

export const v4CookieOptions = { name: 'alys-v4-auth', httpOnly: true, sameSite: 'lax' as const, path: '/' };

export function v4Config() {
  const url = process.env.V4_SUPABASE_URL;
  const key = process.env.V4_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}
