import {MobileDashboard} from '@/components/mobile/dashboard';
import {FieldApp} from '@/components/field/field-app';
import {requireOperator} from '@/lib/auth';
import {serviceDay} from '@/lib/service-time';
import {loadBusiness} from '@/lib/business/server';
export default async function Home({searchParams}:{searchParams:Promise<{date?:string}>}){const {user,profile,db}=await requireOperator();const {date}=await searchParams;const {data:prefs}=await db.rpc('operator_preferences');const scope={userId:user.id,organizationId:profile.organization_id};if(profile.role!=='owner')return <FieldApp currentMode={profile.role==='technician'} startInList initialTimeZone={prefs?.timeZone} daily={profile.role==='technician'} expectedRole={profile.role} expectedScope={scope} initialDate={date}/>;
 const day=serviceDay(new Date(),prefs?.timeZone),month=day.slice(0,7);const [{data:overview},business]=await Promise.all([db.rpc('owner_overview'),loadBusiness(db,month,user.id).catch(()=>null)]);
 return <MobileDashboard name={profile.display_name} date={day} timeZone={prefs?.timeZone??'America/New_York'} scope={scope} business={business?.report} businessError={!business} pendingReports={(overview?.pending_reports??0)+(overview?.failed_reports??0)}/>;
}
