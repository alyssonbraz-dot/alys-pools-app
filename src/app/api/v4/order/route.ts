import { boundedJson, json } from '@/lib/http';
import { authorizedV4Request, v4DatabaseError } from '@/lib/v4/server';
import { orderSchema } from '@/lib/v4/validation';

export async function POST(request: Request) {
  const { operator, error } = await authorizedV4Request(request);
  if (!operator) return error;
  const order = orderSchema.safeParse(await boundedJson(request, 32 * 1024).catch(() => null));
  if (!order.success) return json({error:'Check the order and service date.'}, 422);
  const {date, ids, mode} = order.data;
  const result = await operator.db.rpc('v4_order', {p_day: date, p_ids: ids, p_mode: mode});
  if (result.error) return v4DatabaseError(result.error.code);
  return json(result.data);
}
