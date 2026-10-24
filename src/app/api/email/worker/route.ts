import { timingSafeEqual } from 'node:crypto';
import { processEmailQueue } from '@/lib/email/worker';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const secret = process.env.REPORT_WORKER_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!secret || secret.startsWith('replace-') || secret.length < 32 || Buffer.byteLength(supplied) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))) return Response.json({ error: 'Unauthorized worker request.' }, { status: 401 });
  try {
    const result = await processEmailQueue({ limit: 10 });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Email worker could not process the queue.' }, { status: 503 }); }
}
