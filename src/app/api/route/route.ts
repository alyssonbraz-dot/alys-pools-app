import { getOperator } from '@/lib/auth';
import { daySchema } from '@/lib/field/validation';
import { floridaDay } from '@/lib/field/types';
import { loadRoute } from '@/lib/field/data';
import { apiError,json } from '@/lib/http';
export async function GET(request:Request) {
 try {
  const operator=await getOperator();if(!operator)return json({error:'Please sign in.'},401);
  const date=daySchema.parse(new URL(request.url).searchParams.get('date')??floridaDay());
  return json(await loadRoute(operator,date));
 }catch(error){return apiError(error);}
}
