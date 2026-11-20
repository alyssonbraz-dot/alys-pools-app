import { json } from '@/lib/http';
import { authorizedV4Request, loadV4Route } from '@/lib/v4/server';
import { v4Day } from '@/lib/v4/validation';

export async function GET(request: Request) {
  const { operator, error } = await authorizedV4Request(request);
  if (!operator) return error;
  const day = v4Day.safeParse(new URL(request.url).searchParams.get('date'));
  if (!day.success) return json({error:'Choose a valid route date.'}, 422);
  try { return json(await loadV4Route(operator, day.data)); }
  catch { return json({error:'Unable to load the route.'}, 503); }
}
