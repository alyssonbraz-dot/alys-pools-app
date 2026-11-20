// Creates routes only in the standalone development project on loopback.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const workdir = fileURLToPath(new URL('.', import.meta.url));
const cloudCli = '/workspace/.alys-tools/node_modules/.bin/supabase';
const cli = process.env.SUPABASE_CLI || (existsSync(cloudCli) ? cloudCli : 'supabase');
const config = JSON.parse(execFileSync(cli, ['status', '-o', 'json'], {
  cwd: workdir, encoding: 'utf8',
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
}));
if (config.API_URL !== 'http://127.0.0.1:55321') throw new Error('Expected the local V4 project on port 55321.');
const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, authOptions);
const technician = createClient(config.API_URL, config.PUBLISHABLE_KEY, authOptions);
const path = join(tmpdir(), 'alys-v4-fixture.json');
let fixture = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
function writeFixture() {
  const tmp = path + '.' + randomUUID();
  writeFileSync(tmp, JSON.stringify(fixture), { mode: 0o600, flag: 'wx' });
  renameSync(tmp, path);
}
async function must(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}
if (fixture) {
  const { error } = await admin.auth.admin.getUserById(fixture.userId);
  if (error?.status === 404) fixture = null;
  else if (error) throw new Error(error.message);
}
if (!fixture) {
  const email = 'v4-' + randomUUID() + '@example.test';
  const password = randomUUID() + '!v4A';
  const { user } = await must(admin.auth.admin.createUser({ email, password, email_confirm: true }));
  fixture = { email, password, userId: user.id, orgId: randomUUID() };
  writeFixture();
}
await must(admin.from('organizations').upsert({ id: fixture.orgId, name: 'Atlantic Demo Pool Care' }, {ignoreDuplicates:true}));
await must(admin.from('profiles').upsert({
  id: fixture.userId, organization_id: fixture.orgId, role: 'owner', display_name: 'Alex Morgan',
}, {ignoreDuplicates:true}));
await must(technician.auth.signInWithPassword({ email: fixture.email, password: fixture.password }));
function id(key) {
  const hex = createHash('sha256').update(fixture.orgId + '/' + key).digest('hex');
  return [hex.slice(0,8), hex.slice(8,12), '4'+hex.slice(13,16), 'a'+hex.slice(17,20), hex.slice(20,32)].join('-');
}
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
function shift(day, n) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0,10);
}
const sites = [
  {name:'Coral House', street:'18 Coral View Lane', lat:26.157, lng:-80.105, spa:false},
  {name:'Bayview Residence', street:'42 Bayview Terrace', lat:26.173, lng:-80.114, spa:true},
  {name:'Palm Court', street:'7 Palm Court', lat:26.185, lng:-80.109, spa:false},
];
for (const [i, site] of sites.entries()) {
  const siteId = id('site/'+i);
  await must(admin.from('service_sites').upsert({
    id:siteId, organization_id:fixture.orgId, customer:site.name,
    address:site.street+', Fort Lauderdale, FL', latitude:site.lat, longitude:site.lng,
  }, {ignoreDuplicates:true}));
  const bodies = (site.spa ? ['pool','spa'] : ['pool']).map(kind => ({
    id:id('body/'+i+'/'+kind), site_id:siteId, kind, name:kind==='pool'?'Pool':'Spa',
    gallons:kind==='pool'?14000+i*2000:750, equipment:kind==='pool'?['Cartridge filter','Variable-speed pump']:['Spa heater'],
  }));
  await must(admin.from('water_bodies').upsert(bodies,{ignoreDuplicates:true}));
  for (const offset of [-28,-21,-14,-7,0,1]) {
    const day = shift(today,offset);
    const stopId = id('stop/'+i+'/'+day);
    await must(admin.from('route_stops').upsert({
      id:stopId, organization_id:fixture.orgId, technician_id:fixture.userId, site_id:siteId,
      service_day:day, position:i+1, default_position:i+1,
    },{ignoreDuplicates:true}));
    if (offset > 0 || (offset === 0 && i !== 0)) continue;
    const {data:already,error} = await admin.from('visits').select('id').eq('stop_id',stopId).maybeSingle();
    if (error) throw new Error(error.message);
    if (already) continue;
    await must(technician.rpc('v4_complete',{ p_visit: {
      id:id('visit/'+stopId), stopId, date:day, notes:'Water clear. Basket cleaned.',
      bodies:bodies.map(b=>({bodyId:b.id,ph:7.4,fc:offset===-7?2.5:3,alkalinity:90,
        tasks:['Brush walls'], chemicals:[]})),
    } }));
  }
}
fixture.date=today;
fixture.stopIds=sites.map((_,i)=>id('stop/'+i+'/'+today));
writeFixture();
console.log('Fictional V4 route ready. Private local login file: '+path);
