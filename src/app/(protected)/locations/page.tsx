import {redirect} from 'next/navigation';
import {requireOperator} from '@/lib/auth';
import {LocationReview} from '@/components/location-review';
export default async function Locations(){const {profile}=await requireOperator();if(profile.role!=='owner')redirect('/stops');return <LocationReview/>;}
