// Dry run by default. Never print keys, paths, names or other customer data.
import {createClient} from '@supabase/supabase-js';
try{process.loadEnvFile('.env.local');}catch{/* Environment injection is supported. */}
const org=process.argv.find(a=>a.startsWith('--organization='))?.split('=')[1];
if(!org||!/^[0-9a-f-]{36}$/i.test(org))throw new Error('Supply --organization=<uuid>; add --apply only after reviewing a dry run.');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error('Configure server-only Supabase credentials.');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const {data,error}=await db.rpc('unused_photo_uploads',{p_org:org});if(error)throw new Error('Candidate query failed. Check migrations and service permissions.');
console.log(`Unused uploads eligible after14 days at closed stops: ${data.length}.`);
if(!process.argv.includes('--apply')){console.log('Dry run; no files or records changed.');process.exit(0);}
let removed=0;
for(const entry of data){const {error:storageError}=await db.storage.from('visit-photos').remove([entry.path]);if(storageError)throw new Error('Storage cleanup failed; reservations retained.');const {error:releaseError}=await db.rpc('release_unused_photo',{p_stop:entry.stop_id,p_photo:entry.photo_id});if(releaseError)throw new Error('File removed but budget release failed; rerun safely.');removed++;}
console.log(`Released unused upload reservations: ${removed}.`);
