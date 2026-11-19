import {requireOperator} from '@/lib/auth';
import {MoreScreen} from '@/components/v4/more-screen';
export default async function More(){const {user,profile}=await requireOperator();return <MoreScreen role={profile.role} scope={{userId:user.id,organizationId:profile.organization_id}}/>;}
