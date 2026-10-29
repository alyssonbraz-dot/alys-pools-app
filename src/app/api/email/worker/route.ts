import { timingSafeEqual } from 'node:crypto';
import {administration} from '@/lib/team/server';
import { processEmailQueue } from '@/lib/email/worker';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const secret = process.env.REPORT_WORKER_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!secret || secret.startsWith('replace-') || secret.length < 32 || Buffer.byteLength(supplied) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))) return Response.json({ error: 'Unauthorized worker request.' }, { status: 401 });
  const key=request.headers.get('x-alys-worker-source')==='schedule'?'schedule':'manual';
  const admin=administration();await admin.from('worker_observations').upsert({key,started_at:new Date().toISOString(),finished_at:null,outcome:'running'});
  try {
    const result = await processEmailQueue({ limit: 1 });
    await admin.from('worker_observations').update({finished_at:new Date().toISOString(),outcome:result.enabled?'ok':'disabled'}).eq('key',key);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch { await admin.from('worker_observations').update({finished_at:new Date().toISOString(),outcome:'error'}).eq('key',key);return Response.json({ error: 'Email worker could not process the queue.' }, { status: 503 }); }
}
