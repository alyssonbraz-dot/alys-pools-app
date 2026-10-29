import { FieldApp } from '@/components/field/field-app';
import { requireOperator } from '@/lib/auth';
export default async function VisitPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{date?:string;view?:string}>}) {
  const [{id},{date,view}]=await Promise.all([params,searchParams]);
  const {user,profile,db}=await requireOperator();
  const {data:record}=await db.from('route_stops').select('properties(service_timezone)').eq('id',id).maybeSingle();const property=Array.isArray(record?.properties)?record.properties[0]:record?.properties;
  return <FieldApp initialTimeZone={property?.service_timezone} expectedRole={profile.role} daily={view==='stops'} expectedScope={{userId:user.id,organizationId:profile.organization_id}} initialStopId={id} initialDate={date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date:undefined}/>;
}
