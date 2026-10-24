import { login } from '@/app/actions';
import { LogoutButton } from '@/components/logout-button';
import { supabaseConfig } from '@/lib/supabase/config';
import { Field } from '@/components/ui';
export default async function Login({searchParams}:{searchParams:Promise<{message?:string}>}) {
 const {message}=await searchParams;const configured=!!supabaseConfig();
 const messages:Record<string,string>={invalid:'Invalid email or password. Please try again.',membership:'Your account needs an organization role. Ask your administrator to grant access.',setup:'Configure Supabase to continue.'};
 return <main className="panel login-card"><div className="page-kicker">ALYS POOL SERVICES</div><h1>Ready for your route?</h1><p>Sign in to service your pools.</p>{message&&messages[message]&&<p role="alert" className="notice">{messages[message]}</p>}{configured?<><form action={login}><Field name="email" label="Email" type="email" required/><label className="form-field">Password<input name="password" type="password" autoComplete="current-password" required maxLength={128}/></label><button className="btn btn-primary">Sign in</button></form>{message==='membership'&&<LogoutButton/>}</>:<p className="notice">Setup required: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local. Follow the README to run the local backend.</p>}</main>;
}
