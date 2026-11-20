import { json } from '@/lib/http';
import { authorizedV4Request } from '@/lib/v4/server';

export async function POST(request: Request) {
  const { operator, error } = await authorizedV4Request(request);
  if (!operator) return error;
  const result = await operator.db.auth.signOut({scope: 'local'});
  if (result.error) return json({error:'Unable to sign out. Please retry.'}, 503);
  return json({signedOut: true});
}
