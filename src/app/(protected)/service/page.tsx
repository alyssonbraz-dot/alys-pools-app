import {requireOperator} from '@/lib/auth';
import {FieldApp} from '@/components/field/field-app';
import {validTimeZone} from '@/lib/service-time';
export default async function CurrentService({searchParams}:{searchParams:Promise<{date?:string;timezone?:string}>}){const {user,profile,db}=await requireOperator();const {date,timezone}=await searchParams;const {data:prefs}=await db.rpc('operator_preferences');return <FieldApp daily currentMode initialDate={date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date:undefined} initialTimeZone={timezone&&validTimeZone(timezone)?timezone:prefs?.timeZone} expectedScope={{userId:user.id,organizationId:profile.organization_id}} expectedRole={profile.role}/>;}
