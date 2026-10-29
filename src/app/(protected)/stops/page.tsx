import {FieldApp} from '@/components/field/field-app';
import {requireOperator} from '@/lib/auth';
export default async function DailyStops(){
 const {user,profile,db}=await requireOperator();
 const {data:prefs}=await db.rpc('operator_preferences');
 return <FieldApp initialTimeZone={prefs?.timeZone} expectedRole={profile.role} daily expectedScope={{userId:user.id,organizationId:profile.organization_id}}/>;
}
