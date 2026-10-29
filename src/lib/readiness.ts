import {z} from 'zod';
export function applicationOrigin(env:Record<string,string|undefined>=process.env){try{const value=env.APP_URL||env.URL;if(!value)return null;const u=new URL(value);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))))return null;return u.origin;}catch{return null;}}
/** Return variable names only. Never return credential values or provider errors. */
export function invitationReadiness(env:Record<string,string|undefined>=process.env){
 const issues:string[]=[];
 if(env.TEAM_INVITES_ENABLED!=='true')issues.push('TEAM_INVITES_ENABLED');
 for(const key of ['SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY'])if(!env[key]||env[key]!.startsWith('replace-'))issues.push(key);
 if(!z.url().safeParse(env.NEXT_PUBLIC_SUPABASE_URL).success)issues.push('NEXT_PUBLIC_SUPABASE_URL');
 const from=env.EMAIL_FROM??'',address=from.match(/<([^<>]+)>$/)?.[1]??from;
 if(/[\r\n]/.test(from)||!z.email().safeParse(address).success)issues.push('EMAIL_FROM');
 if(env.EMAIL_REPLY_TO&&!z.email().safeParse(env.EMAIL_REPLY_TO).success)issues.push('EMAIL_REPLY_TO');
 if(!applicationOrigin(env))issues.push('APP_URL');
 return {ready:!issues.length,issues};
}
