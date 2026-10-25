import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from '@/lib/supabase/config';
import { getOperator } from '@/lib/auth';
import { sameOrigin, matchesDeviceScope } from '@/lib/http';

export const runtime = 'nodejs';
const uuid = z.uuid();
const MAX_FILE = 2 * 1024 * 1024;
const MAX_BODY = MAX_FILE + 64 * 1024;
const pathSchema = z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/i);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function boundedFormData(request: Request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new Error('size');
  if (!request.body) throw new Error('body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY) { await reader.cancel(); throw new Error('size'); }
    chunks.push(value);
  }
  return new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData();
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
  const operator = await getOperator();
  if (!operator) return json({ error: 'Sign in to upload photos.' }, 401);
  if (!matchesDeviceScope(request,operator.user.id,operator.profile.organization_id)) return json({ error: 'The active account changed. Sign in to the draft owner account before syncing.' }, 409);
  let form: FormData;
  try { form = await boundedFormData(request); } catch { return json({ error: 'Upload must be a JPEG up to 2 MB.' }, 413); }
  const stopId = uuid.safeParse(form.get('stop_id'));
  const photoId = uuid.safeParse(form.get('photo_id') || randomUUID());
  const file = form.get('file');
  if (!stopId.success || !photoId.success || !(file instanceof File) || file.type !== 'image/jpeg' || !file.size || file.size > MAX_FILE) {
    return json({ error: 'Upload must be a JPEG up to 2 MB with a valid stop.' }, 400);
  }
  const { db, profile } = operator;
  const { data: stop, error: stopError } = await db.from('route_stops').select('id,status').eq('id', stopId.data).eq('organization_id', profile.organization_id).single();
  if (stopError || !stop) return json({ error: 'Stop not found or access denied.' }, 404);
  const path = `${profile.organization_id}/${stop.id}/${photoId.data.toLowerCase()}.jpg`;
  // Deterministic IDs make retries recoverable after an upload response is lost.
  const bucket = db.storage.from('visit-photos');
  const existing = await bucket.download(path);
  if (!existing.error && existing.data) return json({ path });
  if (stop.status === 'completed' || stop.status === 'skipped') return json({ error: 'Photos cannot be changed after the stop is closed.' }, 409);
  const {data:reserved,error:quotaError}=await db.rpc('reserve_photo_upload',{p_stop:stop.id,p_photo:photoId.data});
  if(quotaError||!reserved)return json({error:'Photo upload budget reached. Keep your local photo and contact the administrator.'},429);
  let image: Buffer;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('jpeg');
    image = await sharp(bytes, { limitInputPixels: 25_000_000, failOn: 'error' }).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    if (image.length > MAX_FILE) throw new Error('size');
  } catch { return json({ error: 'Photo could not be decoded as a valid JPEG.' }, 400); }
  // Browser keys cannot INSERT storage objects. Only this decoded/re-encoded
  // pipeline writes photographs using a key that never leaves the server.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const config = supabaseConfig();
  if (!config || !serviceKey || serviceKey.startsWith('replace-')) return json({ error: 'Photo storage is not configured. Keep this draft and contact the administrator.' }, 503);
  const storage = createClient(config.url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from('visit-photos');
  const { error } = await storage.upload(path, image, { contentType: 'image/jpeg', upsert: false, cacheControl: '0' });
  if (error) {
    // Another tab may have uploaded the same ID concurrently; never overwrite it.
    const retry = await bucket.download(path);
    if (!retry.error && retry.data) return json({ path });
    return json({ error: 'Photo upload failed. Your local draft is kept for retry.' }, 503);
  }
  return json({ path });
}

export async function GET(request: Request) {
  const operator = await getOperator();
  if (!operator) return json({ error: 'Sign in to view photos.' }, 401);
  const parsed = pathSchema.safeParse(new URL(request.url).searchParams.get('path'));
  if (!parsed.success) return json({ error: 'Invalid photo path.' }, 400);
  const [organizationId, stopId, photoName] = parsed.data.split('/');
  if (!uuid.safeParse(organizationId).success || !uuid.safeParse(stopId).success || !uuid.safeParse(photoName.slice(0, -4)).success || organizationId !== operator.profile.organization_id) return json({ error: 'Photo not found.' }, 404);
  const { data: stop } = await operator.db.from('route_stops').select('id').eq('id', stopId).single();
  if (!stop) return json({ error: 'Photo not found.' }, 404);
  const { data, error } = await operator.db.storage.from('visit-photos').createSignedUrl(parsed.data, 300);
  if (error || !data) return json({ error: 'Photo not found or access denied.' }, 404);
  return json({ url: data.signedUrl });
}
