import {requireManager} from '@/lib/auth';
import {CustomerManager} from '@/components/customer-manager';
export default async function Customers(){await requireManager();return <CustomerManager/>;}
