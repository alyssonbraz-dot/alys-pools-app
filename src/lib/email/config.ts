import { z } from 'zod';
export function emailConfiguration(environment: Record<string, string | undefined> = process.env) {
  if (environment.EMAIL_DELIVERY_ENABLED !== 'true') return null;
  const { SUPABASE_SERVICE_ROLE_KEY: serviceKey, NEXT_PUBLIC_SUPABASE_URL: url, RESEND_API_KEY: apiKey, EMAIL_FROM: from } = environment;
  if (!serviceKey || serviceKey.startsWith('replace-') || !apiKey || apiKey.startsWith('replace-') || !url || !from || /[\r\n]/.test(from)) return null;
  const address = from.match(/<([^<>]+)>$/)?.[1] ?? from;
  if (!z.email().safeParse(address).success || !z.url().safeParse(url).success) return null;
  const replyTo=environment.EMAIL_REPLY_TO;if(replyTo&&!z.email().safeParse(replyTo).success)return null;
  return { serviceKey, url, apiKey, from,...(replyTo?{replyTo}:{}) };
}
