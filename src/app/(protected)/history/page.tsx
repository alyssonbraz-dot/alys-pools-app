import {History} from '@/components/field/history';
import {z} from 'zod';
export default async function HistoryPage({searchParams}:{searchParams:Promise<{customer_id?:string}>}){const {customer_id}=await searchParams;return <History customerId={z.uuid().safeParse(customer_id).success?customer_id:undefined}/>;}
