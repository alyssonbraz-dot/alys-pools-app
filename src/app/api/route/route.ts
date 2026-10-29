import { getOperator } from '@/lib/auth';
import { daySchema } from '@/lib/field/validation';
import {serviceDay,validTimeZone} from '@/lib/service-time';
import { loadRoute } from '@/lib/field/data';
import { apiError,json } from '@/lib/http';
export async function GET(request:Request) {
 try {
  const operator=await getOperator();if(!operator)return json({error:'Please sign in.'},401);
  const params=new URL(request.url).searchParams;const zone=params.get('timezone')??undefined;if(zone&&!validTimeZone(zone))return json({error:'Invalid service timezone.'},422);
  const date=daySchema.parse(params.get('date')??serviceDay(new Date(),zone));
  return json(await loadRoute(operator,date,zone));
 }catch(error){return apiError(error);}
}
