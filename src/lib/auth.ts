import 'server-only';
import { redirect } from 'next/navigation';
import { supabase } from './supabase/server';
import { supabaseConfig } from './supabase/config';
export async function getOperator() {
  if (!supabaseConfig()) return null;
  const db=await supabase();
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user)return null;
  const {data:profile}=await db.from('profiles').select('organization_id,role,display_name,access_state').eq('id',user.id).single();
  if(!profile||profile.access_state!=='active'||!['owner','admin','technician'].includes(profile.role))return null;
  return {db,user,profile};
}
export async function requireOperator() {
 if(!supabaseConfig())redirect('/login?message=setup');
 const operator=await getOperator();
 if(!operator)redirect('/login?message=membership');
 return operator;
}
export async function requireManager() {
 const operator=await requireOperator();
 if(!['owner','admin'].includes(operator.profile.role))redirect('/?message=manager');
 return operator;
}
