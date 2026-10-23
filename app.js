/* ALYS Pool Manager — functional offline prototype.
   Demonstration only: no authentication, cloud database, or server-side security.
   Do not store real customer contact information until a secure backend is deployed. */
(() => {
  'use strict';
  const STORAGE_KEY = 'alys-pool-manager-demo-v1';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = amount => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(amount)||0);
  const moneyExact = amount => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(amount)||0);
  const today = () => { const d=new Date();return iso(d); };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parse = dateString => { const [y,m,d]=dateString.split('-').map(Number);return new Date(y,m-1,d,12); };
  const addDays = (date, n) => { const d=parse(typeof date==='string'?date:iso(date));d.setDate(d.getDate()+n);return iso(d); };
  const startOfWeek = date => {const d=parse(date);const delta=(d.getDay()+6)%7;d.setDate(d.getDate()-delta);return iso(d);};
  const weekDates = monday => Array.from({length:7},(_,i)=>addDays(monday,i));
  const shortDate = date => parse(date).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
  const fullDate = date => parse(date).toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const dayCodes = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const seedClients = [
    ['c1','Residência Exemplo 01','Fort Lauderdale, FL','Residencial','Própria',140,0,15000,'Cloro',[0]],
    ['c2','Residência Exemplo 02','Pompano Beach, FL','Residencial','Própria',165,0,18000,'Sal',[1]],
    ['c3','Residência Exemplo 03','Deerfield Beach, FL','Residencial','Própria',130,0,12000,'Cloro',[2]],
    ['c4','Residência Exemplo 04','Boca Raton, FL','Residencial','Própria',150,0,21000,'Sal',[3]],
    ['c5','Residência Exemplo 05','Lighthouse Point, FL','Residencial','Própria',140,0,13000,'Cloro',[4]],
    ['c6','Residência Exemplo 06','Pompano Beach, FL','Residencial','Própria',145,0,16000,'Cloro',[4]],
    ['c7','Comercial Exemplo A','Boca Raton, FL','Comercial','Subcontrato',0,45,30000,'Cloro',[0,3]],
    ['c8','Comercial Exemplo B','Boynton Beach, FL','Comercial','Subcontrato',0,45,30000,'Cloro',[1,4]],
  ];
  function seed() {
    const clients=seedClients.map(([id,name,address,type,source,monthlyRate,perVisitRate,gallons,sanitation,serviceDays])=>({id,name,address,type,source,monthlyRate,perVisitRate,gallons,sanitation,serviceDays,active:true,email:'',phone:''}));
    const services=[];const monday=startOfWeek(today());
    clients.forEach(client=>client.serviceDays.forEach(dayIndex=>{
      const date=addDays(monday,dayIndex);
      services.push({id:uid('s'),clientId:client.id,date,time:'09:00',status:'pending',fc:'',ph:'',alkalinity:'',salt:'',chemicals:'',notes:'',completedAt:''});
    }));
    return {version:1,clients,services};
  }
  function load() {
    try {const raw=localStorage.getItem(STORAGE_KEY);if(raw){const d=JSON.parse(raw);if(Array.isArray(d.clients)&&Array.isArray(d.services))return d;}}catch(err){console.warn('Dados salvos inválidos',err);}
    return seed();
  }
  let db=load();
  let page='dashboard';
  let routeDate=today();
  let search='';let clientFilter='all';let historyFilter='all';
  function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(db));}catch(e){toast('Não foi possível salvar neste navegador. Exporte um backup.');}}
  if(!localStorage.getItem(STORAGE_KEY))save();
  function getClient(id){return db.clients.find(c=>c.id===id);}
  function activeClients(){return db.clients.filter(c=>c.active);}
  function servicesOn(date){return db.services.filter(s=>s.date===date).sort((a,b)=>a.time.localeCompare(b.time));}
  function isDone(s){return s.status==='done';}
  function monthRevenue(){return activeClients().filter(c=>c.source==='Própria').reduce((sum,c)=>sum+(Number(c.monthlyRate)||0),0);}
  function contractorEstimate(){return activeClients().filter(c=>c.source==='Subcontrato').reduce((sum,c)=>sum+(Number(c.perVisitRate)||0)*(c.serviceDays||[]).length*52/12,0);}
  function ensureWeek(monday){let added=false;for(const c of activeClients())for(const day of c.serviceDays||[]){const date=addDays(monday,day);if(!db.services.some(s=>s.clientId===c.id&&s.date===date)){db.services.push({id:uid('s'),clientId:c.id,date,time:'09:00',status:'pending',fc:'',ph:'',alkalinity:'',salt:'',chemicals:'',notes:'',completedAt:''});added=true;}}if(added)save();}
  function scheduledThisWeek(){const start=startOfWeek(today());ensureWeek(start);return db.services.filter(s=>s.date>=start&&s.date<=addDays(start,6));}
  const pct=(part,total)=>total?Math.round(part/total*100):0;
  function heading(kicker,title,desc,actions=''){return `<div class="page-kicker">${kicker}</div><div class="page-header"><div><h1>${title}</h1><p>${desc}</p></div>${actions?`<div class="header-actions">${actions}</div>`:''}</div>`;}
  const button=(action,label,variant='primary',extra='')=>`<button type="button" class="btn btn-${variant}" data-action="${action}" ${extra}>${label}</button>`;
  function toast(message){const root=$('#toast-root');root.innerHTML=`<div class="toast">${esc(message)}</div>`;setTimeout(()=>{if(root)root.innerHTML='';},3500);}
  function pageDashboard(){
    const all=scheduledThisWeek(), done=all.filter(isDone).length, todayItems=servicesOn(today()), todayDone=todayItems.filter(isDone).length, mrr=monthRevenue();
    const dateName=new Date().toLocaleDateString('pt-BR',{weekday:'long'});
    return heading('CONTROLE OPERACIONAL','Visão geral','Acompanhe sua operação de onde estiver.',button('new-service','＋ Agendar serviço')+button('new-client','＋ Novo cliente','secondary'))+
    `<section class="hero"><div class="hero-content"><div class="hero-eyebrow">BEM-VINDO AO SEU PAINEL</div><h2>Bom trabalho nesta ${esc(dateName)}! 👋</h2><p>Organize as visitas, registre a água e mantenha seus clientes atualizados.<br>Todos os dados abaixo são fictícios para testar o aplicativo.</p><button class="btn btn-primary" data-action="navigate-route">Ver minha rota →</button></div><div class="hero-symbol">≋</div></section>
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-top">Receita própria / mês <span class="stat-icon">＄</span></div><div class="stat-value">${money(mrr)}</div><div class="stat-caption"><span class="good">↗</span> Apenas clientes próprios ativos</div></div>
      <div class="stat-card"><div class="stat-top">Piscinas ativas <span class="stat-icon alt">▤</span></div><div class="stat-value">${activeClients().length}</div><div class="stat-caption">${activeClients().filter(c=>c.source==='Própria').length} próprias · ${activeClients().filter(c=>c.source==='Subcontrato').length} subcontratadas</div></div>
      <div class="stat-card"><div class="stat-top">Visitas hoje <span class="stat-icon gold">⌖</span></div><div class="stat-value">${todayDone}<span style="font-size:17px;color:#acb8be;font-weight:500"> / ${todayItems.length}</span></div><div class="stat-caption">${todayItems.length-todayDone} aguardando conclusão</div></div>
      <div class="stat-card"><div class="stat-top">Conclusão semanal <span class="stat-icon">✓</span></div><div class="stat-value">${pct(done,all.length)}%</div><div class="stat-caption">${done} de ${all.length} visitas concluídas</div></div>
    </div>
    <div class="dashboard-grid"><div class="panel"><div class="panel-top"><div><h3>Agenda de hoje</h3><p>${esc(fullDate(today()))}</p></div><button class="link-button" data-action="navigate-route">Ver agenda completa →</button></div>${todayItems.length?`<div class="visit-list">${todayItems.map(s=>{
      const c=getClient(s.clientId);return `<div class="visit-row"><span class="visit-time">${esc(s.time)}</span><span class="visit-mark ${isDone(s)?'done':''}">${isDone(s)?'✓':'≋'}</span><div class="visit-description"><strong>${esc(c?.name||'Cliente removido')}</strong><span>${esc(c?.address||'')} · ${esc(c?.type||'Piscina')}</span></div><span class="status ${isDone(s)?'done':'pending'}">${isDone(s)?'Concluído':'Pendente'}</span><button class="mini-check" title="${isDone(s)?'Editar registro':'Registrar manutenção'}" data-action="log-service" data-id="${esc(s.id)}">${isDone(s)?'↗':'→'}</button></div>`}).join('')}</div>`:'<div class="empty"><div class="empty-icon">☀</div>Nenhuma visita agendada hoje.</div>'}</div>
    <div class="stack"><div class="panel"><div class="panel-top"><div><h3>Produtividade semanal</h3><p>Visitas registradas de segunda a domingo</p></div></div><div class="week-bars">${weekDates(startOfWeek(today())).map((date,i)=>{const d=servicesOn(date),done=d.filter(isDone).length;const total=d.length;const height=total?Math.round(100*total/Math.max(...weekDates(startOfWeek(today())).map(x=>servicesOn(x).length),1)):0;const completedHeight=total?Math.round(height*done/total):0;return `<div class="week-bar-col"><div class="bar-track"><div style="position:absolute;bottom:0;width:100%;height:${height}%;background:#d2ebe6;border-radius:5px"></div><div class="bar-complete" style="height:${completedHeight}%"></div></div><span class="bar-label">${dayCodes[i]}</span></div>`;}).join('')}</div><div class="small-legend"><span><i class="legend-dot"></i> Concluídas</span><span><i class="legend-dot pale"></i> Agendadas</span></div></div>
    <div class="panel"><div class="panel-top"><div><h3>Visão do negócio</h3><p>Receita separada por origem</p></div></div><div class="metric-pad"><div class="metric-row"><span>Carteira própria</span><strong>${money(mrr)}/mês</strong></div><div class="metric-row"><span>Subcontratos estimados*</span><strong>${money(contractorEstimate())}/mês</strong></div><div class="insight-box" style="margin:13px 0 0"><span>💡</span><div><strong>Dois modelos de receita</strong><p>Carteira própria é mensalidade. Subcontrato é estimado por visita; não misturamos os valores como MRR.</p></div></div></div></div></div></div>`;
  }
  function pageRoute(){
    ensureWeek(startOfWeek(routeDate));
    const monday=startOfWeek(routeDate), dates=weekDates(monday), items=servicesOn(routeDate), completed=items.filter(isDone).length;
    return heading('OPERAÇÃO DE CAMPO','Rotas & agenda','Planeje a semana e registre cada visita.',`<button class="btn btn-secondary" data-action="prev-week">← Semana anterior</button><button class="btn btn-secondary" data-action="next-week">Próxima →</button>${button('new-service','＋ Agendar visita')}`)+
      `<div class="day-strip">${dates.map((date,i)=>{const a=servicesOn(date);return `<button class="day-card ${routeDate===date?'active':''}" data-action="choose-day" data-date="${date}"><strong>${dayCodes[i]}</strong><span>${parse(date).getDate()}</span><small>${a.length} ${a.length===1?'visita':'visitas'}</small></button>`}).join('')}</div>
      <div class="panel"><div class="route-summary"><div><h3>${esc(fullDate(routeDate))}</h3><p>${completed} concluídas de ${items.length} visitas</p></div><div class="route-summary-number">${pct(completed,items.length)}% concluído</div></div>${items.length?items.map((s,i)=>{const c=getClient(s.clientId);return `<div class="route-row"><span class="route-num">${i+1}</span><div class="route-info"><strong>${esc(c?.name||'Cliente removido')}</strong><small>${esc(s.time)} · ${esc(c?.address||'')} · ${esc(c?.source||'')}</small></div><div class="route-actions"><span class="status ${isDone(s)?'done':'pending'}">${isDone(s)?'✓ Concluída':'● Pendente'}</span><button class="btn btn-${isDone(s)?'secondary':'primary'} btn-small" data-action="log-service" data-id="${esc(s.id)}">${isDone(s)?'Ver / editar':'Registrar visita →'}</button></div></div>`;}).join(''):'<div class="empty"><div class="empty-icon">☀</div>Sem visitas agendadas para este dia.<br>Use “Agendar visita” para adicionar.</div>'}</div><p class="note">Visitas recorrentes são criadas por semana conforme os dias cadastrados para cada cliente. O protótipo não calcula trajetos nem otimiza a ordem de deslocamento.</p>`;
  }
  function pageClients(){
    const filtered=db.clients.filter(c=>(clientFilter==='all'||(clientFilter==='active'?c.active:clientFilter==='own'?c.source==='Própria':clientFilter==='contract'?c.source==='Subcontrato':!c.active))&&`${c.name} ${c.address} ${c.type}`.toLowerCase().includes(search.toLowerCase()));
    return heading('BASE DE CLIENTES','Clientes & piscinas','Gerencie informações, valores e dias de atendimento.',button('new-client','＋ Novo cliente'))+
      `<div class="section-toolbar"><div class="search-field"><span>⌕</span><input id="clientSearch" type="search" placeholder="Buscar cliente ou cidade..." value="${esc(search)}" aria-label="Buscar clientes"></div><select class="field-filter" id="clientFilter" aria-label="Filtrar clientes"><option value="all" ${clientFilter==='all'?'selected':''}>Todos os clientes</option><option value="active" ${clientFilter==='active'?'selected':''}>Somente ativos</option><option value="own" ${clientFilter==='own'?'selected':''}>Carteira própria</option><option value="contract" ${clientFilter==='contract'?'selected':''}>Subcontratos</option><option value="inactive" ${clientFilter==='inactive'?'selected':''}>Inativos</option></select></div>
      <div class="panel"><div class="panel-top"><div><h3>Cadastro de piscinas</h3><p>${filtered.length} registro(s) encontrados</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Cliente</th><th>Tipo</th><th>Origem</th><th>Plano / repasse</th><th>Dias</th><th>Status</th><th>Ação</th></tr></thead><tbody>${filtered.map(c=>`<tr><td><strong>${esc(c.name)}</strong><span class="small-muted">${esc(c.address)}</span></td><td>${esc(c.type)}<span class="small-muted">${Number(c.gallons||0).toLocaleString('en-US')} gal</span></td><td>${esc(c.source)}</td><td><strong>${c.source==='Própria'?money(c.monthlyRate)+'/mês':money(c.perVisitRate)+'/visita'}</strong></td><td>${(c.serviceDays||[]).map(i=>dayCodes[i]).join(', ')||'—'}</td><td><span class="status ${c.active?'open':'inactive'}">${c.active?'Ativo':'Inativo'}</span></td><td><div class="table-actions"><button class="btn btn-secondary btn-small" data-action="edit-client" data-id="${esc(c.id)}">Editar</button></div></td></tr>`).join('')}</tbody></table>${!filtered.length?'<div class="empty">Nenhum cliente encontrado.</div>':''}</div></div>`;
  }
  function pageHistory(){
    const rows=db.services.filter(s=>historyFilter==='all'||s.status===historyFilter).sort((a,b)=>b.date.localeCompare(a.date)||b.time.localeCompare(a.time));
    return heading('REGISTROS DE MANUTENÇÃO','Histórico de serviços','Cada visita fica registrada para futura consulta.',button('new-service','＋ Nova visita'))+
     `<div class="section-toolbar"><select class="field-filter" id="historyFilter" aria-label="Filtrar visitas"><option value="all" ${historyFilter==='all'?'selected':''}>Todas as visitas</option><option value="done" ${historyFilter==='done'?'selected':''}>Concluídas</option><option value="pending" ${historyFilter==='pending'?'selected':''}>Pendentes</option></select></div><div class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Data</th><th>Cliente</th><th>Situação</th><th>Cloro livre</th><th>pH</th><th>Químicos</th><th>Ação</th></tr></thead><tbody>${rows.map(s=>{const c=getClient(s.clientId);return `<tr><td><strong>${esc(shortDate(s.date))}</strong><span class="small-muted">${esc(s.time)}</span></td><td><strong>${esc(c?.name||'Cliente removido')}</strong><span class="small-muted">${esc(c?.address||'')}</span></td><td><span class="status ${isDone(s)?'done':'pending'}">${isDone(s)?'Concluída':'Pendente'}</span></td><td>${esc(s.fc||'—')}</td><td>${esc(s.ph||'—')}</td><td>${esc(s.chemicals||'—')}</td><td><button class="btn btn-secondary btn-small" data-action="log-service" data-id="${esc(s.id)}">${isDone(s)?'Abrir':'Registrar'}</button></td></tr>`;}).join('')}</tbody></table>${!rows.length?'<div class="empty">Nenhum registro para este filtro.</div>':''}</div></div>`;
  }
  function pageFinance(){
    const own=activeClients().filter(c=>c.source==='Própria');const subcontract=activeClients().filter(c=>c.source==='Subcontrato');const mrr=monthRevenue();const est=contractorEstimate();
    return heading('GESTÃO FINANCEIRA','Financeiro','Projeções operacionais — não substitui contabilidade.')+
      `<div class="stat-grid"><div class="stat-card"><div class="stat-top">MRR carteira própria <span class="stat-icon">＄</span></div><div class="stat-value">${money(mrr)}</div><div class="stat-caption">Soma de mensalidades ativas</div></div><div class="stat-card"><div class="stat-top">Subcontratos estimados <span class="stat-icon alt">＄</span></div><div class="stat-value">${money(est)}</div><div class="stat-caption">Repasse/visita × visitas por semana × 52/12</div></div><div class="stat-card"><div class="stat-top">Receita anual própria <span class="stat-icon gold">↗</span></div><div class="stat-value">${money(mrr*12)}</div><div class="stat-caption">Projeção bruta, sem cancelamentos</div></div><div class="stat-card"><div class="stat-top">Clientes próprios <span class="stat-icon">♧</span></div><div class="stat-value">${own.length}</div><div class="stat-caption">${subcontract.length} subcontratos cadastrados</div></div></div>
      <div class="split-two"><div class="panel"><div class="panel-top"><div><h3>Mensalidades próprias</h3><p>Receita recorrente bruta</p></div></div><div class="metric-pad">${own.map(c=>`<div class="metric-row"><span>${esc(c.name)}</span><strong>${money(c.monthlyRate)}</strong></div>`).join('')||'<p class="empty">Sem clientes próprios</p>'}<div class="metric-row" style="font-weight:800"><span>Total mensal</span><strong>${money(mrr)}</strong></div></div></div><div class="panel"><div class="panel-top"><div><h3>Subcontratos</h3><p>Estimativa de repasse, não MRR</p></div></div><div class="metric-pad">${subcontract.map(c=>`<div class="metric-row"><span>${esc(c.name)} <small>(${(c.serviceDays||[]).length}×/sem)</small></span><strong>${money(c.perVisitRate*(c.serviceDays||[]).length*52/12)}</strong></div>`).join('')||'<p class="empty">Sem subcontratos</p>'}<div class="metric-row" style="font-weight:800"><span>Total estimado</span><strong>${money(est)}</strong></div></div></div></div><p class="notice" style="margin-top:18px"><strong>Importante:</strong> valores de exemplo. Este protótipo não emite faturas, não confirma recebimentos e não deduz químicos, combustível, taxas ou impostos. A receita de subcontratos depende do número efetivo de visitas e de suas regras contratuais.</p>`;
  }
  function pageSettings(){return heading('PREFERÊNCIAS','Configurações','Dados armazenados exclusivamente neste navegador.')+
    `<div class="panel"><div class="panel-top"><div><h3>Dados e backups</h3><p>Controle de demonstração</p></div></div><div class="settings-list"><div class="settings-row"><div><strong>Exportar backup JSON</strong><p>Salva clientes, visitas e registros em um arquivo local.</p></div>${button('export','↓ Exportar','secondary')}</div><div class="settings-row"><div><strong>Importar backup</strong><p>Substitui os dados atuais por um arquivo exportado pelo aplicativo.</p></div><div><input type="file" id="importFile" accept="application/json,.json" hidden><button class="btn btn-secondary" data-action="import">↑ Importar</button></div></div><div class="settings-row"><div><strong>Restaurar demonstração</strong><p>Apaga todos os dados locais e recria exemplos fictícios.</p></div>${button('reset-demo','Restaurar dados','danger')}</div></div></div>
    <div class="panel" style="margin-top:20px"><div class="panel-top"><div><h3>Sobre esta versão</h3><p>Protótipo local · V1.0</p></div></div><div class="settings-list"><p class="note"><strong>ALYS Pool Services LLC</strong><br>alyspools.com · (954) 930-9259 · alyspools@gmail.com</p><div class="notice">⚠ Este é um protótipo sem login, sincronização, permissões ou backup automático. Os dados podem desaparecer ao limpar o navegador e não são compartilhados entre dispositivos. Para armazenar dados reais de clientes, implemente autenticação, banco de dados seguro e backups antes de usar em produção.</div></div></div>`;}
  function render(){
    ensureWeek(startOfWeek(today()));
    const labels={dashboard:'Visão geral',route:'Rotas & agenda',clients:'Clientes',history:'Histórico de serviços',finance:'Financeiro',settings:'Configurações'};
    $('#breadcrumbPage').textContent=labels[page]||'Visão geral';
    $('#todayLabel').textContent=new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
    $$('.nav-item[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
    const count=servicesOn(today()).filter(s=>!isDone(s)).length;$('#nav-todo').textContent=count?String(count):'';
    $('#content').innerHTML=({dashboard:pageDashboard,route:pageRoute,clients:pageClients,history:pageHistory,finance:pageFinance,settings:pageSettings}[page]||pageDashboard)();
  }
  function navigate(to){page=to;search='';$('#sidebar').classList.remove('open');$('#sidebarShade').classList.remove('visible');render();window.scrollTo({top:0,behavior:'instant'});}
  function showModal(title,body,actions){$('#modal-root').innerHTML=`<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-heading"><h2>${esc(title)}</h2><button class="icon-button" data-action="close-modal" aria-label="Fechar">✕</button></div>${body}<div class="modal-actions">${actions}</div></div></div>`;const first=$('#modal-root input:not([type=hidden]), #modal-root select');if(first)first.focus();}
  function closeModal(){$('#modal-root').innerHTML='';}
  function input(name,label,value='',type='text',required=false,extra=''){return `<div class="form-field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} ${extra}></div>`;}
  function newClientModal(client){
    const c=client||{name:'',address:'',type:'Residencial',source:'Própria',monthlyRate:140,perVisitRate:0,gallons:15000,sanitation:'Cloro',serviceDays:[4],active:true,email:'',phone:''};
    const days=(c.serviceDays||[]);
    showModal(client?'Editar cliente':'Adicionar cliente',`<form id="clientForm" class="modal-body"><input type="hidden" name="id" value="${esc(client?.id||'')}"><div class="form-grid"><div class="form-field full"><label>Nome / identificação *</label><input name="name" maxlength="100" required value="${esc(c.name)}" placeholder="Ex.: Residência Silva"></div><div class="form-field full"><label>Endereço / cidade *</label><input name="address" maxlength="200" required value="${esc(c.address)}" placeholder="Ex.: Pompano Beach, FL"></div>
    <div class="form-field"><label>Tipo de piscina</label><select name="type"><option ${c.type==='Residencial'?'selected':''}>Residencial</option><option ${c.type==='Comercial'?'selected':''}>Comercial</option></select></div><div class="form-field"><label>Origem do contrato</label><select name="source"><option ${c.source==='Própria'?'selected':''}>Própria</option><option ${c.source==='Subcontrato'?'selected':''}>Subcontrato</option></select></div>
    ${input('monthlyRate','Mensalidade própria (US$)',c.monthlyRate,'number',false,'min="0" step="0.01"')}${input('perVisitRate','Repasse por visita (US$)',c.perVisitRate,'number',false,'min="0" step="0.01"')}${input('gallons','Volume (galões)',c.gallons,'number',false,'min="0" step="1"')}
    <div class="form-field"><label>Tratamento</label><select name="sanitation"><option ${c.sanitation==='Cloro'?'selected':''}>Cloro</option><option ${c.sanitation==='Sal'?'selected':''}>Sal</option><option ${c.sanitation==='Outro'?'selected':''}>Outro</option></select></div>
    ${input('email','E-mail (opcional)',c.email,'email')}${input('phone','Telefone (opcional)',c.phone,'tel')}
    <div class="form-field full"><label>Dias recorrentes de visita</label><div style="display:flex;flex-wrap:wrap;gap:13px;padding:7px 0">${dayCodes.map((name,i)=>`<label style="display:flex;gap:5px;align-items:center;font-size:11px"><input style="width:auto;min-height:0" type="checkbox" name="serviceDays" value="${i}" ${days.includes(i)?'checked':''}> ${name}</label>`).join('')}</div></div>
    <div class="form-field full"><label style="display:flex;gap:8px;align-items:center"><input style="width:auto;min-height:0" type="checkbox" name="active" ${c.active?'checked':''}> Cliente ativo</label></div></div></form>`,`${button('close-modal','Cancelar','secondary')}<button class="btn btn-primary" type="submit" form="clientForm">${client?'Salvar alterações':'Cadastrar cliente'}</button>`);
  }
  function serviceModal(service){const s=service||{};const client=getClient(s.clientId);
    showModal(isDone(s)?'Editar registro de manutenção':'Registrar visita',`<form class="modal-body" id="serviceForm"><input type="hidden" name="id" value="${esc(s.id)}"><p style="margin:0 0 19px;font-size:12px"><strong>${esc(client?.name||'Piscina')}</strong><br><span class="note">${esc(fullDate(s.date))} · ${esc(client?.address||'')}</span></p><div class="form-grid">
    ${input('fc','Cloro livre (ppm)',s.fc,'number',false,'min="0" max="30" step="0.1"')}${input('ph','pH',s.ph,'number',false,'min="0" max="14" step="0.1"')}
    ${input('alkalinity','Alcalinidade (ppm)',s.alkalinity,'number',false,'min="0" max="500" step="1"')}${input('salt','Sal (ppm)',s.salt,'number',false,'min="0" max="10000" step="1"')}
    <div class="form-field full"><label>Químicos adicionados (produto e quantidade)</label><textarea name="chemicals" placeholder="Ex.: Cloro líquido 1 gal; ácido muriático 16 oz">${esc(s.chemicals||'')}</textarea></div><div class="form-field full"><label>Observações / manutenção</label><textarea name="notes" placeholder="Ex.: Escovação, filtro lavado, bomba funcionando...">${esc(s.notes||'')}</textarea></div></div><p class="note">Ao salvar, a visita ficará marcada como concluída. Fotos e envio automático serão adicionados na versão com banco de dados.</p></form>`,`${button('close-modal','Cancelar','secondary')}${isDone(s)?`<button class="btn btn-secondary" data-action="print-report" data-id="${esc(s.id)}">Imprimir relatório</button>`:''}<button class="btn btn-primary" type="submit" form="serviceForm">✓ Salvar serviço</button>`);
  }
  function newServiceModal(){showModal('Agendar uma visita',`<form id="newServiceForm" class="modal-body"><div class="form-grid"><div class="form-field full"><label>Cliente *</label><select required name="clientId">${activeClients().map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></div>${input('date','Data',routeDate,'date',true)}${input('time','Horário','09:00','time',true)}</div></form>`,`${button('close-modal','Cancelar','secondary')}<button class="btn btn-primary" type="submit" form="newServiceForm">Agendar visita</button>`);}
  function printReport(s){const c=getClient(s.clientId);if(!isDone(s)){toast('Conclua a visita antes de imprimir.');return;}const rows=[['Cliente',c?.name||''],['Endereço',c?.address||''],['Data',fullDate(s.date)],['Cloro livre',s.fc?s.fc+' ppm':'Não registrado'],['pH',s.ph||'Não registrado'],['Alcalinidade',s.alkalinity?s.alkalinity+' ppm':'Não registrada'],['Sal',s.salt?s.salt+' ppm':'Não registrado'],['Químicos aplicados',s.chemicals||'Nenhum registrado'],['Observações',s.notes||'—']];const body=`<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório ALYS</title><style>body{font-family:Arial,sans-serif;margin:44px;color:#1c3943}header{border-bottom:3px solid #0b948d;padding-bottom:14px;margin-bottom:28px}h1{font-size:24px;margin:0;color:#0b4e54}header p{margin:8px 0;color:#7f929b}h2{font-size:18px}table{border-collapse:collapse;width:100%}td{padding:13px 8px;border-bottom:1px solid #e4ecef;font-size:13px;vertical-align:top}td:first-child{font-weight:bold;width:32%;color:#55717a}.footer{font-size:11px;color:#7e959b;margin-top:40px}@media print{button{display:none}}</style></head><body><header><h1>≋ ALYS POOL SERVICES</h1><p>Relatório de manutenção · Dados demonstrativos</p></header><h2>Visita concluída</h2><table>${rows.map(([name,value])=>`<tr><td>${esc(name)}</td><td>${esc(value)}</td></tr>`).join('')}</table><div class="footer">ALYS Pool Services LLC · (954) 930-9259 · alyspools@gmail.com</div><p><button onclick="window.print()">Imprimir / Salvar PDF</button></p></body></html>`;const w=window.open('','_blank');if(!w){toast('Autorize pop-ups para abrir o relatório.');return;}w.document.open();w.document.write(body);w.document.close();}
  document.addEventListener('click',ev=>{
    const nav=ev.target.closest('[data-page]');if(nav){navigate(nav.dataset.page);return;}
    const el=ev.target.closest('[data-action]');if(!el)return;
    const action=el.dataset.action,id=el.dataset.id;
    if(action==='navigate-route')navigate('route');
    if(action==='new-client')newClientModal(null);
    if(action==='edit-client')newClientModal(getClient(id));
    if(action==='new-service')newServiceModal();
    if(action==='log-service'){const s=db.services.find(x=>x.id===id);if(s)serviceModal(s);}
    if(action==='close-modal')closeModal();
    if(action==='choose-day'){routeDate=el.dataset.date;render();}
    if(action==='prev-week'){routeDate=addDays(routeDate,-7);render();}
    if(action==='next-week'){routeDate=addDays(routeDate,7);render();}
    if(action==='print-report'){const s=db.services.find(x=>x.id===id);if(s)printReport(s);}
    if(action==='export'){const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`alys-pools-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup exportado com sucesso.');}
    if(action==='import')$('#importFile')?.click();
    if(action==='reset-demo'&&window.confirm('Apagar os dados armazenados neste navegador e restaurar a demonstração?')){db=seed();save();routeDate=today();render();toast('Demonstração restaurada.');}
  });
  document.addEventListener('submit',ev=>{
    if(ev.target.id==='clientForm'){
      ev.preventDefault();const f=new FormData(ev.target),id=String(f.get('id')||''),old=getClient(id);const days=f.getAll('serviceDays').map(Number).filter(x=>x>=0&&x<=6);
      const c={id:id||uid('c'),name:String(f.get('name')||'').trim(),address:String(f.get('address')||'').trim(),type:String(f.get('type')),source:String(f.get('source')),monthlyRate:Math.max(0,Number(f.get('monthlyRate'))||0),perVisitRate:Math.max(0,Number(f.get('perVisitRate'))||0),gallons:Math.max(0,Number(f.get('gallons'))||0),sanitation:String(f.get('sanitation')),email:String(f.get('email')||'').trim(),phone:String(f.get('phone')||'').trim(),serviceDays:days,active:f.get('active')==='on'};
      if(!c.name||!c.address){toast('Preencha nome e endereço.');return;}if(old){db.clients=db.clients.map(x=>x.id===id?c:x);}else{db.clients.push(c);}save();closeModal();render();toast(old?'Cliente atualizado.':'Cliente cadastrado.');
    }
    if(ev.target.id==='serviceForm'){
      ev.preventDefault();const f=new FormData(ev.target),s=db.services.find(x=>x.id===f.get('id'));if(!s)return;
      for(const k of ['fc','ph','alkalinity','salt','chemicals','notes'])s[k]=String(f.get(k)||'').trim();s.status='done';s.completedAt=new Date().toISOString();save();closeModal();render();toast('Manutenção registrada com sucesso.');
    }
    if(ev.target.id==='newServiceForm'){
      ev.preventDefault();const f=new FormData(ev.target),clientId=String(f.get('clientId')||''),date=String(f.get('date')||''),time=String(f.get('time')||'09:00');if(!getClient(clientId)||!/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('Preencha uma data e cliente válidos.');return;}
      if(db.services.some(s=>s.clientId===clientId&&s.date===date)){toast('Já existe uma visita desse cliente nesta data.');return;}
      db.services.push({id:uid('s'),clientId,date,time,status:'pending',fc:'',ph:'',alkalinity:'',salt:'',chemicals:'',notes:'',completedAt:''});save();closeModal();routeDate=date;page='route';render();toast('Visita agendada.');
    }
  });
  document.addEventListener('input',ev=>{if(ev.target.id==='clientSearch'){search=ev.target.value;const pos=ev.target.selectionStart;render();const x=$('#clientSearch');x.focus();x.setSelectionRange(pos,pos);}});
  document.addEventListener('change',async ev=>{
    if(ev.target.id==='clientFilter'){clientFilter=ev.target.value;render();}
    if(ev.target.id==='historyFilter'){historyFilter=ev.target.value;render();}
    if(ev.target.id==='importFile'){
      const file=ev.target.files?.[0];if(!file)return;
      if(file.size>2e6){toast('Backup grande demais (limite: 2 MB).');return;}
      try{const imported=JSON.parse(await file.text());if(imported.version!==1||!Array.isArray(imported.clients)||!Array.isArray(imported.services)||imported.clients.length>3000||imported.services.length>50000)throw Error('Esquema inválido');if(!window.confirm('Importar e substituir os dados atuais?'))return;db=imported;save();render();toast('Backup importado.');}catch(err){toast('Arquivo inválido ou incompatível.');}
    }
  });
  $('#menuToggle').addEventListener('click',()=>{$('#sidebar').classList.add('open');$('#sidebarShade').classList.add('visible');});
  $('#sidebarShade').addEventListener('click',()=>{$('#sidebar').classList.remove('open');$('#sidebarShade').classList.remove('visible');});
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeModal();});
  if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
  render();
})();
