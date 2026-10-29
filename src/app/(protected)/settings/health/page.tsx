import {redirect} from 'next/navigation';
import {requireOperator} from '@/lib/auth';
import {SystemHealth} from '@/components/system-health';
export default async function Health(){const {user,profile}=await requireOperator();if(profile.role!=='owner')redirect('/stops');return <SystemHealth scope={{userId:user.id,organizationId:profile.organization_id}}/>;}
