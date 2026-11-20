import { json } from '@/lib/http';
import { authorizedV4Request } from '@/lib/v4/server';

export async function GET(request: Request) {
  const { operator, error } = await authorizedV4Request(request);
  if (!operator) return error;
  return json({userId: operator.userId, orgId: operator.orgId});
}
