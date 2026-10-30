import {requireManager} from '@/lib/auth';
import {History} from '@/components/field/history';
export default async function Reports(){await requireManager();return <History reports/>;}
