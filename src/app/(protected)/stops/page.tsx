import {FieldApp} from '@/components/field/field-app';
import {requireOperator} from '@/lib/auth';
export default async function DailyStops(){
 const {user,profile}=await requireOperator();
 return <FieldApp daily expectedScope={{userId:user.id,organizationId:profile.organization_id}}/>;
}
