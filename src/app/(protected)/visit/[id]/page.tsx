import { FieldApp } from '@/components/field/field-app';
import { requireOperator } from '@/lib/auth';
export default async function VisitPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{date?:string}>}) {
  const [{id},{date}]=await Promise.all([params,searchParams]);
  const {user,profile}=await requireOperator();
  return <FieldApp expectedScope={{userId:user.id,organizationId:profile.organization_id}} initialStopId={id} initialDate={date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date:undefined}/>;
}
