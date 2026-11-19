import 'server-only';
import { redirect } from 'next/navigation';
import { supabase } from './supabase/server';
import { supabaseConfig } from './supabase/config';
export async function getOperatorAccess() {
  if (!supabaseConfig()) return {status:'setup'} as const;
  const db=await supabase();
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user)return {status:'signin'} as const;
  const {data:profile,error:profileError}=await db.from('profiles').select('organization_id,role,display_name,access_state').eq('id',user.id).maybeSingle();
  // Missing migrations, missing SELECT grants and RLS errors are not missing membership.
  if(profileError)return {status:'accesscheck'} as const;
  if(!profile||!profile.organization_id)return {status:'membership'} as const;
  if(profile.access_state!=='active')return {status:'inactive'} as const;
  if(!['owner','admin','technician'].includes(profile.role))return {status:'membership'} as const;
  return {status:'authorized',operator:{db,user,profile}} as const;
}
export async function getOperator() {
 const access=await getOperatorAccess();
 return access.status==='authorized'?access.operator:null;
}
export async function requireOperator() {
 const access=await getOperatorAccess();
 if(access.status!=='authorized')redirect('/login?message='+access.status);
 return access.operator;
}
export async function requireManager() {
 const operator=await requireOperator();
 if(!['owner','admin'].includes(operator.profile.role))redirect('/?message=manager');
 return operator;
}
