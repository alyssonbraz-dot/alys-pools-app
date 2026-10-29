import {validTimeZone} from '@/lib/service-time';
import {FieldApp} from '@/components/field/field-app';
import {requireOperator} from '@/lib/auth';
export default async function DailyStops({searchParams}:{searchParams:Promise<{date?:string;timezone?:string}>}){
 const {date,timezone}=await searchParams;
 const {user,profile,db}=await requireOperator();
 const {data:prefs}=await db.rpc('operator_preferences');
 return <FieldApp initialDate={date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date:undefined} initialTimeZone={timezone&&validTimeZone(timezone)?timezone:prefs?.timeZone} expectedRole={profile.role} daily expectedScope={{userId:user.id,organizationId:profile.organization_id}}/>;
}
