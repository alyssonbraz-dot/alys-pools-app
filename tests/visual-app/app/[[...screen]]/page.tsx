import {cookies} from 'next/headers';
import {ReviewScreen} from '../../../v4/review-screen';
export default async function Page({params,searchParams}:{params:Promise<{screen?:string[]}>;searchParams:Promise<{role?:string}>}){const [{screen},query]=await Promise.all([params,searchParams]);return <ReviewScreen screen={screen?.[0]??'home'} stopId={screen?.[1]} role={query.role??(await cookies()).get('v4-review-role')?.value??'owner'}/>;}
