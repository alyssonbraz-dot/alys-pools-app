import {floridaDay} from '@/lib/field/types';
import { FieldApp } from '@/components/field/field-app';
import { requireOperator } from '@/lib/auth';
export default async function VisitPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{date?:string;view?:string}>}) {
  const [{id},{date,view}]=await Promise.all([params,searchParams]);
  const {user,profile}=await requireOperator();
  return <FieldApp expectedRole={profile.role} daily={view==='stops'&&date===floridaDay()} expectedScope={{userId:user.id,organizationId:profile.organization_id}} initialStopId={id} initialDate={date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date:undefined}/>;
}
