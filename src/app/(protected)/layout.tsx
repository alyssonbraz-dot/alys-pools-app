import { requireOperator } from '@/lib/auth';
import { Shell } from '@/components/shell';
export const dynamic='force-dynamic';
export default async function Protected({children}:{children:React.ReactNode}) {const {profile}=await requireOperator();return <Shell name={profile.display_name}>{children}</Shell>;}
