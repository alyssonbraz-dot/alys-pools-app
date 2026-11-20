import { boundedJson, json } from '@/lib/http';
import { authorizedV4Request, v4DatabaseError } from '@/lib/v4/server';
import { visitSchema } from '@/lib/v4/validation';

export async function POST(request: Request) {
  const { operator, error } = await authorizedV4Request(request);
  if (!operator) return error;
  const visit = visitSchema.safeParse(await boundedJson(request, 128 * 1024).catch(() => null));
  if (!visit.success) return json({error:'Check the readings, tasks and dosages for each pool or spa.'}, 422);
  const result = await operator.db.rpc('v4_complete', {p_visit: visit.data});
  if (result.error) return v4DatabaseError(result.error.code);
  return json(result.data);
}
