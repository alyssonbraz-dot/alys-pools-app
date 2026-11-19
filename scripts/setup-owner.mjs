import {createClient} from '@supabase/supabase-js';
const argument=name=>process.argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3);
const envFile=argument('env-file')??'.env.production.local';
try{process.loadEnvFile(envFile);}catch{/* Secure process environment also supported. */}
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const host=argument('project-host'),email=argument('email'),password=process.env.ALYS_INITIAL_OWNER_PASSWORD;
const company=argument('company')??'ALYS Pool Services LLC',displayName=argument('name')??'ALYS Owner';
if(!url||!key||!host||new URL(url).hostname!==host)throw new Error('Supply --project-host=<exact Supabase hostname> and server-only project credentials. No account was changed.');
if(!email||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!password||password.length<16)throw new Error('Supply --email=<your email> and ALYS_INITIAL_OWNER_PASSWORD with at least16 characters in a secure environment.');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
let user;
for(let page=1;;page++){const {data,error}=await db.auth.admin.listUsers({page,perPage:1000});if(error)throw new Error('Cannot read Auth users. Check the server-only project key.');user=data.users.find(u=>u.email?.toLowerCase()===email.toLowerCase());if(user||data.users.length<1000)break;}
const existing=!!user;
// Initial provisioning must never guess which existing organization an account belongs to.
// Recovery uses an exact existing organization UUID via the audited staging SQL instead.
const {data:profile,error:profileError}=user?await db.from('profiles').select('organization_id,role,access_state').eq('id',user.id).maybeSingle():{data:null,error:null};
if(profileError)throw new Error('Cannot verify owner profile. Check schema migrations and project configuration; no setup was attempted.');
if(profile&&(profile.role!=='owner'||profile.access_state!=='active'))throw new Error('Existing membership is not an active Owner. Use the documented authorized recovery or invitation flow; no membership was changed.');
if(!profile){const {data:organizations,error}=await db.from('organizations').select('id').eq('name',company.trim()).limit(1);if(error)throw new Error('Cannot inspect organizations. No setup was attempted.');if(organizations.length)throw new Error('A matching organization already exists. Use docs/v4/OWNER-ACCESS.md with its exact UUID; initial setup will not create a duplicate organization or grant access to it.');}
if(!user){const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true});if(error||!data.user)throw new Error('Owner Auth creation failed. No email was sent.');user=data.user;}
const {error}=await db.rpc('bootstrap_owner',{p_owner:user.id,p_company:company,p_display_name:displayName});
if(error)throw new Error('Organization setup failed. Apply migrations through013 and verify that the account has no conflicting membership. The Auth account is retained so setup can resume.');
console.log(existing?'Owner membership ready. The existing password was preserved.':'Owner account and organization ready. Use the password supplied in your secure environment.');
console.log('No customer, property or demo visit was inserted; no invitation or email was sent. Remove ALYS_INITIAL_OWNER_PASSWORD from the environment after provisioning.');
