import {createClient} from '@supabase/supabase-js';
import {getOperator} from '@/lib/auth';
import {apiError,boundedJson,json,sameOrigin} from '@/lib/http';
import {teamCredentialsSchema} from '@/lib/team/credentials';
import {administration} from '@/lib/team/server';
import {supabaseConfig} from '@/lib/supabase/config';

export async function POST(request:Request) {
 if(!sameOrigin(request))return json({error:'Invalid origin.'},403);
 try {
  const op=await getOperator();
  if(!op||op.profile.role!=='owner')return json({error:'Owner access required.'},403);
  const input=teamCredentialsSchema.parse(await boundedJson(request,3000));
  // The user's RLS session scopes the target before any privileged Auth call.
  const {data:target,error:targetError}=await op.db.from('profiles').select('id,role,access_state').eq('id',input.id).eq('organization_id',op.profile.organization_id).eq('role','technician').maybeSingle();
  if(targetError||!target||target.access_state==='invited')return json({error:'Only accepted technician accounts in your organization can be edited.'},403);
  const config=supabaseConfig();
  if(!config||!op.user.email)return json({error:'Please sign in again.'},401);
  // A separate, non-persistent Auth client avoids replacing the Owner's cookies.
  const verifier=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data:verified,error:verificationError}=await verifier.auth.signInWithPassword({email:op.user.email,password:input.current_password});
  if(verificationError||verified.user?.id!==op.user.id)return json({error:'Current password is incorrect.'},403);
  // Do not leave a second long-lived Owner session after reauthentication.
  await verifier.auth.signOut({scope:'local'});
  const current=await getOperator();
  if(!current||current.user.id!==op.user.id||current.profile.role!=='owner'||current.profile.organization_id!==op.profile.organization_id)return json({error:'Owner access required.'},403);
  const admin=administration();
  const {data:fresh,error:freshError}=await admin.from('profiles').select('id').eq('id',input.id).eq('organization_id',op.profile.organization_id).eq('role','technician').neq('access_state','invited').maybeSingle();
  if(freshError||!fresh)return json({error:'Only accepted technician accounts in your organization can be edited.'},403);
  const audit={organization_id:op.profile.organization_id,actor_id:op.user.id,entity:'team_credentials',record_id:input.id,new_data:{email_changed:input.email!==undefined,password_reset:input.password!==undefined}};
  // Never store passwords, hashes, submitted emails or Auth responses in audit logs.
  const {error:auditError}=await admin.from('audit_log').insert({...audit,operation:'REQUESTED'});
  if(auditError)return json({error:'Account was not changed. Check server administration and retry.'},503);
  const {error}=await admin.auth.admin.updateUserById(input.id,{...(input.email?{email:input.email,email_confirm:true}:{}),...(input.password?{password:input.password}:{})});
  const {error:recordError}=await admin.from('audit_log').insert({...audit,operation:error?'FAILED':'UPDATED'});
  if(error)return json({error:'Login was not changed. Check the email, password policy and server administration.'},422);
  return json({ok:true,audit_pending:!!recordError});
 }catch(error){return apiError(error);}
}
