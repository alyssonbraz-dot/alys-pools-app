import { z } from 'zod';
import { boundedJson, json } from '@/lib/http';
import { authorizedV4Request, v4DatabaseError } from '@/lib/v4/server';
import { v4Day } from '@/lib/v4/validation';

const newStop = z.strictObject({
  id: z.uuid(),
  date: v4Day,
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(320),
  kind: z.enum(['pool', 'spa']),
  gallons: z.number().int().positive().max(100_000_000).nullable(),
});

export async function POST(request: Request) {
  const { operator, error } = await authorizedV4Request(request);
  if (!operator) return error;
  if (operator.role !== 'owner') return json({ error: 'Owner access required.' }, 403);
  const input = newStop.safeParse(await boundedJson(request, 4096).catch(() => null));
  if (!input.success) return json({ error: 'Check the customer, address and water body.' }, 422);
  const { id, date, name, address, kind, gallons } = input.data;
  const result = await operator.db.rpc('v4_add_stop', {
    p_id: id, p_day: date, p_name: name, p_address: address, p_kind: kind, p_gallons: gallons,
  });
  if (result.error) return v4DatabaseError(result.error.code);
  return json({ id: result.data }, 201);
}
