import {redirect} from 'next/navigation';
import {requireManager} from '@/lib/auth';
// Preserve old bookmarks while keeping all property/pool management in Customers.
export default async function LegacyCustomerManagement(){await requireManager();redirect('/customers');}
