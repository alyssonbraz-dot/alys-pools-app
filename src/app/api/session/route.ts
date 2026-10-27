import {getOperator} from '@/lib/auth';
import {json} from '@/lib/http';
/** Lightweight identity check for the outbox; never regenerate routes just to upload a photo. */
export async function GET(){
 const operator=await getOperator();if(!operator)return json({error:'Please sign in.'},401);
 return json({userId:operator.user.id,orgId:operator.profile.organization_id,role:operator.profile.role});
}
