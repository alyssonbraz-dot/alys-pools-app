import {redirect} from 'next/navigation';
import {requireOperator} from '@/lib/auth';
import {LegacyReview} from '@/components/legacy-review';
export default async function Legacy(){const {profile}=await requireOperator();if(profile.role!=='owner')redirect('/stops');return <LegacyReview/>;}
