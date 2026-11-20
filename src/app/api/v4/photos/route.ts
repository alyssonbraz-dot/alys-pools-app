import sharp from 'sharp';
import { z } from 'zod';
import { json } from '@/lib/http';
import { authorizedV4Request } from '@/lib/v4/server';

export const runtime = 'nodejs';
const limit = 2 * 1024 * 1024;
const bucketName = 'v4-visit-photos';

async function readJpeg(request: Request) {
  if (!request.body || Number(request.headers.get('content-length')) > limit) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function photoAccess(request: Request) {
  const auth = await authorizedV4Request(request);
  if (!auth.operator) return { error: auth.error };
  const { operator } = auth;
  const visit = z.uuid().safeParse(new URL(request.url).searchParams.get('visit'));
  if (!visit.success) return { error: json({error:'Invalid visit.'}, 400) };
  const result = await operator.db.from('visits').select('id').eq('id', visit.data).maybeSingle();
  if (result.error) return { error: json({error:'Visit lookup unavailable.'}, 503) };
  if (!result.data) return { error: json({error:'Visit not found.'}, 404) };
  return { bucket: operator.db.storage.from(bucketName), path: operator.orgId + '/' + visit.data + '.jpg', visitId:visit.data };
}

export async function POST(request: Request) {
  const access = await photoAccess(request);
  if (!access.bucket) return access.error;
  if (request.headers.get('content-type') !== 'image/jpeg') return json({error:'JPEG required.'}, 415);
  const bytes = await readJpeg(request);
  if (!bytes) return json({error:'Photo exceeds 2 MB.'}, 413);
  let jpeg: Buffer;
  try {
    const image = sharp(bytes, {limitInputPixels: 16_000_000, failOn:'error'});
    if ((await image.metadata()).format !== 'jpeg') return json({error:'JPEG required.'}, 415);
    jpeg = await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true})
      .jpeg({quality:80}).toBuffer();
  } catch {
    return json({error:'Invalid JPEG.'}, 422);
  }
  if (jpeg.length > limit) return json({error:'Photo exceeds 2 MB.'}, 413);

  const { error } = await access.bucket.upload(access.path, jpeg, {contentType:'image/jpeg', cacheControl:'0', upsert:false});
  if (error) {
    // Retries may arrive after Storage committed the original request.
    const existing = await access.bucket.download(access.path);
    if (!existing.data) return json({error:'Photo upload unavailable. The local copy is kept.'}, 503);
    if (!jpeg.equals(Buffer.from(await existing.data.arrayBuffer()))) {
      return json({error:'A different photo is already attached. The local copy is kept.'}, 409);
    }
  }
  return json({saved:true,visitId:access.visitId});
}

export async function GET(request: Request) {
  const access = await photoAccess(request);
  if (!access.bucket) return access.error;
  const {data, error} = await access.bucket.download(access.path);
  if (!data || error) {
    const status = Number(error && 'statusCode' in error ? error.statusCode : 0);
    return json({error:'Photo unavailable.'}, [400,403,404].includes(status) ? 404 : 503);
  }
  return new Response(data, {headers:{
    'Content-Type':'image/jpeg', 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; sandbox",
  }});
}
