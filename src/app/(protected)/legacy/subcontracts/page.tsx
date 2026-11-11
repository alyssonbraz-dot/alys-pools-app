import {redirect} from 'next/navigation';
import {requireOperator} from '@/lib/auth';
import {CustomerManager} from '@/components/customer-manager';
import {FieldApp} from '@/components/field/field-app';
import {T} from '@/components/i18n';
export default async function LegacySubcontracts(){const {profile,user}=await requireOperator();if(profile.role!=='owner')redirect('/stops');return <><CustomerManager legacyOnly/><details className="business-details"><summary><T text="Existing outside-work routes"/></summary><FieldApp legacyMode initialTechnician="all" expectedRole={profile.role} expectedScope={{userId:user.id,organizationId:profile.organization_id}}/></details></>;}
