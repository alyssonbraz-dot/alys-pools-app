import {requireOperator} from '@/lib/auth';
import {IssueLog} from '@/components/v4/issue-log';
export default async function Issues({searchParams}:{searchParams:Promise<{customer?:string}>}){await requireOperator();const {customer}=await searchParams;return <IssueLog key={customer??'all'} customerId={customer}/>;}
