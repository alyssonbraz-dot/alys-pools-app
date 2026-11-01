import {redirect} from 'next/navigation';
import {requireOperator} from '@/lib/auth';
import {ContributionScreen} from '@/components/business/contribution-screen';
export default async function Finance(){const {profile}=await requireOperator();if(profile.role!=='owner')redirect('/stops');return <ContributionScreen/>;}
