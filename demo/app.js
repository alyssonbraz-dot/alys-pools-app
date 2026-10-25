/* ALYS standalone demonstration. Fictional records only; no authentication or network services. */
(() => {
 'use strict';
 const TASKS=['Skim Surface','Brush Pool','Vacuum Pool','Empty Skimmer Basket','Empty Pump Basket','Check Equipment','Test Water','Add Chemicals'];
 const READINGS={fc:['Free Chlorine',30,'ppm'],ph:['pH',14,''],ta:['Total Alkalinity',500,'ppm'],cya:['Cyanuric Acid',1000,'ppm'],ch:['Calcium Hardness',5000,'ppm'],salt:['Salt',10000,'ppm'],cc:['Combined Chlorine',30,'ppm'],tc:['Total Chlorine',30,'ppm'],temperature_f:['Water temperature',140,'°F']};
 const PRODUCTS={'Liquid Chlorine':['gal','fl oz'],'Muriatic Acid':['fl oz'],'Sodium Bicarbonate':['lb'],'Calcium Chloride':['lb'],'Stabilizer':['lb'],'Salt':['lb'],'Chlorine Tablets':['units'],'Shock':['lb'],'Other':['custom']};
 const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 const app=document.querySelector('#app'),modal=document.querySelector('#modal'),savedLabel=document.querySelector('#save-state');
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const uid=()=>globalThis.crypto?.randomUUID?.()??`demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const dayPlus=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const dateLabel=value=>new Intl.DateTimeFormat(languageTag(),{timeZone:'America/New_York',month:'short',day:'numeric'}).format(new Date(value.length===10?value+'T12:00:00Z':value));
 const clone=v=>JSON.parse(JSON.stringify(v));
 const button=(action,label,extra='',secondary=false)=>`<button type="button" class="button ${secondary?'secondary':''}" data-action="${action}" ${extra}>${label}</button>`;
 const field=(name,label,value='',type='text',extra='')=>`<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
 let db,storage=null,saveTimer,saveChain=Promise.resolve(),photoBusy=false,saveSequence=0;
 let customerSearch='',customerStatus='all',customerTag='',customerSort='name',selectedCustomers=[];
 const dictionaries=window.ALYS_DEMO_MESSAGES;
 const language=()=>db?.language==='pt'?'pt':db?.language==='es'?'es':'en';
 const languageTag=()=>({en:'en-US',pt:'pt-BR',es:'es-US'})[language()];
 function tr(text){
  if(language()==='en')return String(text);
  const original=String(text),raw=original.trim(),catalog=dictionaries[language()];let result=catalog[raw];
  if(!result)for(const [key,value] of Object.entries(catalog)){
   if(!key.includes('{'))continue;
   const names=[];let source='',cursor=0;
   const escaped=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   for(const match of key.matchAll(/\{(\w+)\}/g)){source+=escaped(key.slice(cursor,match.index))+'(.+?)';names.push(match[1]);cursor=match.index+match[0].length;}
   const match=raw.match(new RegExp('^'+source+escaped(key.slice(cursor))+'$'));
   if(match){result=value.replace(/\{(\w+)\}/g,(_,name)=>match[names.indexOf(name)+1]);break;}
  }
  return result?original.replace(raw,()=>result):original;
 }
 function trAttribute(text){const result=tr(text);if(result!==text||language()==='en')return result;for(const key of Object.keys(dictionaries[language()]).filter(k=>!k.includes('{')).sort((a,b)=>b.length-a.length))if(text.endsWith(' '+key))return text.slice(0,-key.length)+dictionaries[language()][key];return text;}
 function localizeHTML(html){
  const template=document.createElement('template');template.innerHTML=html;
  // Default values of native options must remain English identifiers.
  for(const option of template.content.querySelectorAll('option:not([value])'))option.value=option.textContent;
  const walker=document.createTreeWalker(template.content,NodeFilter.SHOW_TEXT);const nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){if(node.parentElement?.closest('[data-original],script,style'))continue;node.textContent=tr(node.textContent);}
  for(const el of template.content.querySelectorAll('[placeholder],[aria-label],img[alt]'))for(const attr of ['placeholder','aria-label','alt'])if(el.hasAttribute(attr))el.setAttribute(attr,trAttribute(el.getAttribute(attr)));
  return template.innerHTML;
 }
 function setSaveStatus(text){savedLabel.dataset.message=text;savedLabel.textContent=tr(text);}
 function applyLanguage(){
  document.documentElement.lang=languageTag();const select=document.querySelector('#language-select');select.value=language();select.setAttribute('aria-label',tr('Language'));select.previousElementSibling.textContent=tr('Language');
  const banner=document.querySelector('.demo-banner');banner.textContent=tr('Demo only · Fictional data · Saved in this browser · No login, cloud sync or email sending');
  document.querySelector('#close-modal').setAttribute('aria-label',tr('Close dialog'));
  for(const a of document.querySelectorAll('#nav a')){const original={route:'Route',clients:'Clients',history:'History',settings:'Settings'}[a.hash.slice(1)];a.querySelector('span').textContent=tr(original);a.setAttribute('aria-label',tr(original));}
  if(savedLabel.dataset.message)setSaveStatus(savedLabel.dataset.message);
 }
 function toast(text){const el=document.querySelector('#toast');el.textContent=tr(text);el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>{el.hidden=true;},4000);}
 function pool(name,gallons=15000){return {id:uid(),name,gallons,water_type:'chlorine',checklist:[...TASKS],required_readings:['fc','ph'],photo_required:false};}
 function seed(){
  const clients=[['Demo Residence 01','Fort Lauderdale, FL — fictional'],['Demo Residence 02','Pompano Beach, FL — fictional'],['Demo Condo 03','Boca Raton, FL — fictional'],['Demo Residence 04','Deerfield Beach, FL — fictional']].map(([name,address],i)=>({id:uid(),name,property_name:name,address,email:`demo${i+1}@example.test`,phone:'',gate_notes:i===0?'Fictional access note — never included in the report.':'',active:true,days:[0,1,2,3,4,5,6],pools:[pool(i===2?'Condo pool':'Main pool',i===2?30000:15000)]}));
  clients[2].pools.push(pool('Spa',1200));
  const data={version:1,clients,stops:[],visits:[],drafts:{},date:today()};
  for(const c of clients)for(const [i,daysAgo] of [7,14,21,28].entries()){
   const day=dayPlus(today(),-daysAgo);
   data.visits.push({id:uid(),stop_id:'seed-'+uid(),client_id:c.id,property_name:c.property_name,customer_name:c.name,completed_at:day+'T16:00:00Z',pools:c.pools.map(p=>({pool_id:p.id,pool_name:p.name,tasks:['Skim Surface','Brush Pool','Test Water'],readings:{fc:[3,2.5,3.5,2][i],ph:[7.4,7.5,7.3,7.6][i],ta:90},dosages:[{product:'Liquid Chlorine',quantity:0.5,unit:'gal'},{product:'Muriatic Acid',quantity:8,unit:'fl oz'}]})),photos:[],notes:'Fictional previous service. No email was sent.'});
  }
  return data;
 }
 async function openStorage(){
  if(!('indexedDB' in window))throw Error('Storage unavailable');
  storage=await new Promise((resolve,reject)=>{const r=indexedDB.open('alys-standalone-demo-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('demo');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  return new Promise((resolve,reject)=>{const tx=storage.transaction('demo','readonly');const r=tx.objectStore('demo').get('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 }
 function saveNow(){
  clearTimeout(saveTimer);
  const sequence=++saveSequence;
  const snapshot=clone(db);
  if(!storage){setSaveStatus('Temporary mode — not saved');return Promise.resolve(false);}
  setSaveStatus('Saving on this device…');
  const operation=saveChain.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{const tx=storage.transaction('demo','readwrite');tx.objectStore('demo').put(snapshot,'state');tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error); }));
  saveChain=operation;
  return operation.then(()=>{if(sequence===saveSequence)setSaveStatus('Saved locally · no cloud sync');return true;}).catch(()=>{setSaveStatus('Not saved — storage full or blocked');toast('Storage could not save. Keep this page open or export your demo data.');return false;});
 }
 function saveSoon(){saveSequence++;setSaveStatus(storage?'Saving on this device…':'Temporary mode — not saved');clearTimeout(saveTimer);saveTimer=setTimeout(()=>void saveNow(),180);}
 function ensureDay(){
  const dow=new Date(db.date+'T12:00:00Z').getUTCDay();let order=0;
  for(const c of db.clients){if(!c.active||!c.days.includes(dow))continue;order++;if(!db.stops.some(s=>s.client_id===c.id&&s.date===db.date))db.stops.push({id:uid(),client_id:c.id,date:db.date,position:order,status:'pending'});}
 }
 function stops(){return db.stops.filter(s=>s.date===db.date).sort((a,b)=>a.position-b.position);}
 function client(id){return db.clients.find(c=>c.id===id);}
 function navigate(path){if(location.hash==='#'+path)render();else location.hash=path;}
 function currentPath(){return location.hash.slice(1)||'route';}
 function draftFor(stop){
  if(!db.drafts[stop.id]){const c=client(stop.client_id);db.drafts[stop.id]={id:uid(),stop_id:stop.id,started_at:new Date().toISOString(),pools:c.pools.map(p=>({pool_id:p.id,tasks:[],readings:{},dosages:[]})),photos:[],notes:''};saveSoon();}
  return db.drafts[stop.id];
 }
 function header(kicker,title,description=''){return `<div class="heading"><div class="kicker">${kicker}</div><h1 ${currentPath().startsWith('visit/')?'data-original':''}>${esc(title)}</h1><p class="sub">${esc(description)}</p></div>`;}
 function weekCalendar(){const monday=new Date(db.date+'T12:00:00Z');monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));return `<section class="route-calendar"><div class="between">${button('week-back','← Previous week','',true)}${button('date-today','Today','',true)}${button('week-next','Next week →','',true)}</div><div class="week-days">${Array.from({length:7},(_,i)=>{const date=dayPlus(monday.toISOString().slice(0,10),i);return `<button data-action="pick-day" data-value="${date}" class="${date===db.date?'selected':''}" aria-pressed="${date===db.date}"><span>${DAYS[new Date(date+'T12:00:00Z').getUTCDay()]}</span><strong>${Number(date.slice(8))}</strong></button>`;}).join('')}</div></section>`;}
 function routePage(){
  const list=stops(),done=list.filter(s=>s.status==='completed').length,left=list.filter(s=>!['completed','skipped'].includes(s.status)).length;
  const current=list.find(s=>!['completed','skipped'].includes(s.status));
  return `<div class="heading between"><div><div class="kicker">FAST ROUTE</div><h1>Today’s Route</h1><p class="sub">${new Intl.DateTimeFormat(languageTag(),{weekday:'long',month:'long',day:'numeric',timeZone:'America/New_York'}).format(new Date(db.date+'T12:00:00Z'))} · ${list.length} stops</p></div><label class="field">Service date<input type="date" class="date" id="route-date" value="${db.date}"></label></div><div class="hero"><span class="kicker" style="color:#deebfa">YOUR ROUTE, MADE SIMPLE</span><h2>Less tapping. More pool time.</h2><p>Try a visit with fictional data. Everything stays in this browser.</p></div>${weekCalendar()}<div class="progress" role="progressbar" aria-label="Completed stops" aria-valuemin="0" aria-valuemax="${list.length||1}" aria-valuenow="${done}"><span style="width:${list.length?done/list.length*100:0}%"></span></div><div class="stats"><strong>${done} / ${list.length} completed</strong><span>${left} remaining · local demo</span></div>${list.length?list.map((s,i)=>{const c=client(s.client_id);return `<article class="card ${s.id===current?.id?'current':''}"><div class="row"><span class="number">${i+1}</span><div class="grow"><h2 class="stop-title"><span data-original>${esc(c.property_name||c.name)}</span></h2><p class="muted"><span data-original>${esc(c.address)}</span></p><span class="tiny">${c.pools.length} pool${c.pools.length===1?'':'s'}</span></div><span class="badge ${s.status}">${({pending:'Pending',in_progress:'In progress',completed:'Completed',skipped:'Skipped'})[s.status]}</span></div><div class="actions">${s.status==='completed'?button('history','View service history','',true):s.status==='skipped'?button('unskip','Restore stop',`data-id="${s.id}"`,true):`<button class="button grow" data-action="start" data-id="${s.id}">${s.status==='in_progress'?'Continue service →':'Start service →'}</button>${button('skip','Skip stop',`data-id="${s.id}"`,true)}`}<button class="quiet" data-action="up" data-id="${s.id}" aria-label="Move ${esc(c.property_name)} up" ${i===0?'disabled':''}>↑</button><button class="quiet" data-action="down" data-id="${s.id}" aria-label="Move ${esc(c.property_name)} down" ${i===list.length-1?'disabled':''}>↓</button></div></article>`;}).join(''):'<div class="card empty">No service days match this date. Add a client or choose another day.</div>'}`;
 }
 function chemistry(p){
  const from=dayPlus(db.date,-29);
  const rows=db.visits.filter(v=>{const d=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v.completed_at));return d>=from&&d<=db.date&&v.pools.some(x=>x.pool_id===p.id);}).sort((a,b)=>b.completed_at.localeCompare(a.completed_at));
  const entry=v=>{const r=v.pools.find(x=>x.pool_id===p.id);return `<div class="chem-entry"><time>${dateLabel(v.completed_at)}</time><div><p>${Object.entries(r.readings).map(([k,n])=>`<span><strong>${esc(k==='ph'?'pH':k.toUpperCase())}</strong> ${esc(n)}${k==='ph'?'':' ppm'}</span>`).join('')}</p><p>${r.dosages.length?r.dosages.map(d=>`${esc(d.product)}: <strong>${esc(d.quantity)} ${esc(d.unit)}</strong>`).join(' · '):'No additions recorded'}</p></div></div>`;};
  return `<section class="history-box" aria-label="${esc(p.name)} chemical history"><div class="between"><h3>Chemical history</h3><span class="tiny">Last 30 days</span></div>${rows.length?entry(rows[0])+(rows.length>1?`<details><summary>View ${rows.length-1} earlier services</summary>${rows.slice(1).map(entry).join('')}</details>`:''):'<p class="tiny">No records in the last 30 days.</p>'}<p class="hint">Reference only. Enter fresh readings below.</p></section>`;
 }
 function readingField(p,r,k){
  const [label,max,unit]=READINGS[k],choices=k==='fc'?[1,3,5]:k==='ph'?[7,7.2,7.4,7.6,7.8,8]:[];
  return `<div class="field"><label class="field">${esc(label)}${p.required_readings.includes(k)?' *':''}<input aria-label="${esc(p.name)} ${esc(label)}" type="number" inputmode="decimal" step="any" min="0" max="${max}" data-reading="${k}" data-pool="${p.id}" value="${esc(r.readings[k]??'')}" ${p.required_readings.includes(k)?'required':''}></label>${choices.length?`<div class="reading-options" role="group" aria-label="${esc(p.name)} ${k==='ph'?'pH':'Free Chlorine'} quick values">${choices.map(n=>`<button type="button" data-action="reading-value" data-pool="${p.id}" data-key="${k}" data-value="${n}" aria-label="${esc(p.name)} ${k==='ph'?'pH':'FC'} ${k==='ph'?n.toFixed(1):n}${k==='fc'?' ppm':''}" aria-pressed="${r.readings[k]===n}">${k==='ph'?n.toFixed(1):n}</button>`).join('')}</div><span class="hint">Tap a value or type a different reading.</span>`:''}<span class="hint">${unit||'pH — unitless'} · new measurement</span></div>`;
 }
 function doses(p,r){return r.dosages.map((d,i)=>`<div class="dose"><div class="between"><h3>${esc(d.product||'Other product')}</h3><button type="button" class="quiet" data-action="remove-dose" data-pool="${p.id}" data-index="${i}">Remove</button></div>${!PRODUCTS[d.product]||d.product==='Other'?field('product','Product',d.product==='Other'?'':d.product,'text',`data-dose="product" data-pool="${p.id}" data-index="${i}" maxlength="100"`):''}<div class="grid"><label class="field">Amount<input aria-label="${esc(d.product)} amount" type="number" inputmode="decimal" min="0.001" max="10000" step="any" value="${esc(d.quantity||'')}" data-dose="quantity" data-pool="${p.id}" data-index="${i}"></label><label class="field">Unit${PRODUCTS[d.product]&&d.product!=='Other'?`<select data-dose="unit" data-pool="${p.id}" data-index="${i}">${PRODUCTS[d.product].map(u=>`<option ${d.unit===u?'selected':''}>${u}</option>`).join('')}</select>`:`<input value="${esc(d.unit)}" data-dose="unit" data-pool="${p.id}" data-index="${i}" maxlength="20">`}</label></div><div class="shortcuts">${(d.unit==='gal'?[0.25,0.5,1]:d.unit==='fl oz'?[8,16,32]:[1,2,4]).map(n=>`<button type="button" data-action="dose-amount" data-pool="${p.id}" data-index="${i}" data-amount="${n}">${n} ${esc(d.unit)}</button>`).join('')}</div></div>`).join('');}
 function visitPage(id){
  const s=db.stops.find(s=>s.id===id);if(!s)return '<p class="empty">Stop not found.</p>';
  if(s.status==='completed')return `<p class="notice">This visit is already complete.</p>${button('history','View history')}`;
  const c=client(s.client_id),d=draftFor(s),list=stops();
  return `<button class="quiet" data-action="route">← Back to route</button>${header('FAST SERVICE',c.property_name||c.name,`Stop ${list.findIndex(x=>x.id===s.id)+1} / ${list.length} · ${c.address}`)}${c.gate_notes?`<details class="notice"><summary>Internal access notes</summary><span data-original>${esc(c.gate_notes)}</span></details>`:''}<div id="visit-error" class="notice error" role="alert"></div>${c.pools.map(p=>{const r=d.pools.find(x=>x.pool_id===p.id);return `<div class="section"><div class="between"><h2 data-original>${esc(p.name)}</h2><span class="tiny">${p.gallons.toLocaleString('en-US')} gal</span></div>${chemistry(p)}<section class="card"><div class="section-title">A · QUICK CHECKLIST</div><div class="between"><h3>Tasks performed</h3>${button('all-done','Mark all done',`data-pool="${p.id}"`,true)}</div><div class="checks">${p.checklist.map((task,i)=>`<label class="check"><input type="checkbox" data-task="${i}" data-pool="${p.id}" ${r.tasks.includes(task)?'checked':''}>${esc(task)}</label>`).join('')}</div></section><section class="card"><div class="section-title">B · WATER READINGS</div><h3>Today’s measurements</h3><div class="grid readings section">${['fc','ph'].map(k=>readingField(p,r,k)).join('')}</div><details><summary>More readings · TA, CYA, CH, salt & CC</summary><div class="grid">${['ta','cya','ch','salt','cc','tc','temperature_f'].map(k=>readingField(p,r,k)).join('')}</div></details></section><section class="card"><div class="section-title">C · CHEMICAL DOSAGES</div><h3>Products actually added</h3>${doses(p,r)}<label class="field section">Add chemical<select data-add-dose="${p.id}" aria-label="Add chemical for ${esc(p.name)}"><option value="">＋ Choose product</option>${Object.keys(PRODUCTS).map(product=>`<option>${product}</option>`).join('')}</select></label><p class="tiny">Amount shortcuts are not dosage recommendations.</p></section></div>`;}).join('')}<section class="card"><div class="section-title">D · SERVICE PHOTO</div><div class="between"><h3>Finished pool</h3><span class="tiny">${d.photos.length} / 3</span></div>${d.photos.length<3?`<label class="camera section">▧ TAKE PHOTO<input type="file" id="photo-input" accept="image/jpeg,image/png,image/webp" capture="environment"><small class="tiny" style="display:block">${c.pools.some(p=>p.photo_required)?'One photo is required':'Optional · up to three test photos'}</small></label>`:''}<div class="photos">${d.photos.map((photo,i)=>`<figure class="photo"><img alt="Captured service photo ${i+1}" src="${esc(photo)}"><button class="quiet" data-action="remove-photo" data-index="${i}">Remove / retake</button></figure>`).join('')}</div><p class="tiny">Compressed and saved only in this browser. No upload occurs.</p></section><section class="card"><label class="field">Service note<textarea id="visit-notes" maxlength="2000" placeholder="Optional note for the report preview">${esc(d.notes)}</textarea><span class="hint">Do not enter gate codes or private customer details.</span></label></section><details class="card"><summary>Internal service details</summary><p class="tiny">For staff only. These details are not included in customer emails.</p>${[['technician_notes','Technician notes'],['equipment_problems','Equipment problems'],['filter_cleaning','Filter cleaning'],['repairs_performed','Repairs performed']].map(([key,label])=>`<label class="field">${label}<textarea data-internal="${key}" maxlength="2000">${esc(d.service_details?.[key]||'')}</textarea></label>`).join('')}</details><div class="sticky-complete"><button class="button" id="complete" data-action="complete" data-id="${s.id}">COMPLETE & NEXT →</button><p class="tiny" style="text-align:center">Local demo only · no email or cloud sync</p></div>`;
 }
 function historyPage(){
  const visits=[...db.visits].sort((a,b)=>b.completed_at.localeCompare(a.completed_at));
  return `${header('SERVICE RECORDS','Visit History','Stored in this browser. Reports are previews only — never sent.')}<input class="search" type="search" id="history-search" placeholder="Search client or property" aria-label="Search visit history">${visits.map(v=>`<details class="card history-record" data-search="${esc((v.property_name+' '+v.customer_name).toLowerCase())}"><summary><span class="between"><span><strong><span data-original>${esc(v.property_name)}</span></strong><span class="muted" style="display:block">${dateLabel(v.completed_at)} · ${new Intl.DateTimeFormat(languageTag(),{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}).format(new Date(v.completed_at))}</span></span><span class="badge completed">Completed locally</span></span></summary>${visitDetails(v,true)}<div class="notice">Email: not sent — local report preview only.</div>${button('report','Preview customer report',`data-id="${v.id}"`,true)}</details>`).join('')||'<p class="empty">No visits yet.</p>'}`;
 }
 function visitDetails(v,includeInternal=false){return `${v.pools.map(p=>`<div class="divider"></div><h3><span data-original>${esc(p.pool_name)}</span></h3><p class="tiny">Tasks actually checked</p><p>${p.tasks.map(t=>`<span class="chip">✓ ${esc(t)}</span>`).join('')||'No tasks recorded'}</p><p class="tiny">Water readings</p><p>${Object.entries(p.readings).map(([k,n])=>`<span class="chip">${esc(READINGS[k]?.[0]||k)}: <strong>${esc(n)} ${esc(READINGS[k]?.[2]||'')}</strong></span>`).join('')||'No readings recorded'}</p><p class="tiny">Chemicals added</p><p>${p.dosages.map(d=>`${esc(d.product)}: <strong>${esc(d.quantity)} ${esc(d.unit)}</strong>`).join('<br>')||'No additions recorded'}</p>`).join('')}<div class="photos">${v.photos.map((p,i)=>`<figure class="photo"><img src="${esc(p)}" alt="Service photo ${i+1}"></figure>`).join('')}</div>${v.notes?`<p><span data-original>${esc(v.notes)}</span></p>`:''}${includeInternal&&v.service_details?`<h3>Internal service details</h3>${Object.entries(v.service_details).filter(([,value])=>value).map(([key,value])=>`<p><strong>${({technician_notes:'Technician notes',equipment_problems:'Equipment problems',filter_cleaning:'Filter cleaning',repairs_performed:'Repairs performed'})[key]}</strong><br><span data-original>${esc(value)}</span></p>`).join('')}`:''}`;}
 function clientsPage(){
  const list=db.clients.filter(c=>!c.archived&&(customerStatus==='all'||c.status===customerStatus)&&(!customerTag||(c.tags||[]).includes(customerTag))&&`${c.name} ${c.address} ${c.email} ${c.phone} ${c.billing_address||''}`.toLowerCase().includes(customerSearch.toLowerCase())).sort((a,b)=>(customerSort==='status'?a.status.localeCompare(b.status):0)||a.name.localeCompare(b.name,languageTag()));
  const tags=[...new Set(db.clients.flatMap(c=>c.tags||[]))].sort();
  return `${header('YOUR CLIENTS','Customers','Fictional clients only. Configure pools, service days and requirements.')}<div class="actions section">${button('new-client','Add Customer')}${button('customer-export','Export CSV','',true)}</div><div class="grid section"><label class="field">Search customers<input type="search" id="customer-search" value="${esc(customerSearch)}" placeholder="Name, address, email or phone"></label><label class="field">Status<select id="customer-status">${['all','lead','active','inactive'].map(v=>`<option value="${v}" ${customerStatus===v?'selected':''}>${({all:'All statuses',lead:'Lead',active:'Active',inactive:'Inactive'})[v]}</option>`).join('')}</select></label><label class="field">Tags<select id="customer-tag"><option value="">All tags</option>${tags.map(v=>`<option value="${esc(v)}" ${customerTag===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label><label class="field">Sort by<select id="customer-sort"><option value="name">Name</option><option value="status" ${customerSort==='status'?'selected':''}>Status</option></select></label></div><div class="row section"><span>${selectedCustomers.length} selected</span>${button('customer-bulk-active','Mark Active','',true)}${button('customer-bulk-lead','Mark Lead','',true)}${button('customer-bulk-inactive','Mark Inactive','',true)}${button('customer-bulk-tag','Assign tags','',true)}</div><div class="demo-table-wrap"><table class="demo-table"><thead><tr><th></th><th>Customer name</th><th>Status</th><th>Billing address</th><th>Phone</th><th>Email</th><th>Actions</th></tr></thead><tbody>${list.map(c=>`<tr class="client-card"><td><input type="checkbox" data-customer-select="${c.id}" aria-label="Select ${esc(c.name)}" ${selectedCustomers.includes(c.id)?'checked':''}></td><td><h2 data-original>${esc(c.name)}</h2><small data-original>${esc(c.address)}</small><small data-original>${esc((c.tags||[]).join(', '))}</small>${c.pools.map(p=>`<div class="row"><strong data-original>${esc(p.name)}</strong><span class="tiny">${p.photo_required?'Photo required':'Photo optional'}</span><button class="quiet" data-action="edit-pool" data-id="${c.id}" data-pool="${p.id}">Pool settings</button></div>`).join('')}<button class="quiet" data-action="add-pool" data-id="${c.id}">＋ Add pool / spa</button></td><td>${({lead:'Lead',active:'Active',inactive:'Inactive'})[c.status]}</td><td data-original>${esc(c.billing_address||c.address)}</td><td data-original>${esc(c.phone||'—')}</td><td data-original>${esc(c.email||'—')}</td><td><div class="row">${button('view-client','View',`data-id="${c.id}"`,true)}${button('edit-client','Edit',`data-id="${c.id}"`,true)}${button('archive-client','Delete',`data-id="${c.id}"`,true)}</div></td></tr>`).join('')}</tbody></table></div>`;
 }
 function settingsPage(){return `${header('DEMO PREFERENCES','Settings','A simple browser prototype of the current Fast Route project.')}<section class="card"><h2>What you can test</h2><p>Route, recurring weekdays, manual ordering, multiple pools, custom checklists, water readings, actual product quantities, photos, Complete & Next and visit history.</p><p class="notice">No login, cloud backend, team permissions, signed photo storage or real email sending are active in this standalone demo. Do not enter real customer information.</p></section><section class="card"><h2>Browser storage</h2><p>${storage?'IndexedDB is available. Demo visits, drafts and photos are saved in this browser.':'Storage is unavailable. This session is temporary; closing it will lose changes.'}</p><p class="muted">The demo works without internet once downloaded. Clearing browser data or moving the HTML to another location can affect local records.</p><div class="actions">${button('export','Export demo backup','',true)}${button('reset','Reset fictional demo data','',true)}</div></section><section class="card"><h2>Project defaults</h2><p>English · America/New_York · gallons · ppm</p><p class="muted">The production project uses Next.js, Supabase Auth/PostgreSQL/Storage, an offline queue and a server email worker. This demo is a separate local preview.</p></section>`;}
 function render(){
  const path=currentPath();
  document.querySelectorAll('#nav a').forEach(a=>{const section=path.startsWith('visit/')?'route':path;a.classList.toggle('active',a.hash==='#'+section);if(a.classList.contains('active'))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  app.innerHTML=localizeHTML(path.startsWith('visit/')?visitPage(path.slice(6)):path==='clients'?clientsPage():path==='history'?historyPage():path==='settings'?settingsPage():routePage());
 }
 function activeDraft(){const id=currentPath().startsWith('visit/')?currentPath().slice(6):null;return id?db.drafts[id]:null;}
 function showModal(title,body){document.querySelector('#modal-title').textContent=tr(title);document.querySelector('#modal-content').innerHTML=localizeHTML(body);modal.showModal();}
 function clientModal(c){const v=c||{name:'',property_name:'',address:'',email:'',phone:'',gate_notes:'',status:'active',tags:[],billing_address:'',monthly_price:'0',active:true,days:[new Date(db.date+'T12:00:00Z').getUTCDay()]};showModal(c?'Edit demo client':'Add demo client',`<form id="client-form"><input type="hidden" name="id" value="${esc(c?.id||'')}">${field('name','Client name',v.name,'text','required maxlength="100"')}${field('property_name','Property name',v.property_name,'text','required maxlength="100"')}${field('address','Service address',v.address,'text','required maxlength="200"')}${field('email','Email — no messages will be sent',v.email,'email')}${field('phone','Phone',v.phone,'tel')}${field('billing_address','Billing address (if different)',v.billing_address||'')}${field('monthly_price','Monthly service price (USD)',v.monthly_price||'0','number','min="0" step="0.01"')}${field('tags','Tags (comma separated)',(v.tags||[]).join(', '))}<label class="field">Status<select name="status">${['lead','active','inactive'].map(x=>`<option value="${x}" ${x===(v.status||'active')?'selected':''}>${({lead:'Lead',active:'Active',inactive:'Inactive'})[x]}</option>`).join('')}</select></label><label class="field">Internal access notes<textarea name="gate_notes" maxlength="1000">${esc(v.gate_notes)}</textarea></label><fieldset style="border:1px solid #dce7eb;border-radius:9px"><legend>Recurring service days</legend><div class="row">${DAYS.map((day,i)=>`<label class="row tiny"><input type="checkbox" name="days" value="${i}" ${v.days.includes(i)?'checked':''}>${day}</label>`).join('')}</div></fieldset><button class="button" type="submit">Save client</button></form>`);}
 function poolModal(c,p){const v=p||pool('New pool');showModal(p?'Pool settings':'Add pool / spa',`<form id="pool-form"><input type="hidden" name="client_id" value="${c.id}"><input type="hidden" name="id" value="${p?.id||''}">${field('name','Pool / spa name',v.name,'text','required maxlength="100"')}${field('gallons','Volume (gallons)',v.gallons,'number','required min="1" max="10000000" step="1"')}<label class="field">Custom checklist — one task per line<textarea name="checklist" required maxlength="3000">${esc(v.checklist.join('\n'))}</textarea></label><div class="row"><label class="row"><input type="checkbox" name="fc" ${v.required_readings.includes('fc')?'checked':''}>Require FC</label><label class="row"><input type="checkbox" name="ph" ${v.required_readings.includes('ph')?'checked':''}>Require pH</label></div><label class="row"><input type="checkbox" name="photo_required" ${v.photo_required?'checked':''}>Require a service photo</label><p class="tiny">Existing completed visits keep their original records.</p><button class="button" type="submit">Save pool</button></form>`);}
 async function complete(id){
  if(photoBusy)return toast('Wait for the photo to finish.');
  const s=db.stops.find(s=>s.id===id),c=client(s.client_id),d=draftFor(s),error=document.querySelector('#visit-error');
  const fail=message=>{error.textContent=tr(message);error.scrollIntoView({block:'center',behavior:'smooth'});};
  for(const p of c.pools){const r=d.pools.find(x=>x.pool_id===p.id);if(!r)return fail('Pool setup changed. Go back and reopen this visit.');for(const k of p.required_readings)if(r.readings[k]===undefined)return fail(`${p.name}: ${READINGS[k][0]} is required.`);for(const [k,n] of Object.entries(r.readings))if(!Number.isFinite(n)||n<0||n>READINGS[k][1])return fail(`${p.name}: check ${READINGS[k][0]}.`);for(const dose of r.dosages)if(!dose.product.trim()||!dose.unit.trim()||!Number.isFinite(dose.quantity)||dose.quantity<=0||dose.quantity>10000)return fail('Enter a positive amount, product and unit for each chemical, or remove unused entries.');if(p.photo_required&&!d.photos.length)return fail('One service photo is required.');}
  if(s.status==='completed')return;
  const el=document.querySelector('#complete');el.disabled=true;
  const visit={id:d.id,stop_id:s.id,client_id:c.id,property_name:c.property_name,customer_name:c.name,completed_at:new Date().toISOString(),pools:d.pools.map(r=>({...clone(r),pool_name:c.pools.find(p=>p.id===r.pool_id).name})),photos:[...d.photos],notes:d.notes,service_details:clone(d.service_details||{})};
  const oldStatus=s.status;db.visits.push(visit);s.status='completed';delete db.drafts[s.id];
  const saved=await saveNow();
  if(!saved&&storage){db.visits=db.visits.filter(v=>v.id!==visit.id);s.status=oldStatus;db.drafts[s.id]=d;el.disabled=false;return fail('This visit was not saved. Free browser storage or export the demo before retrying.');}
  const next=stops().find(x=>x.position>s.position&&!['completed','skipped'].includes(x.status))||stops().find(x=>!['completed','skipped'].includes(x.status));
  if(next){next.status='in_progress';await saveNow();navigate('visit/'+next.id);}else navigate('route');
  toast(saved?'Visit saved locally. Email was not sent.':'Completed in temporary memory only — not saved.');
 }
 async function photo(file){
  const d=activeDraft();if(!d||d.photos.length>=3)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)return toast('Choose a JPEG, PNG or WebP test image under 20 MB.');
  photoBusy=true;const input=document.querySelector('#photo-input');if(input)input.disabled=true;
  try{const url=URL.createObjectURL(file);let image;try{image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});}finally{URL.revokeObjectURL(url);}if(image.width*image.height>25000000)throw Error('Image is too large. Use a smaller test photo.');const scale=Math.min(1,1200/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);d.photos.push(canvas.toDataURL('image/jpeg',.72));render();await saveNow();}catch{toast('Image could not be prepared. Try a smaller JPEG.');}finally{photoBusy=false;if(input)input.disabled=false;}
 }
 app.addEventListener('input',event=>{
  const el=event.target,d=activeDraft();
  if(el.id==='customer-search'){customerSearch=el.value;const position=el.selectionStart;render();const next=document.querySelector('#customer-search');next.focus();next.setSelectionRange(position,position);return;}
  if(el.id==='history-search'){for(const card of app.querySelectorAll('.history-record'))card.hidden=!card.dataset.search.includes(el.value.toLowerCase());return;}
  if(!d)return;
  const r=d.pools.find(p=>p.pool_id===el.dataset.pool);
  if(el.dataset.reading&&r){if(el.value==='')delete r.readings[el.dataset.reading];else r.readings[el.dataset.reading]=Number(el.value);const group=el.closest('.field').parentElement.querySelector('.reading-options');if(group)group.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(el.value!==''&&Number(b.dataset.value)===Number(el.value))));}
  else if(el.dataset.dose&&r){r.dosages[Number(el.dataset.index)][el.dataset.dose]=el.dataset.dose==='quantity'?Number(el.value):el.value;}
  else if(el.id==='visit-notes')d.notes=el.value;else if(el.dataset.internal){d.service_details??={technician_notes:'',equipment_problems:'',filter_cleaning:'',repairs_performed:''};d.service_details[el.dataset.internal]=el.value;}else return;
  saveSoon();
 });
 app.addEventListener('change',async event=>{
  const el=event.target;
  if(el.dataset.customerSelect){selectedCustomers=el.checked?[...new Set([...selectedCustomers,el.dataset.customerSelect])]:selectedCustomers.filter(id=>id!==el.dataset.customerSelect);render();return;}
  if(['customer-status','customer-tag','customer-sort'].includes(el.id)){if(el.id==='customer-status')customerStatus=el.value;else if(el.id==='customer-tag')customerTag=el.value;else customerSort=el.value;render();return;}
  if(el.id==='route-date'){if(!/^\d{4}-\d{2}-\d{2}$/.test(el.value))return;db.date=el.value;ensureDay();render();await saveNow();return;}
  const d=activeDraft();if(!d)return;
  const r=d.pools.find(p=>p.pool_id===el.dataset.pool);
  if(el.dataset.task!==undefined&&r){const s=db.stops.find(s=>s.id===d.stop_id),p=client(s.client_id).pools.find(p=>p.id===r.pool_id),task=p.checklist[Number(el.dataset.task)];r.tasks=el.checked?[...new Set([...r.tasks,task])]:r.tasks.filter(t=>t!==task);saveSoon();}
  if(el.dataset.addDose){const rec=d.pools.find(p=>p.pool_id===el.dataset.addDose);if(!el.value||rec.dosages.length>=20)return;rec.dosages.push({product:el.value==='Other'?'':el.value,quantity:0,unit:el.value==='Other'?'':PRODUCTS[el.value][0]});render();await saveNow();}
  if(el.id==='photo-input'&&el.files[0])await photo(el.files[0]);
 });
 document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el||el.disabled)return;
  const action=el.dataset.action,id=el.dataset.id,d=activeDraft();
  if(['route','clients','history','settings'].includes(action))return navigate(action);
  if(['week-back','week-next','date-today','pick-day'].includes(action)){db.date=action==='date-today'?today():action==='pick-day'?el.dataset.value:dayPlus(db.date,action==='week-back'?-7:7);ensureDay();render();await saveNow();}
  if(action==='view-client'){clientModal(client(id));document.querySelectorAll('#modal-content input,#modal-content select,#modal-content textarea,#modal-content button').forEach(el=>el.disabled=true);}
  if(action==='archive-client'){if(!window.confirm(tr('Archive selected customers? Their service history will be preserved.')))return;const c=client(id);c.archived=true;c.active=false;c.status='inactive';await saveNow();render();}
  if(action.startsWith('customer-bulk-')){if(!selectedCustomers.length)return toast(tr('Select customers first.'));if(!window.confirm(tr('Apply this action to the selected customers?')))return;const tag=action==='customer-bulk-tag'?window.prompt(tr('Tags (comma separated)')):null;if(action==='customer-bulk-tag'&&!tag)return;for(const c of db.clients.filter(c=>selectedCustomers.includes(c.id))){if(tag)c.tags=[...new Set([...(c.tags||[]),...tag.split(',').map(t=>t.trim().toLowerCase()).filter(Boolean)])];else{c.status=action.replace('customer-bulk-','');c.active=c.status==='active';}}selectedCustomers=[];ensureDay();await saveNow();render();}
  if(action==='customer-export'){const rows=db.clients.filter(c=>!c.archived&&(!selectedCustomers.length||selectedCustomers.includes(c.id)));const cell=v=>{let text=String(v??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};const csv='\ufeff'+[['ID','Name','Status','Address','Billing address','Phone','Email','Tags'],...rows.map(c=>[c.id,c.name,c.status,c.address,c.billing_address,c.phone,c.email,(c.tags||[]).join(', ')])].map(r=>r.map(cell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='alys-demo-customers.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  if(action==='start'){const s=db.stops.find(s=>s.id===id);s.status='in_progress';await saveNow();navigate('visit/'+id);}
  if(action==='skip'||action==='unskip'){const s=db.stops.find(s=>s.id===id);s.status=action==='skip'?'skipped':'pending';render();await saveNow();}
  if(action==='up'||action==='down'){const list=stops(),i=list.findIndex(s=>s.id===id),j=i+(action==='up'?-1:1);if(j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];list.forEach((s,n)=>s.position=n+1);render();await saveNow();}
  if(action==='reading-value'&&d){const r=d.pools.find(p=>p.pool_id===el.dataset.pool);r.readings[el.dataset.key]=Number(el.dataset.value);const input=app.querySelector(`[data-reading="${el.dataset.key}"][data-pool="${el.dataset.pool}"]`);input.value=el.dataset.value;el.closest('.reading-options').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===el)));saveSoon();}
  if(action==='all-done'&&d){const s=db.stops.find(s=>s.id===d.stop_id),p=client(s.client_id).pools.find(p=>p.id===el.dataset.pool);d.pools.find(r=>r.pool_id===p.id).tasks=[...p.checklist];render();await saveNow();}
  if(action==='remove-dose'&&d){d.pools.find(r=>r.pool_id===el.dataset.pool).dosages.splice(Number(el.dataset.index),1);render();await saveNow();}
  if(action==='dose-amount'&&d){d.pools.find(r=>r.pool_id===el.dataset.pool).dosages[Number(el.dataset.index)].quantity=Number(el.dataset.amount);render();await saveNow();}
  if(action==='remove-photo'&&d){d.photos.splice(Number(el.dataset.index),1);render();await saveNow();}
  if(action==='complete')await complete(id);
  if(action==='new-client')clientModal(null);
  if(action==='edit-client')clientModal(client(id));
  if(action==='add-pool')poolModal(client(id),null);
  if(action==='edit-pool'){const c=client(id);poolModal(c,c.pools.find(p=>p.id===el.dataset.pool));}
  if(action==='report'){const v=db.visits.find(v=>v.id===id);showModal('Customer report preview',`<p class="notice no-print">Local preview only. No email has been sent.</p><article class="report"><div class="brand-text">≋ ALYS POOL SERVICES</div><h2 style="margin-top:20px">Your pool has been serviced!</h2><dl><dt>Property</dt><dd><span data-original>${esc(v.property_name)}</span></dd><dt>Service date</dt><dd>${new Intl.DateTimeFormat(languageTag(),{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'}).format(new Date(v.completed_at))}</dd></dl>${visitDetails(v)}<p class="section">Thank you for choosing ALYS Pool Services!</p></article>${button('print','Print / Save PDF','',true)}`);}
  if(action==='print')window.print();
  if(action==='export'){const url=URL.createObjectURL(new Blob([JSON.stringify(db,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='alys-fictional-demo-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  if(action==='reset'){if(!window.confirm('Reset only this standalone demo and replace its local records with fictional examples?'))return;const preferredLanguage=language();db=seed();db.language=preferredLanguage;ensureDay();await saveNow();navigate('route');render();toast('Fictional demo restored. Production data was not accessed.');}
 });
 modal.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target,f=new FormData(form),before=clone(db);
  if(form.getAttribute('id')==='client-form'){
   const id=String(f.get('id')||''),c=id?client(id):{id:uid(),pools:[pool('Main pool')]};const days=f.getAll('days').map(Number);
   if(!days.length){toast('Choose at least one service day.');return;}
   const values={name:String(f.get('name')).trim(),property_name:String(f.get('property_name')).trim(),address:String(f.get('address')).trim(),email:String(f.get('email')||'').trim(),phone:String(f.get('phone')||'').trim(),gate_notes:String(f.get('gate_notes')||'').trim(),status:String(f.get('status')||'active'),active:f.get('status')==='active',tags:[...new Set(String(f.get('tags')||'').split(',').map(t=>t.trim().toLowerCase()).filter(Boolean))],billing_address:String(f.get('billing_address')||''),monthly_price:String(f.get('monthly_price')||'0'),days};
   if(!values.name||!values.property_name||!values.address)return toast('Client, property and address are required.');
   Object.assign(c,values);
   if(!id)db.clients.push(c);ensureDay();
  }else if(form.getAttribute('id')==='pool-form'){
   const c=client(String(f.get('client_id'))),id=String(f.get('id')||''),p=id?c.pools.find(p=>p.id===id):pool('New pool');
   const tasks=[...new Set(String(f.get('checklist')).split('\n').map(t=>t.trim()).filter(Boolean))];
   if(!tasks.length||tasks.length>30||tasks.some(t=>t.length>150))return toast('Use 1–30 checklist tasks, up to 150 characters each.');
   Object.assign(p,{name:String(f.get('name')).trim(),gallons:Number(f.get('gallons')),checklist:tasks,required_readings:['fc','ph'].filter(k=>f.get(k)==='on'),photo_required:f.get('photo_required')==='on'});
   if(!id)c.pools.push(p);
   // Add blank pool records to incomplete drafts without copying previous water measurements.
   for(const s of db.stops.filter(s=>s.client_id===c.id)){const draft=db.drafts[s.id];if(draft&&!draft.pools.some(r=>r.pool_id===p.id))draft.pools.push({pool_id:p.id,tasks:[],readings:{},dosages:[]});}
  }else return;
  const saved=await saveNow();
  if(!saved&&storage){db=before;toast('Changes could not be saved. Please free browser storage or export the demo.');return;}
  modal.close();render();toast(saved?'Demo changes saved locally.':'Changes are temporary — browser storage is unavailable.');
 });
 document.querySelector('#language-select').addEventListener('change',async event=>{db.language=event.target.value;applyLanguage();render();await saveNow();});
 document.querySelector('#close-modal').addEventListener('click',()=>modal.close());
 window.addEventListener('hashchange',()=>{if(!db)return;render();window.scrollTo({top:0,behavior:'instant'});});
 window.addEventListener('pagehide',()=>{if(db)void saveNow();});
 async function init(){
  try{const existing=await openStorage();db=existing?.version===1?existing:seed();}catch{storage=null;db=seed();}
  for(const c of db.clients){c.status??=c.active?'active':'inactive';c.tags??=[];}
  applyLanguage();ensureDay();render();await saveNow();
  if(!storage)toast('Browser storage is blocked. Changes last only while this page stays open. Try Chrome/Edge or serve demo/ over HTTP.');
 }
 void init();
})();
