import { after } from 'next/server';
import { z } from 'zod';
import { getOperator } from '@/lib/auth';
import { sameOrigin, boundedJson } from '@/lib/http';
import { processEmailQueue } from '@/lib/email/worker';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  const operator = await getOperator();
  if (!operator || !['owner','admin'].includes(operator.profile.role)) return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  let input: unknown;
  try { input = await boundedJson(request, 1024); } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
  const parsed = z.object({ visit_id: z.uuid() }).strict().safeParse(input);
  if (!parsed.success) return Response.json({ error: 'Invalid visit ID.' }, { status: 400 });
  const { data, error } = await operator.db.rpc('request_email_retry', { p_visit_id: parsed.data.visit_id });
  if (error) return Response.json({ error: error.code === '22023' ? 'Provider reconciliation required: the safe retry window has expired.' : 'Report cannot be retried.' }, { status: 409 });
  if (data !== 'sent') after(async () => { await processEmailQueue(); });
  return Response.json({ status: data, delivery_enabled: process.env.EMAIL_DELIVERY_ENABLED === 'true' }, { headers: { 'Cache-Control': 'private, no-store' } });
}
