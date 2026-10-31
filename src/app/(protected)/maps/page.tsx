import {requireOperator} from '@/lib/auth';
import {FieldApp} from '@/components/field/field-app';
export default async function Maps({searchParams}:{searchParams:Promise<{date?:string}>}){const op=await requireOperator();const {date}=await searchParams;return <FieldApp mapMode startInList initialDate={date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date:undefined} initialTechnician={op.profile.role==='technician'?op.user.id:undefined} expectedRole={op.profile.role} expectedScope={{userId:op.user.id,organizationId:op.profile.organization_id}}/>;}
