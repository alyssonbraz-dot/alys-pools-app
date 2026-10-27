import { FieldApp } from '@/components/field/field-app';
import { requireOperator } from '@/lib/auth';
export default async function RoutePage({searchParams}:{searchParams:Promise<{date?:string}>}) {
  const {date}=await searchParams;
  const {user,profile}=await requireOperator();
  return <FieldApp expectedRole={profile.role} expectedScope={{userId:user.id,organizationId:profile.organization_id}} initialDate={date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date:undefined}/>;
}
