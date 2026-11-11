import {redirect} from 'next/navigation';
import {requireOperator} from '@/lib/auth';
import {ContributionScreen} from '@/components/business/contribution-screen';
export default async function Pool({params}:{params:Promise<{id:string}>}){const {profile}=await requireOperator();if(profile.role!=='owner')redirect('/stops');const {id}=await params;return <ContributionScreen poolId={id}/>;}
