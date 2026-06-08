import { fbUpsertEntry, fbReseedIfNeeded, fbListen, entryId } from './firebase.js';

// ── CONSTANTS ────────────────────────────────────────────
const SEED_VERSION = 'v7-reset';

const USERS = {
  bruna:      { name: 'Bruna',      role: 'agent', password: 'nickel123' },
  deisy:      { name: 'Deisy',      role: 'agent', password: 'nickel123' },
  rian:       { name: 'Rian',       role: 'agent', password: 'nickel123' },
  luis:       { name: 'Luís',       role: 'agent', password: 'nickel123' },
  jhonnathan: { name: 'Jhonnathan', role: 'agent', password: 'nickel123' },
  joao:       { name: 'João',       role: 'agent', password: 'nickel123' },
  felipe:     { name: 'Felipe',     role: 'agent', password: 'nickel123' },
  karen:      { name: 'Karen',      role: 'agent', password: 'nickel123' },
  matheus:    { name: 'Matheus',    role: 'gestor', password: 'nickel123' },
};

const TIPOS   = ['Casa', 'Apto', 'Terreno', 'Comercial'];
const BAIRROS = ['Batel','Água Verde','Bigorrilho','Ecoville','Cabral','Juvevê','Mercês','Campo Comprido','Santa Felicidade','Santo Inácio','Vila Izabel'];
const META_DOC = 1;
const TIPO_COLORS = {
  Casa:      { bg:'rgba(201,168,76,.8)',  border:'#c9a84c' },
  Apto:      { bg:'rgba(100,149,237,.8)', border:'#6495ed' },
  Terreno:   { bg:'rgba(46,204,113,.8)',  border:'#2ecc71' },
  Comercial: { bg:'rgba(230,126,34,.8)',  border:'#e67e22' },
};
const PODIUM       = ['','gold','silver','bronze'];
const PODIUM_LABEL = ['','🥇','🥈','🥉'];

// ── SEED DATA (v5 — banco limpo, sem dados pré-carregados)
const SEED = [];

// ── LOCAL CACHE ──────────────────────────────────────────
function getEntries()         { return JSON.parse(localStorage.getItem('nickel_entries')||'[]'); }
function saveEntries(entries) { localStorage.setItem('nickel_entries', JSON.stringify(entries)); }

function localUpsert(entry) {
  const entries = getEntries();
  const idx = entries.findIndex(e => e.date===entry.date && e.agent===entry.agent);
  if (idx>=0) entries[idx]=entry; else entries.push(entry);
  saveEntries(entries);
}

async function upsertEntry(entry) {
  localUpsert(entry);
  await fbUpsertEntry(entry);
}

async function deleteDocDetail(date, agent, docIdx) {
  const entries = getEntries();
  const entry = entries.find(e => e.date===date && e.agent===agent);
  if (!entry) return;
  entry.docDetails = (entry.docDetails||[]).filter((_,i)=>i!==docIdx);
  entry.doc = Math.max(0, entry.doc-1);
  localUpsert(entry);
  await fbUpsertEntry(entry);
}

async function updateDocNota(date, agent, docIdx, nota) {
  const entries = getEntries();
  const entry = entries.find(e => e.date===date && e.agent===agent);
  if (!entry || !entry.docDetails[docIdx]) return;
  entry.docDetails[docIdx].nota = nota;
  localUpsert(entry);
  await fbUpsertEntry(entry);
}

// ── EDIT COUNT ───────────────────────────────────────────
function getEditCounts()           { return JSON.parse(localStorage.getItem('nickel_edit_count')||'{}'); }
function getEditCount(name, date)  { return getEditCounts()[name+'_'+date]||0; }
function incrementEditCount(name, date) {
  const c=getEditCounts(); c[name+'_'+date]=(c[name+'_'+date]||0)+1;
  localStorage.setItem('nickel_edit_count', JSON.stringify(c));
}
function resetEditCount(name, date) {
  const c=getEditCounts(); delete c[name+'_'+date];
  localStorage.setItem('nickel_edit_count', JSON.stringify(c));
}

// ── SESSION ──────────────────────────────────────────────
function getSession()     { return JSON.parse(localStorage.getItem('nickel_session')||'null'); }
function setSession(u)    { localStorage.setItem('nickel_session', JSON.stringify(u)); }
function clearSession()   { localStorage.removeItem('nickel_session'); }

// ── DATE UTILS ───────────────────────────────────────────
function today()       { return new Date().toISOString().split('T')[0]; }
function toDateStr(d)  { return d.toISOString().split('T')[0]; }
function weekRange(ref) {
  const d=new Date(ref+'T12:00:00'), day=d.getDay(), diff=day===0?-6:1-day;
  const mon=new Date(d); mon.setDate(d.getDate()+diff);
  const sun=new Date(mon); sun.setDate(mon.getDate()+6);
  return { start:toDateStr(mon), end:toDateStr(sun) };
}
function monthRange(ref) {
  const d=new Date(ref+'T12:00:00');
  const start=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
  return { start, end:toDateStr(new Date(d.getFullYear(),d.getMonth()+1,0)) };
}
function inRange(s,a,b)   { return s>=a && s<=b; }
function formatDate(s)    { const [y,m,d]=s.split('-'); return `${d}/${m}/${y}`; }
function formatCurrency(v){ return (v&&v>0)?'R$ '+Number(v).toLocaleString('pt-BR'):'—'; }

// Week days from Monday to yesterday (for missed-days check)
function weekDaysBefore(ref) {
  const { start } = weekRange(ref);
  const days = [];
  let cur = new Date(start+'T12:00:00');
  const yesterday = new Date(ref+'T12:00:00'); yesterday.setDate(yesterday.getDate()-1);
  while (toDateStr(cur) <= toDateStr(yesterday)) {
    days.push(toDateStr(cur));
    cur.setDate(cur.getDate()+1);
  }
  return days;
}

// ── FILTER / AGGREGATE ───────────────────────────────────
function filterEntries(period, ref) {
  const entries=getEntries(), t=ref||today();
  if (period==='today') return entries.filter(e=>e.date===t);
  if (period==='week')  { const r=weekRange(t);  return entries.filter(e=>inRange(e.date,r.start,r.end)); }
  if (period==='month') { const r=monthRange(t); return entries.filter(e=>inRange(e.date,r.start,r.end)); }
  return entries;
}
function sumByAgent(entries) {
  const map={};
  entries.forEach(e=>{ if(!map[e.agent]) map[e.agent]={agent:e.agent,prosp:0,cpd:0,doc:0}; map[e.agent].prosp+=e.prosp; map[e.agent].cpd+=e.cpd; map[e.agent].doc+=e.doc; });
  return Object.values(map);
}
function calcStreak(agentName) {
  const days=[...new Set(getEntries().filter(e=>e.agent===agentName).map(e=>e.date))].sort().reverse();
  let streak=0, cursor=new Date(today()+'T12:00:00');
  for (const d of days) { if(d===toDateStr(cursor)){streak++;cursor.setDate(cursor.getDate()-1);}else break; }
  return streak;
}

// ── STREAK VISUAL ────────────────────────────────────────
function renderStreak(agentName, entries) {
  const streak = calcStreak(agentName);
  const sentDates = new Set(entries.map(e => e.date));
  const t = today(); // local scope

  // last 7 days dots
  const dots = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(t + 'T12:00:00');
    d.setDate(d.getDate() - i);
    const ds = toDateStr(d);
    const sent = sentDates.has(ds);
    const isToday = ds === t;
    dots.push({ ds, sent, isToday });
  }

  // color tier
  let color, label, emoji;
  if (streak === 0)       { color='#555';     emoji='💤'; label='Nenhum dia seguido ainda'; }
  else if (streak < 3)    { color='#cd7f32';  emoji='🔥'; label=`${streak} dia${streak>1?'s':''} seguido${streak>1?'s':''}!`; }
  else if (streak < 7)    { color='#aaa';     emoji='🔥'; label=`${streak} dias seguidos! Bom ritmo!`; }
  else if (streak < 14)   { color='#c9a84c';  emoji='🔥'; label=`${streak} dias seguidos! Incrível!`; }
  else if (streak < 30)   { color='#6495ed';  emoji='🔥'; label=`${streak} dias seguidos! Elite!`; }
  else                    { color='#2ecc71';  emoji='🏆'; label=`${streak} dias seguidos! Lendário!`; }

  // check if yesterday was missed (streak broken)
  const yesterday = new Date(t+'T12:00:00'); yesterday.setDate(yesterday.getDate()-1);
  const missedYesterday = !sentDates.has(toDateStr(yesterday)) && streak === 0 && entries.length > 0;

  const dotsHTML = dots.map(d => `
    <div class="streak-dot ${d.sent?'sent':''} ${d.isToday?'today':''}" title="${formatDate(d.ds)}">
      ${d.sent ? '🔥' : d.isToday ? '◯' : '✕'}
    </div>`).join('');

  document.getElementById('streak-wrap').innerHTML = `
    <div class="streak-hero" style="--streak-color:${color}">
      <div class="streak-fire">${emoji}</div>
      <div class="streak-number" style="color:${color}">${streak}</div>
      <div class="streak-label">${label}</div>
      ${missedYesterday ? '<div class="streak-broken">Sequência zerada — não enviou ontem 😢</div>' : ''}
    </div>
    <div class="streak-dots">${dotsHTML}</div>
    <div class="streak-hint">Últimos 7 dias</div>`;
}

// ── BAIRRO SELECT BINDING ────────────────────────────────
function bindBairroSelects() {
  document.querySelectorAll('.doc-bairro-sel').forEach(sel => {
    sel.addEventListener('change', function() {
      const outro = document.querySelector(`.doc-bairro-outro[data-idx="${this.dataset.idx}"]`);
      if (!outro) return;
      outro.style.display = this.value==='__outro__' ? 'block' : 'none';
    });
  });
}

// ── DOC FORM BUILDER (agent — no nota field) ─────────────
function buildDocDetailsHTML(count, prefill) {
  if (count===0) return '';
  let html=`<div class="doc-details-wrap"><div class="doc-details-title">Detalhes dos ${count} DOC${count>1?'s':''}</div>`;
  for (let i=0; i<count; i++) {
    const pre=(prefill&&prefill[i])?prefill[i]:{nome:'',valor:'',bairro:'',tipo:''};
    html+=`
    <div class="doc-detail-card">
      <div class="doc-detail-num">DOC ${i+1}</div>
      <div class="form-group">
        <label>Nome do proprietário</label>
        <input type="text" class="doc-nome" data-idx="${i}" placeholder="Ex: João Silva" value="${pre.nome||''}" required>
      </div>
      <div class="doc-detail-row2">
        <div class="form-group">
          <label>Valor — digite completo (ex: 450000)</label>
          <input type="number" class="doc-valor" data-idx="${i}" placeholder="Ex: 450000" min="0" value="${pre.valor||''}">
        </div>
        <div class="form-group">
          <label>Bairro</label>
          <select class="doc-bairro-sel" data-idx="${i}" required>
            <option value="">Selecione</option>
            ${BAIRROS.map(b=>`<option value="${b}" ${pre.bairro===b?'selected':''}>${b}</option>`).join('')}
            <option value="__outro__" ${pre.bairro&&!BAIRROS.includes(pre.bairro)?'selected':''}>Outro...</option>
          </select>
          <input type="text" class="doc-bairro doc-bairro-outro" data-idx="${i}" placeholder="Digite o bairro"
            value="${pre.bairro&&!BAIRROS.includes(pre.bairro)?pre.bairro:''}"
            style="margin-top:6px;display:${pre.bairro&&!BAIRROS.includes(pre.bairro)?'block':'none'}">
        </div>
        <div class="form-group">
          <label>Tipo</label>
          <select class="doc-tipo" data-idx="${i}" required>
            <option value="">Selecione</option>
            ${TIPOS.map(t=>`<option value="${t}" ${pre.tipo===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>`;
  }
  return html+'</div>';
}

function collectDocDetails(count) {
  const details=[];
  for (let i=0; i<count; i++) {
    const sel=document.querySelector(`.doc-bairro-sel[data-idx="${i}"]`);
    const outro=document.querySelector(`.doc-bairro-outro[data-idx="${i}"]`);
    const bairro=sel?.value==='__outro__'?(outro?.value.trim()||''):(sel?.value||'');
    details.push({
      nome:  document.querySelector(`.doc-nome[data-idx="${i}"]`)?.value.trim()||'',
      valor: parseFloat(document.querySelector(`.doc-valor[data-idx="${i}"]`)?.value)||0,
      bairro,
      tipo:  document.querySelector(`.doc-tipo[data-idx="${i}"]`)?.value||'',
      nota:  '',
    });
  }
  return details;
}

// ── LOGIN PAGE ───────────────────────────────────────────
async function initLogin() {
  const s=getSession();
  if (s) { window.location.href=s.role==='gestor'?'dashboard-gestor.html':'dashboard-agente.html'; return; }

  document.getElementById('loading-msg').style.display='block';
  localStorage.removeItem('nickel_entries'); // clear stale cache before reseed
  await fbReseedIfNeeded(SEED, SEED_VERSION);
  document.getElementById('loading-msg').style.display='none';

  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const username=document.getElementById('username').value.trim().toLowerCase();
    const password=document.getElementById('password').value;
    const errEl=document.getElementById('login-error');
    const user=USERS[username];
    if (!user||user.password!==password) { errEl.textContent='Usuário ou senha incorretos.'; return; }
    setSession({ username, name:user.name, role:user.role });
    window.location.href=user.role==='gestor'?'dashboard-gestor.html':'dashboard-agente.html';
  });
}

// ── AGENT DASHBOARD ──────────────────────────────────────
let agentUnsubscribe=null;

function initAgentDashboard() {
  const session=getSession();
  if (!session||session.role!=='agent') { window.location.href='index.html'; return; }
  document.getElementById('agent-name').textContent=session.name;
  document.getElementById('logout-btn').addEventListener('click', ()=>{ if(agentUnsubscribe)agentUnsubscribe(); clearSession(); window.location.href='index.html'; });

  agentUnsubscribe=fbListen(entries=>{
    saveEntries(entries);
    const dp=document.getElementById('selected-date');
    renderAgentDashboard(session, dp?.value||today());
  });
}

function renderAgentDashboard(session, selectedDate, editing) {
  const t=today();
  const date = selectedDate || t;
  const { start:wStart, end:wEnd }=weekRange(t);
  const entries=getEntries().filter(e=>e.agent===session.name);
  const weekDoc=entries.filter(e=>inRange(e.date,wStart,wEnd)).reduce((s,e)=>s+e.doc,0);
  const sentToday=entries.find(e=>e.date===date);
  const editCount=getEditCount(session.name,date);
  const canEdit=editCount<2;

  document.getElementById('doc-week-num').textContent=weekDoc;
  document.getElementById('doc-week-meta').textContent=`Meta: ${META_DOC} DOC`;
  document.getElementById('doc-week-range').textContent=`${formatDate(wStart)} – ${formatDate(wEnd)}`;

  // date picker
  const datePicker = document.getElementById('selected-date');
  if (datePicker) {
    datePicker.max = t;
    if (datePicker.value !== date) datePicker.value = date;
    if (!datePicker._bound) {
      datePicker._bound = true;
      datePicker.addEventListener('change', () => renderAgentDashboard(session, datePicker.value));
    }
  }

  const statusEl=document.getElementById('week-status');
  statusEl.style.display='flex';
  if (weekDoc>=META_DOC) {
    statusEl.className='status-badge green';
    statusEl.innerHTML=`<span class="status-icon">✓</span><span>Meta da semana atingida — ${META_DOC} DOC</span>`;
  } else {
    const faltam=META_DOC-weekDoc;
    statusEl.className='status-badge red';
    statusEl.innerHTML=`<span class="status-icon">!</span><span>Falta${faltam>1?'m':''} <strong>${faltam} DOC</strong> para atingir a meta desta semana</span>`;
  }

  renderStreak(session.name, entries);

  // Alerta de dias não enviados na semana
  const missedEl=document.getElementById('missed-days-alert');
  const pastDays=weekDaysBefore(t);
  const missed=pastDays.filter(d=>!entries.find(e=>e.date===d));
  if (missed.length>0) {
    missedEl.style.display='flex';
    missedEl.innerHTML=`<span class="status-icon">⚠</span><span>Relatório não enviado em: <strong>${missed.map(formatDate).join(', ')}</strong>. Fale com o gestor para registrar.</span>`;
  } else {
    missedEl.style.display='none';
  }

  const formWrap=document.getElementById('form-wrap');
  if (sentToday&&!editing) {
    const docSummary=(sentToday.docDetails||[]).map((d,i)=>
      `<div class="doc-summary-item">DOC ${i+1}: <strong>${d.nome||'—'}</strong> · ${d.tipo||'—'} · ${d.bairro||'—'} · ${formatCurrency(d.valor)}</div>`
    ).join('');
    const editBtn=canEdit
      ?`<button class="btn btn-outline" id="edit-today-btn" style="margin-top:14px;font-size:13px;padding:9px">Corrigir lançamento de ${formatDate(date)}</button>`
      :`<div style="margin-top:14px;padding:10px 14px;background:rgba(224,62,62,.08);border:1px solid rgba(224,62,62,.25);border-radius:8px;font-size:12px;color:#ff6b6b;text-align:center">Correções esgotadas. Para nova alteração, fale com o gestor.</div>`;
    formWrap.innerHTML=`
      <div class="sent-today">
        <div style="font-size:24px;margin-bottom:6px">✓</div>
        <div style="font-weight:600;color:#f0f0f0">Relatório de ${formatDate(date)} enviado</div>
        <div style="font-size:13px;margin-top:6px;color:var(--text-muted)">PROSP <strong style="color:#f0f0f0">${sentToday.prosp}</strong> &nbsp;·&nbsp; CPD <strong style="color:#f0f0f0">${sentToday.cpd}</strong> &nbsp;·&nbsp; DOC <strong style="color:#f0f0f0">${sentToday.doc}</strong></div>
        ${docSummary?`<div class="doc-summary-list">${docSummary}</div>`:''}
        ${editBtn}
      </div>`;
    if (canEdit) document.getElementById('edit-today-btn').addEventListener('click',()=>renderAgentDashboard(session,date,true));
  } else {
    const pre=sentToday||{prosp:0,cpd:0,doc:0,docDetails:[]};
    const isFuture = date > t;
    if (isFuture) {
      formWrap.innerHTML=`<div class="sent-today" style="color:var(--text-muted);font-size:13px">Não é possível lançar para datas futuras.</div>`;
    } else {
      formWrap.innerHTML=`
        <form class="daily-form" id="daily-form">
          ${sentToday?`<div style="font-size:12px;color:var(--gold);margin-bottom:12px;text-align:center">Editando lançamento de ${formatDate(date)}</div>`:''}
          <div class="fields-row">
            <div class="field-box"><label>PROSP</label><input type="number" id="f-prosp" min="0" value="${pre.prosp}" required></div>
            <div class="field-box"><label>CPD</label><input type="number" id="f-cpd" min="0" value="${pre.cpd}" required></div>
            <div class="field-box"><label>DOC</label><input type="number" id="f-doc" min="0" value="${pre.doc}" required></div>
          </div>
          <div id="doc-details-area">${buildDocDetailsHTML(pre.doc||0,pre.docDetails)}</div>
          <button type="submit" class="btn" style="margin-top:14px">${sentToday?'Salvar correção':'Enviar relatório'}</button>
          ${sentToday?'<button type="button" class="btn btn-outline" id="cancel-edit-btn" style="margin-top:8px">Cancelar</button>':''}
        </form>`;
      document.getElementById('f-doc').addEventListener('input',function(){
        document.getElementById('doc-details-area').innerHTML=buildDocDetailsHTML(Math.max(0,parseInt(this.value)||0),[]);
        bindBairroSelects();
      });
      bindBairroSelects();
      document.getElementById('daily-form').addEventListener('submit',async ev=>{
        ev.preventDefault();
        const docVal=parseInt(document.getElementById('f-doc').value)||0;
        const docDetails=collectDocDetails(docVal);
        for (let i=0;i<docDetails.length;i++) { if(!docDetails[i].nome||!docDetails[i].bairro||!docDetails[i].tipo){alert(`Preencha todos os campos obrigatórios do DOC ${i+1}.`);return;} }
        const isEdit=!!sentToday;
        const btn=ev.target.querySelector('[type="submit"]'); btn.disabled=true; btn.textContent='Enviando...';
        await upsertEntry({date,agent:session.name,prosp:parseInt(document.getElementById('f-prosp').value)||0,cpd:parseInt(document.getElementById('f-cpd').value)||0,doc:docVal,docDetails});
        if (isEdit) incrementEditCount(session.name,date);
      });
      const cancelBtn=document.getElementById('cancel-edit-btn');
      if (cancelBtn) cancelBtn.addEventListener('click',()=>renderAgentDashboard(session,date));
    }
  }

  const historyBody=document.getElementById('history-body');
  const sorted=[...entries].sort((a,b)=>b.date.localeCompare(a.date));
  historyBody.innerHTML=sorted.length===0
    ?'<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">Nenhum registro</td></tr>'
    :sorted.map(e=>`<tr><td>${formatDate(e.date)}</td><td class="num-cell">${e.prosp}</td><td class="num-cell">${e.cpd}</td><td class="num-cell">${e.doc}</td></tr>`).join('');
}

// ── GESTOR DASHBOARD ─────────────────────────────────────
let gestorChart=null, docStatusChart=null, analyticsChart=null;
let activePeriod='week', activeConvMode='prosp-cpd', activeAnalyticsMode='tipo';
let gestorUnsubscribe=null;

function initGestorDashboard() {
  const session=getSession();
  if (!session||session.role!=='gestor') { window.location.href='index.html'; return; }
  document.getElementById('gestor-name').textContent=session.name;
  document.getElementById('logout-btn').addEventListener('click',()=>{ if(gestorUnsubscribe)gestorUnsubscribe(); clearSession(); window.location.href='index.html'; });
  document.querySelectorAll('.filter-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{ activePeriod=btn.dataset.period; document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderGestorDashboard(); });
  });
  gestorUnsubscribe=fbListen(async entries=>{
    saveEntries(entries);
    await fixSmallValues(entries);
    renderGestorDashboard();
    renderDayView(document.getElementById('day-input')?.value||today());
  });
  initDayView();
  initExport();
  initGestorLancamento();
}

// Corrige valores digitados sem os zeros (ex: 2890 → 2890000)
// Roda uma vez por sessão de gestor
let _valorFixRan = false;
async function fixSmallValues(entries) {
  if (_valorFixRan) return;
  _valorFixRan = true;
  for (const entry of entries) {
    if (!entry.docDetails?.length) continue;
    let changed = false;
    entry.docDetails.forEach(d => {
      if (d.valor > 0 && d.valor < 50000) { d.valor = d.valor * 1000; changed = true; }
    });
    if (changed) { localUpsert(entry); await fbUpsertEntry(entry); }
  }
}

function initGestorLancamento() {
  const agentNames=Object.keys(USERS).filter(k=>USERS[k].role==='agent').map(k=>USERS[k].name);
  const agentSel=document.getElementById('lanc-agent');
  agentNames.forEach(n=>{ const o=document.createElement('option'); o.value=n; o.textContent=n; agentSel.appendChild(o); });

  const dateInput=document.getElementById('lanc-date');
  dateInput.value=today(); dateInput.max=today();

  document.getElementById('lanc-doc').addEventListener('input',function(){
    document.getElementById('lanc-doc-details').innerHTML=buildDocDetailsHTML(Math.max(0,parseInt(this.value)||0),[]);
    bindBairroSelects();
  });

  document.getElementById('gestor-lanc-form').addEventListener('submit',async ev=>{
    ev.preventDefault();
    const agent=agentSel.value, date=dateInput.value;
    if (!agent||!date) return;
    const docVal=parseInt(document.getElementById('lanc-doc').value)||0;
    const docDetails=collectDocDetails(docVal);
    for (let i=0;i<docDetails.length;i++) { if(!docDetails[i].nome||!docDetails[i].bairro||!docDetails[i].tipo){alert(`Preencha todos os campos obrigatórios do DOC ${i+1}.`);return;} }
    const btn=ev.target.querySelector('[type="submit"]'); btn.disabled=true; btn.textContent='Salvando...';
    await upsertEntry({date,agent,prosp:parseInt(document.getElementById('lanc-prosp').value)||0,cpd:parseInt(document.getElementById('lanc-cpd').value)||0,doc:docVal,docDetails});
    resetEditCount(agent,date);
    btn.disabled=false; btn.textContent='Salvar lançamento';
    // reset form
    document.getElementById('lanc-prosp').value=0;
    document.getElementById('lanc-cpd').value=0;
    document.getElementById('lanc-doc').value=0;
    document.getElementById('lanc-doc-details').innerHTML='';
    dateInput.value=today();
  });
}

function renderStreakRanking() {
  const agentNames = Object.keys(USERS).filter(k=>USERS[k].role==='agent').map(k=>USERS[k].name);
  const streaks = agentNames.map(name => ({ name, streak: calcStreak(name) }))
    .sort((a,b) => b.streak - a.streak);

  const wrap = document.getElementById('streak-ranking');
  if (!wrap) return;

  wrap.innerHTML = streaks.map((s, i) => {
    let emoji, color;
    if      (s.streak === 0) { emoji='💤'; color='#555'; }
    else if (s.streak < 3)   { emoji='🔥'; color='#cd7f32'; }
    else if (s.streak < 7)   { emoji='🔥'; color='#aaa'; }
    else if (s.streak < 14)  { emoji='🔥'; color='#c9a84c'; }
    else if (s.streak < 30)  { emoji='🔥'; color='#6495ed'; }
    else                     { emoji='🏆'; color='#2ecc71'; }
    const pos = i+1;
    const medal = pos===1?'🥇':pos===2?'🥈':pos===3?'🥉':'';
    return `<div class="srr">
      <span class="srr-pos">${medal||pos}</span>
      <span class="srr-name">${s.name}</span>
      <span class="srr-val" style="color:${color}">${emoji} ${s.streak}d</span>
    </div>`;
  }).join('');
}

function renderGestorDashboard() {
  const entries=filterEntries(activePeriod);
  const byAgent=sumByAgent(entries);
  const agentNames=Object.keys(USERS).filter(k=>USERS[k].role==='agent').map(k=>USERS[k].name);

  const totProsp=byAgent.reduce((s,a)=>s+a.prosp,0), totCpd=byAgent.reduce((s,a)=>s+a.cpd,0), totDoc=byAgent.reduce((s,a)=>s+a.doc,0);
  document.getElementById('tot-prosp').textContent=totProsp;
  document.getElementById('tot-cpd').textContent=totCpd;
  document.getElementById('tot-doc').textContent=totDoc;

  const ranked=[...byAgent].sort((a,b)=>b.doc!==a.doc?b.doc-a.doc:b.cpd!==a.cpd?b.cpd-a.cpd:b.prosp-a.prosp);
  document.getElementById('rank-body').innerHTML=ranked.map((a,i)=>{
    const pos=i+1;
    return `<tr class="${pos<=3?'podium-row podium-'+pos:''}"><td><span class="rank-badge ${pos<=3?PODIUM[pos]:''}">${pos<=3?PODIUM_LABEL[pos]:pos}</span></td><td>${a.agent}</td><td class="num-cell doc-cell">${a.doc}</td><td class="num-cell">${a.cpd}</td><td class="num-cell dim-cell">${a.prosp}</td></tr>`;
  }).join('');

  const agentMap={}; byAgent.forEach(a=>{agentMap[a.agent]=a;});
  const ctx=document.getElementById('team-chart').getContext('2d');
  if (gestorChart) gestorChart.destroy();
  gestorChart=new Chart(ctx,{type:'bar',data:{labels:agentNames,datasets:[
    {label:'PROSP',data:agentNames.map(n=>agentMap[n]?.prosp||0),backgroundColor:'rgba(201,168,76,.45)',borderColor:'#c9a84c',borderWidth:1},
    {label:'CPD',  data:agentNames.map(n=>agentMap[n]?.cpd  ||0),backgroundColor:'rgba(100,149,237,.45)',borderColor:'#6495ed',borderWidth:1},
    {label:'DOC',  data:agentNames.map(n=>agentMap[n]?.doc  ||0),backgroundColor:'rgba(46,204,113,.7)', borderColor:'#2ecc71',borderWidth:1},
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#888',font:{family:'DM Sans',size:12}}}},scales:{x:{ticks:{color:'#888',font:{family:'DM Sans',size:11}},grid:{color:'#1a1a1a'}},y:{ticks:{color:'#888',font:{family:'DM Sans'}},grid:{color:'#1a1a1a'},beginAtZero:true}}}});

  const {start:wStart,end:wEnd}=weekRange(today());
  const weekDocMap={};
  getEntries().filter(e=>inRange(e.date,wStart,wEnd)).forEach(e=>{weekDocMap[e.agent]=(weekDocMap[e.agent]||0)+e.doc;});
  const docCtx=document.getElementById('doc-status-chart').getContext('2d');
  if (docStatusChart) docStatusChart.destroy();
  docStatusChart=new Chart(docCtx,{type:'bar',data:{labels:agentNames,datasets:[{label:'DOC na semana',data:agentNames.map(n=>weekDocMap[n]||0),backgroundColor:agentNames.map(n=>(weekDocMap[n]||0)>=META_DOC?'rgba(46,204,113,.8)':'rgba(224,62,62,.7)'),borderColor:agentNames.map(n=>(weekDocMap[n]||0)>=META_DOC?'#2ecc71':'#e03e3e'),borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#888',font:{family:'DM Sans',size:11}},grid:{color:'#1a1a1a'}},y:{ticks:{color:'#888',font:{family:'DM Sans'},stepSize:1},grid:{color:'#1a1a1a'},beginAtZero:true}}}});

  const allDocs=entries.flatMap(e=>e.docDetails||[]);
  renderStreakRanking();
  renderDocList(entries);
  renderAnalyticsChart(allDocs);

  document.querySelectorAll('.analytics-btn').forEach(b=>{
    b.onclick=()=>{ activeAnalyticsMode=b.dataset.mode; document.querySelectorAll('.analytics-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); renderAnalyticsChart(allDocs); };
    b.classList.toggle('active',b.dataset.mode===activeAnalyticsMode);
  });
  renderConversion(ranked);
  document.querySelectorAll('.conv-mode-btn').forEach(b=>{
    b.onclick=()=>{ activeConvMode=b.dataset.mode; document.querySelectorAll('.conv-mode-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); renderConversion(ranked); };
    b.classList.toggle('active',b.dataset.mode===activeConvMode);
  });
}

function renderAnalyticsChart(allDocs) {
  const ctx=document.getElementById('tipo-chart').getContext('2d');
  if (analyticsChart) analyticsChart.destroy();
  document.getElementById('analytics-empty').style.display=allDocs.length===0?'block':'none';
  if (allDocs.length===0) return;
  const mode=activeAnalyticsMode;
  const base={responsive:true,maintainAspectRatio:false};
  const scalesXY={x:{ticks:{color:'#888',font:{family:'DM Sans',size:11}},grid:{color:'#1a1a1a'}},y:{ticks:{color:'#888',font:{family:'DM Sans'}},grid:{color:'#1a1a1a'},beginAtZero:true}};

  if (mode==='tipo') {
    const c={}; TIPOS.forEach(t=>c[t]=0); allDocs.forEach(d=>{if(d.tipo)c[d.tipo]=(c[d.tipo]||0)+1;});
    analyticsChart=new Chart(ctx,{type:'doughnut',data:{labels:TIPOS,datasets:[{data:TIPOS.map(t=>c[t]),backgroundColor:TIPOS.map(t=>TIPO_COLORS[t].bg),borderColor:TIPOS.map(t=>TIPO_COLORS[t].border),borderWidth:2}]},options:{...base,plugins:{legend:{position:'bottom',labels:{color:'#888',font:{family:'DM Sans',size:12},padding:16}}}}});
  } else if (mode==='bairro') {
    const c={}; allDocs.forEach(d=>{if(d.bairro)c[d.bairro]=(c[d.bairro]||0)+1;});
    const sorted=Object.entries(c).sort((a,b)=>b[1]-a[1]);
    const palette=['rgba(201,168,76,.7)','rgba(100,149,237,.7)','rgba(46,204,113,.7)','rgba(230,126,34,.7)','rgba(231,76,60,.7)','rgba(155,89,182,.7)','rgba(52,152,219,.7)','rgba(26,188,156,.7)','rgba(241,196,15,.7)','rgba(189,195,199,.7)','rgba(127,140,141,.7)'];
    const palBorder=['#c9a84c','#6495ed','#2ecc71','#e67e22','#e74c3c','#9b59b6','#3498db','#1abc9c','#f1c40f','#bdc3c7','#7f8c8d'];
    analyticsChart=new Chart(ctx,{type:'bar',data:{labels:sorted.map(x=>x[0]),datasets:[{label:'DOCs',data:sorted.map(x=>x[1]),backgroundColor:sorted.map((_,i)=>palette[i%palette.length]),borderColor:sorted.map((_,i)=>palBorder[i%palBorder.length]),borderWidth:1}]},options:{...base,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{...scalesXY.x,ticks:{...scalesXY.x.ticks,stepSize:1},beginAtZero:true},y:scalesXY.y}}});
  } else if (mode==='valor') {
    const s={}; TIPOS.forEach(t=>s[t]=0); allDocs.forEach(d=>{if(d.tipo&&d.valor)s[d.tipo]=(s[d.tipo]||0)+Number(d.valor);});
    analyticsChart=new Chart(ctx,{type:'bar',data:{labels:TIPOS,datasets:[{data:TIPOS.map(t=>s[t]),backgroundColor:TIPOS.map(t=>TIPO_COLORS[t].bg),borderColor:TIPOS.map(t=>TIPO_COLORS[t].border),borderWidth:1}]},options:{...base,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'R$ '+Number(c.raw).toLocaleString('pt-BR')}}},scales:{...scalesXY,y:{...scalesXY.y,ticks:{...scalesXY.y.ticks,callback:v=>'R$'+(v>=1000?(v/1000).toFixed(0)+'k':v)}}}}});
  } else if (mode==='ticket') {
    const s={},c2={}; TIPOS.forEach(t=>{s[t]=0;c2[t]=0;}); allDocs.forEach(d=>{if(d.tipo&&d.valor>0){s[d.tipo]=(s[d.tipo]||0)+Number(d.valor);c2[d.tipo]=(c2[d.tipo]||0)+1;}});
    const tickets=TIPOS.map(t=>c2[t]>0?Math.round(s[t]/c2[t]):0);
    analyticsChart=new Chart(ctx,{type:'bar',data:{labels:TIPOS,datasets:[{data:tickets,backgroundColor:TIPOS.map(t=>TIPO_COLORS[t].bg),borderColor:TIPOS.map(t=>TIPO_COLORS[t].border),borderWidth:1}]},options:{...base,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'R$ '+Number(c.raw).toLocaleString('pt-BR')}}},scales:{...scalesXY,y:{...scalesXY.y,ticks:{...scalesXY.y.ticks,callback:v=>'R$'+(v>=1000?(v/1000).toFixed(0)+'k':v)}}}}});
  }
}

// ── DOC LIST (gestor — with inline nota edit) ────────────
let activeDocAgent = '';

function renderDocList(entries) {
  const allRows=[];
  entries.forEach(e=>(e.docDetails||[]).forEach((d,i)=>allRows.push({date:e.date,agent:e.agent,idx:i,...d})));
  allRows.sort((a,b)=>b.date.localeCompare(a.date));

  const wrap=document.getElementById('doc-list-wrap');

  // build/keep filter
  const agentNames=Object.keys(USERS).filter(k=>USERS[k].role==='agent').map(k=>USERS[k].name);
  const filterHTML=`<div style="margin-bottom:12px">
    <select id="doc-agent-filter" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;padding:8px 12px;outline:none;width:100%">
      <option value="">Todos os angariadores</option>
      ${agentNames.map(n=>`<option value="${n}" ${activeDocAgent===n?'selected':''}>${n}</option>`).join('')}
    </select>
  </div>`;

  const rows = activeDocAgent ? allRows.filter(r=>r.agent===activeDocAgent) : allRows;

  if (allRows.length===0) { wrap.innerHTML=filterHTML+'<div class="empty-state">Nenhum DOC registrado no período</div>';
    wrap.querySelector('#doc-agent-filter').addEventListener('change',function(){ activeDocAgent=this.value; renderDocList(entries); });
    return;
  }
  wrap.innerHTML=filterHTML+`<div style="overflow-x:auto"><table class="data-table" style="table-layout:auto">
    <thead><tr><th>Data</th><th>Angariador</th><th>Proprietário</th><th>Tipo</th><th>Bairro</th><th class="num-cell">Valor</th><th>SITE / AVI</th><th></th></tr></thead>
    <tbody>${rows.map(d=>`<tr>
      <td style="white-space:nowrap">${formatDate(d.date)}</td>
      <td>${d.agent}</td>
      <td style="font-weight:500">${d.nome||'—'}</td>
      <td>${d.tipo?`<span class="tipo-tag tipo-${d.tipo.toLowerCase()}">${d.tipo}</span>`:'—'}</td>
      <td>${d.bairro||'—'}</td>
      <td class="num-cell">${formatCurrency(d.valor)}</td>
      <td>
        <select class="nota-select" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}">
          <option value="" ${!d.nota?'selected':''}>—</option>
          <option value="SITE" ${d.nota==='SITE'?'selected':''}>SITE</option>
          <option value="AVI" ${d.nota==='AVI'?'selected':''}>AVI</option>
        </select>
      </td>
      <td><button class="del-doc-btn" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}" title="Excluir">✕</button></td>
    </tr>`).join('')}</tbody></table></div>`;

  wrap.querySelector('#doc-agent-filter').addEventListener('change',function(){ activeDocAgent=this.value; renderDocList(entries); });

  wrap.querySelectorAll('.nota-select').forEach(sel=>{
    sel.addEventListener('change',async()=>{
      await updateDocNota(sel.dataset.date, sel.dataset.agent, parseInt(sel.dataset.idx), sel.value);
    });
  });
  wrap.querySelectorAll('.del-doc-btn').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      if (confirm(`Excluir DOC de ${btn.dataset.agent} em ${formatDate(btn.dataset.date)}?`))
        await deleteDocDetail(btn.dataset.date,btn.dataset.agent,parseInt(btn.dataset.idx));
    });
  });
}

// ── CONSULTA POR DIA ─────────────────────────────────────
function initDayView() {
  const input=document.getElementById('day-input');
  input.value=today();
  input.addEventListener('change',()=>renderDayView(input.value));
  renderDayView(input.value);
}

function renderDayView(dateStr) {
  if (!dateStr) return;
  const agentNames=Object.keys(USERS).filter(k=>USERS[k].role==='agent').map(k=>USERS[k].name);
  const entries=getEntries();
  const wrap=document.getElementById('day-view-wrap');
  wrap.innerHTML=`
    <table class="data-table rank-table" style="table-layout:fixed">
      <colgroup><col style="width:auto"><col style="width:70px"><col style="width:70px"><col style="width:70px"></colgroup>
      <thead><tr><th>Angariador</th><th class="num-cell">PROSP</th><th class="num-cell">CPD</th><th class="num-cell doc-th">DOC</th></tr></thead>
      <tbody>${agentNames.map(name=>{
        const e=entries.find(x=>x.date===dateStr&&x.agent===name),has=!!e;
        return `<tr data-agent="${name}" data-has="${has}">
          <td>${name}</td>
          <td class="num-cell">${has?`<input class="inline-edit-input" data-field="prosp" type="number" min="0" value="${e.prosp}">`:'<span style="color:var(--text-muted)">—</span>'}</td>
          <td class="num-cell">${has?`<input class="inline-edit-input" data-field="cpd" type="number" min="0" value="${e.cpd}">`:'<span style="color:var(--text-muted)">—</span>'}</td>
          <td class="num-cell">${has?`<input class="inline-edit-input" data-field="doc" type="number" min="0" value="${e.doc}">`:'<span style="color:var(--text-muted)">—</span>'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
    <button class="save-day-btn" id="save-day-btn">Salvar alterações do dia</button>`;
  document.getElementById('save-day-btn').addEventListener('click',async()=>{
    const btn=document.getElementById('save-day-btn'); btn.disabled=true; btn.textContent='Salvando...';
    for (const tr of wrap.querySelectorAll('tbody tr')) {
      if (tr.dataset.has!=='true') continue;
      const name=tr.dataset.agent;
      const prosp=parseInt(tr.querySelector('[data-field="prosp"]').value)||0;
      const cpd=parseInt(tr.querySelector('[data-field="cpd"]').value)||0;
      const doc=parseInt(tr.querySelector('[data-field="doc"]').value)||0;
      const existing=getEntries().find(e=>e.date===dateStr&&e.agent===name);
      await upsertEntry({date:dateStr,agent:name,prosp,cpd,doc,docDetails:existing?.docDetails||[]});
      resetEditCount(name,dateStr);
    }
    btn.textContent='Salvo ✓'; btn.style.background='#2ecc71';
    setTimeout(()=>{ btn.textContent='Salvar alterações do dia'; btn.style.background=''; btn.disabled=false; },2000);
  });
}

// ── PDF EXPORT ───────────────────────────────────────────
function initExport() {
  document.querySelectorAll('.export-btn').forEach(btn=>{
    btn.addEventListener('click',()=>generateReport(btn.dataset.period));
  });
}

function generateReport(period) {
  const entries=filterEntries(period);
  const byAgent=sumByAgent(entries);
  const allDocs=entries.flatMap(e=>(e.docDetails||[]).map(d=>({...d,date:e.date,agent:e.agent})));
  const ranked=[...byAgent].sort((a,b)=>b.doc!==a.doc?b.doc-a.doc:b.cpd!==a.cpd?b.cpd-a.cpd:b.prosp-a.prosp);
  const t=today();
  const periodLabel = period==='today'?`Hoje (${formatDate(t)})` : period==='week'?`Semana (${formatDate(weekRange(t).start)} – ${formatDate(weekRange(t).end)})` : `Mês (${new Date(t+'T12:00:00').toLocaleString('pt-BR',{month:'long',year:'numeric'})})`;

  const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Nickel CRM — Relatório</title>
  <style>
    body{font-family:Arial,sans-serif;color:#111;padding:24px;max-width:900px;margin:0 auto}
    h1{font-size:20px;margin-bottom:4px}
    h2{font-size:14px;color:#555;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
    .period{color:#888;font-size:13px;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px}
    th{text-align:left;padding:7px 10px;background:#f5f5f5;font-size:11px;letter-spacing:.5px;text-transform:uppercase;border-bottom:2px solid #ddd}
    td{padding:7px 10px;border-bottom:1px solid #eee}
    .num{text-align:right;font-weight:600}
    .gold{color:#b8860b;font-weight:700}
    .tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
    @media print{body{padding:0}button{display:none}}
    .print-btn{background:#111;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;margin-bottom:20px;font-size:14px}
  </style></head><body>
  <button class="print-btn" onclick="window.print()">Imprimir / Salvar PDF</button>
  <h1>Nickel CRM — Relatório</h1>
  <div class="period">${periodLabel}</div>
  <h2>Ranking</h2>
  <table><thead><tr><th>#</th><th>Angariador</th><th class="num">DOC</th><th class="num">CPD</th><th class="num">PROSP</th></tr></thead>
  <tbody>${ranked.map((a,i)=>`<tr><td class="${i===0?'gold':''}">${i<3?['🥇','🥈','🥉'][i]:i+1}</td><td>${a.agent}</td><td class="num">${a.doc}</td><td class="num">${a.cpd}</td><td class="num">${a.prosp}</td></tr>`).join('')}</tbody>
  </table>
  <h2>DOCs registrados</h2>
  ${allDocs.length===0?'<p style="color:#888">Nenhum DOC no período.</p>':`
  <table><thead><tr><th>Data</th><th>Angariador</th><th>Proprietário</th><th>Tipo</th><th>Bairro</th><th class="num">Valor</th><th>SITE / AVI</th></tr></thead>
  <tbody>${allDocs.map(d=>`<tr><td>${formatDate(d.date)}</td><td>${d.agent}</td><td>${d.nome||'—'}</td><td>${d.tipo||'—'}</td><td>${d.bairro||'—'}</td><td class="num">${formatCurrency(d.valor)}</td><td>${d.nota||'—'}</td></tr>`).join('')}</tbody>
  </table>`}
  <h2>Totais</h2>
  <table><thead><tr><th>PROSP</th><th>CPD</th><th>DOC</th></tr></thead>
  <tbody><tr><td>${byAgent.reduce((s,a)=>s+a.prosp,0)}</td><td>${byAgent.reduce((s,a)=>s+a.cpd,0)}</td><td>${byAgent.reduce((s,a)=>s+a.doc,0)}</td></tr></tbody>
  </table>
  </body></html>`;

  const w=window.open('','_blank');
  w.document.write(html);
  w.document.close();
}

// ── CONVERSÃO ────────────────────────────────────────────
function renderConversion(ranked) {
  const convList=document.getElementById('conv-list');
  if (!ranked.length) { convList.innerHTML='<div class="empty-state">Sem dados</div>'; return; }
  const isProspCpd=activeConvMode==='prosp-cpd';
  convList.innerHTML=ranked.map((a,i)=>{
    const num=isProspCpd?a.cpd:a.doc,den=isProspCpd?a.prosp:a.cpd;
    const pct=den>0?((num/den)*100).toFixed(1)+'%':'—';
    const pos=i+1;
    return `<div class="conv-card">
      <div class="conv-card-header"><span class="conv-agent">${pos<=3?PODIUM_LABEL[pos]:''} ${a.agent}</span><span class="conv-pct ${pct==='—'?'muted':''}">${pct}</span></div>
      <div class="conv-bar-wrap"><div class="conv-bar" style="width:${den>0?Math.min((num/den)*100,100):0}%"></div></div>
      <div class="conv-detail">${isProspCpd?'CPD / PROSP':'DOC / CPD'}: ${den>0?`${num} de ${den}`:'—'}</div>
    </div>`;
  }).join('');
}

// ── PAGE DETECTION ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', ()=>{
  if      (document.getElementById('login-form'))  initLogin();
  else if (document.getElementById('streak-wrap'))  initAgentDashboard();
  else if (document.getElementById('gestor-name')) initGestorDashboard();
});
