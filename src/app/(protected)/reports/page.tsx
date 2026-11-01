import {requireOperator} from '@/lib/auth';
import {History} from '@/components/field/history';
export default async function Reports(){await requireOperator();return <History reports/>;}
