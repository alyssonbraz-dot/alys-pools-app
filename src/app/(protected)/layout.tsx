import { requireOperator } from '@/lib/auth';
import { Shell } from '@/components/shell';
export const dynamic='force-dynamic';
export default async function Protected({children}:{children:React.ReactNode}) {const {profile,db}=await requireOperator();const {data:prefs}=await db.rpc('operator_preferences');return <Shell demo={prefs?.demo===true} name={profile.display_name} role={profile.role}>{children}</Shell>;}
