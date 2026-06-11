import { fbUpsertEntry, fbDeleteEntry, fbSeedIfFirstTime, fbListen, fbGetTeam, fbSaveTeam } from './firebase.js';

// ── USERS (deve vir antes de TEAM) ───────────────────────
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

// ── TEAM (após USERS) ────────────────────────────────────
let TEAM = Object.keys(USERS)
  .filter(k => USERS[k].role === 'agent')
  .map(k => ({ name: USERS[k].name, password: USERS[k].password }));

function getAgentNames() { return TEAM.map(a => a.name); }

async function loadTeam() {
  try {
    const remote = await fbGetTeam();
    if (remote && remote.length > 0) TEAM = remote;
    else await fbSaveTeam(TEAM);
  } catch(e) { console.warn('loadTeam error, using defaults', e); }
}

const TIPOS   = ['Casa', 'Apto', 'Studio', 'Terreno', 'Comercial'];

const STATUS_OPTIONS = [
  { value: '',      label: '—',    color: 'var(--text-muted)' },
  { value: 'FOTOS', label: 'FOTOS', color: '#e67e22' },
  { value: 'AVI',   label: 'AVI',   color: '#3498db' },
  { value: 'SITE',  label: 'SITE',  color: '#a8e63d' },
];
const BAIRROS = ['Batel','Água Verde','Bigorrilho','Ecoville','Cabral','Juvevê','Mercês','Campo Comprido','Santa Felicidade','Santo Inácio','Vila Izabel'];
const META_DOC = 1;
const TIPO_COLORS = {
  Casa:      { bg:'rgba(168,230,61,.8)',  border:'#a8e63d' },
  Apto:      { bg:'rgba(100,149,237,.8)', border:'#6495ed' },
  Studio:    { bg:'rgba(155,89,182,.8)',  border:'#9b59b6' },
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
function today()       { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
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
// Converte uma data 'YYYY-MM-DD' para o formato do <input type="week"> ('YYYY-Www')
function isoWeekString(dateStr) {
  const d=new Date(dateStr+'T12:00:00');
  const target=new Date(d.valueOf());
  const dayNr=(d.getDay()+6)%7;
  target.setDate(target.getDate()-dayNr+3);
  const firstThursday=target.valueOf();
  target.setMonth(0,1);
  if (target.getDay()!==4) target.setMonth(0, 1+((4-target.getDay())+7)%7);
  const week=1+Math.ceil((firstThursday-target)/(7*24*3600*1000));
  return `${d.getFullYear()}-W${String(week).padStart(2,'0')}`;
}
// Converte 'YYYY-Www' (do <input type="week">) para uma data 'YYYY-MM-DD' dentro daquela semana
function isoWeekToDateStr(weekStr) {
  const [yearStr, weekPart]=weekStr.split('-W');
  const year=Number(yearStr), week=Number(weekPart);
  const simple=new Date(year,0,1+(week-1)*7);
  const dow=simple.getDay();
  if (dow<=4) simple.setDate(simple.getDate()-dow+1);
  else simple.setDate(simple.getDate()+8-dow);
  return toDateStr(simple);
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
// Um lançamento só conta para a sequência se foi enviado no próprio dia
// (submittedDate === date). Lançamentos retroativos (enviados depois) não
// contam — o dia perdido não volta, mas não trava o envio dos dias seguintes.
function isOnTime(e) { return (e.submittedDate||e.date)===e.date; }
function getOnTimeDates(agentName) {
  return [...new Set(getEntries().filter(e=>e.agent===agentName && isOnTime(e)).map(e=>e.date))];
}
function calcStreak(agentName) {
  const days=getOnTimeDates(agentName).sort().reverse();
  if (days.length===0) return 0;
  const t=today();
  const yest=new Date(t+'T12:00:00'); yest.setDate(yest.getDate()-1);
  const yesterdayStr=toDateStr(yest);
  // A sequência só "quebra" quando um dia inteiro é perdido. Se o último
  // envio foi ontem (e hoje ainda não foi lançado), a contagem continua —
  // não zera só porque o dia de hoje ainda não terminou.
  let cursor;
  if (days[0]===t) cursor=new Date(t+'T12:00:00');
  else if (days[0]===yesterdayStr) cursor=new Date(yesterdayStr+'T12:00:00');
  else return 0;
  let streak=0;
  for (const d of days) { if(d===toDateStr(cursor)){streak++;cursor.setDate(cursor.getDate()-1);}else break; }
  return streak;
}

// ── STREAK VISUAL ────────────────────────────────────────
function renderStreak(agentName, entries) {
  const streak = calcStreak(agentName);
  const sentDates = new Set(getOnTimeDates(agentName));
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
  else if (streak < 14)   { color='#a8e63d';  emoji='🔥'; label=`${streak} dias seguidos! Incrível!`; }
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
  try { await loadTeam(); } catch(e) {}
  try { await fbSeedIfFirstTime(SEED); } catch(e) {}
  document.getElementById('loading-msg').style.display='none';

  // populate agent select
  const sel = document.getElementById('username');
  sel.innerHTML = '<option value="">Selecione...</option>';
  TEAM.forEach(a => {
    const o = document.createElement('option');
    o.value = a.name.toLowerCase();
    o.textContent = a.name;
    sel.appendChild(o);
  });
  const oGestor = document.createElement('option');
  oGestor.value = 'matheus'; oGestor.textContent = 'Matheus (Gestor)';
  sel.appendChild(oGestor);

  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const errEl = document.getElementById('login-error');
    // check gestor
    if (username === 'matheus') {
      if (password !== USERS.matheus.password) { errEl.textContent='Senha incorreta.'; return; }
      setSession({ username, name:'Matheus', role:'gestor' });
      window.location.href='dashboard-gestor.html'; return;
    }
    const agent = TEAM.find(a => a.name.toLowerCase() === username);
    if (!agent || agent.password !== password) { errEl.textContent='Usuário ou senha incorretos.'; return; }
    setSession({ username, name:agent.name, role:'agent' });
    window.location.href='dashboard-agente.html';
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
        // Preserva nota do gestor ao corrigir (evita apagar FOTOS/AVI/SITE já definido)
        if (sentToday?.docDetails) {
          docDetails.forEach((d,i) => { if (sentToday.docDetails[i]) d.nota = sentToday.docDetails[i].nota || ''; });
        }
        const isEdit=!!sentToday;
        const btn=ev.target.querySelector('[type="submit"]'); btn.disabled=true; btn.textContent='Enviando...';
        const submittedDate=sentToday?.submittedDate||sentToday?.date||today();
        await upsertEntry({date,agent:session.name,prosp:parseInt(document.getElementById('f-prosp').value)||0,cpd:parseInt(document.getElementById('f-cpd').value)||0,doc:docVal,docDetails,submittedDate});
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
let evolucaoChart=null, analyticsChart=null;
let activePeriod='week', activeConvMode='prosp-cpd', activeAnalyticsMode='tipo';
let activeMonthRef=today(); // 'YYYY-MM-DD' — referência do mês selecionado no filtro "Mês"
let activeWeekRef=today();  // 'YYYY-MM-DD' — referência da semana selecionada no filtro "Semana"
let gestorUnsubscribe=null;

async function initGestorDashboard() {
  const session=getSession();
  if (!session||session.role!=='gestor') { window.location.href='index.html'; return; }
  document.getElementById('gestor-name').textContent=session.name;
  document.getElementById('logout-btn').addEventListener('click',()=>{ if(gestorUnsubscribe)gestorUnsubscribe(); clearSession(); window.location.href='index.html'; });
  document.querySelectorAll('.filter-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      activePeriod=btn.dataset.period;
      document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const mpWrap=document.getElementById('month-picker-wrap');
      if (mpWrap) mpWrap.style.display = activePeriod==='month' ? 'block' : 'none';
      const wpWrap=document.getElementById('week-picker-wrap');
      if (wpWrap) wpWrap.style.display = activePeriod==='week' ? 'block' : 'none';
      renderGestorDashboard();
    });
  });
  const monthPicker=document.getElementById('month-picker');
  if (monthPicker) {
    monthPicker.value=activeMonthRef.slice(0,7);
    monthPicker.max=today().slice(0,7);
    monthPicker.addEventListener('change',()=>{
      if (!monthPicker.value) return;
      activeMonthRef=monthPicker.value+'-01';
      renderGestorDashboard();
    });
  }
  const weekPicker=document.getElementById('week-picker');
  if (weekPicker) {
    weekPicker.value=isoWeekString(activeWeekRef);
    weekPicker.max=isoWeekString(today());
    weekPicker.addEventListener('change',()=>{
      if (!weekPicker.value) return;
      activeWeekRef=isoWeekToDateStr(weekPicker.value);
      renderGestorDashboard();
    });
  }
  const wpWrapInit=document.getElementById('week-picker-wrap');
  if (wpWrapInit) wpWrapInit.style.display = activePeriod==='week' ? 'block' : 'none';
  await loadTeam();
  gestorUnsubscribe=fbListen(entries=>{
    saveEntries(entries);
    renderGestorDashboard();
    renderDayView(document.getElementById('day-input')?.value||today());
  });
  initDayView();
  initExport();
  initGestorLancamento();
  initTeamManagement();
}

function refreshLancAgentSelect() {
  const sel=document.getElementById('lanc-agent');
  if (!sel) return;
  const current=sel.value;
  sel.innerHTML='<option value="">Selecione</option>';
  getAgentNames().forEach(n=>{ const o=document.createElement('option'); o.value=n; o.textContent=n; sel.appendChild(o); });
  if (current) sel.value=current; // mantém seleção se ainda existir
}

function initGestorLancamento() {
  refreshLancAgentSelect();
  const agentSel=document.getElementById('lanc-agent');

  const dateInput=document.getElementById('lanc-date');
  const t=today(); dateInput.value=t; dateInput.max=t;

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
    const existing=getEntries().find(e=>e.date===date&&e.agent===agent);
    const submittedDate=existing?.submittedDate||existing?.date||today();
    await upsertEntry({date,agent,prosp:parseInt(document.getElementById('lanc-prosp').value)||0,cpd:parseInt(document.getElementById('lanc-cpd').value)||0,doc:docVal,docDetails,submittedDate});
    resetEditCount(agent,date);
    btn.disabled=false; btn.textContent='Salvar lançamento';
    // reset form
    document.getElementById('lanc-prosp').value=0;
    document.getElementById('lanc-cpd').value=0;
    document.getElementById('lanc-doc').value=0;
    document.getElementById('lanc-doc-details').innerHTML='';
    const newToday=today(); dateInput.value=newToday; dateInput.max=newToday;
  });
}

function renderEvolucaoDiaria(entries) {
  const ctx = document.getElementById('evolucao-chart')?.getContext('2d');
  if (!ctx) return;
  if (evolucaoChart) evolucaoChart.destroy();

  // collect unique dates sorted
  const dates = [...new Set(entries.map(e=>e.date))].sort();
  if (dates.length === 0) { return; }

  // per agent datasets
  const agentNames = getAgentNames();
  const colors = ['#a8e63d','#6495ed','#2ecc71','#e67e22','#e74c3c','#9b59b6','#1abc9c','#f1c40f'];
  const datasets = agentNames.map((name,i) => ({
    label: name,
    data: dates.map(d => { const e=entries.find(x=>x.date===d&&x.agent===name); return e?e.doc:0; }),
    borderColor: colors[i%colors.length],
    backgroundColor: colors[i%colors.length]+'33',
    borderWidth: 2, pointRadius: 4, tension: .3, fill: false,
  })).filter(ds => ds.data.some(v=>v>0));

  evolucaoChart = new Chart(ctx, {
    type: 'line',
    data: { labels: dates.map(formatDate), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color:'#888', font:{ family:'DM Sans', size:11 }, boxWidth:12 } } },
      scales: {
        x: { ticks:{ color:'#888', font:{ family:'DM Sans', size:10 } }, grid:{ color:'#1a1a1a' } },
        y: { ticks:{ color:'#888', font:{ family:'DM Sans' }, stepSize:1 }, grid:{ color:'#1a1a1a' }, beginAtZero:true },
      }
    }
  });
}

// ── TEAM MANAGEMENT ──────────────────────────────────────
function initTeamManagement() {
  const wrap = document.getElementById('team-mgmt');
  if (!wrap) return;
  renderTeamList();

  document.getElementById('add-agent-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const name = document.getElementById('new-agent-name').value.trim();
    const pass = document.getElementById('new-agent-pass').value.trim() || 'nickel123';
    if (!name) return;
    if (TEAM.find(a => a.name.toLowerCase() === name.toLowerCase())) {
      alert('Angariador já existe.'); return;
    }
    TEAM.push({ name, password: pass });
    await fbSaveTeam(TEAM);
    document.getElementById('new-agent-name').value = '';
    renderTeamList();
    refreshLancAgentSelect();
  });
}

function renderTeamList() {
  const list = document.getElementById('team-list');
  if (!list) return;
  list.innerHTML = TEAM.map((a,i) => `
    <div class="team-row">
      <span class="team-name">${a.name}</span>
      <span class="team-pass" style="color:var(--text-muted);font-size:12px">${a.password}</span>
      <button class="del-agent-btn" data-idx="${i}">Remover</button>
    </div>`).join('');
  list.querySelectorAll('.del-agent-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = TEAM[parseInt(btn.dataset.idx)].name;
      if (!confirm(`Remover ${name} da equipe?`)) return;
      TEAM.splice(parseInt(btn.dataset.idx), 1);
      await fbSaveTeam(TEAM);
      renderTeamList();
      refreshLancAgentSelect();
    });
  });
}

function renderStreakRanking() {
  const agentNames = getAgentNames();
  const streaks = agentNames.map(name => ({ name, streak: calcStreak(name) }))
    .sort((a,b) => b.streak - a.streak);

  const wrap = document.getElementById('streak-ranking');
  if (!wrap) return;

  wrap.innerHTML = streaks.map((s, i) => {
    let emoji, color;
    if      (s.streak === 0) { emoji='💤'; color='#555'; }
    else if (s.streak < 3)   { emoji='🔥'; color='#cd7f32'; }
    else if (s.streak < 7)   { emoji='🔥'; color='#aaa'; }
    else if (s.streak < 14)  { emoji='🔥'; color='#a8e63d'; }
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
  const ref = activePeriod==='month' ? activeMonthRef : activePeriod==='week' ? activeWeekRef : undefined;
  const entries=filterEntries(activePeriod, ref);
  const byAgent=sumByAgent(entries);

  const totProsp=byAgent.reduce((s,a)=>s+a.prosp,0), totCpd=byAgent.reduce((s,a)=>s+a.cpd,0), totDoc=byAgent.reduce((s,a)=>s+a.doc,0);
  document.getElementById('tot-prosp').textContent=totProsp;
  document.getElementById('tot-cpd').textContent=totCpd;
  document.getElementById('tot-doc').textContent=totDoc;

  const ranked=[...byAgent].sort((a,b)=>b.doc!==a.doc?b.doc-a.doc:b.cpd!==a.cpd?b.cpd-a.cpd:b.prosp-a.prosp);
  document.getElementById('rank-body').innerHTML=ranked.map((a,i)=>{
    const pos=i+1;
    return `<tr class="${pos<=3?'podium-row podium-'+pos:''}"><td><span class="rank-badge ${pos<=3?PODIUM[pos]:''}">${pos<=3?PODIUM_LABEL[pos]:pos}</span></td><td>${a.agent}</td><td class="num-cell doc-cell">${a.doc}</td><td class="num-cell">${a.cpd}</td><td class="num-cell dim-cell">${a.prosp}</td></tr>`;
  }).join('');

  // Evolução diária de DOC
  renderEvolucaoDiaria(entries);

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
    const palette=['rgba(168,230,61,.7)','rgba(100,149,237,.7)','rgba(46,204,113,.7)','rgba(230,126,34,.7)','rgba(231,76,60,.7)','rgba(155,89,182,.7)','rgba(52,152,219,.7)','rgba(26,188,156,.7)','rgba(241,196,15,.7)','rgba(189,195,199,.7)','rgba(127,140,141,.7)'];
    const palBorder=['#a8e63d','#6495ed','#2ecc71','#e67e22','#e74c3c','#9b59b6','#3498db','#1abc9c','#f1c40f','#bdc3c7','#7f8c8d'];
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
  const agentNames=getAgentNames();
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
    <thead><tr><th>Data</th><th>Angariador</th><th>Proprietário</th><th>Tipo</th><th>Bairro</th><th class="num-cell">Valor</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows.map(d=>`<tr>
      <td style="white-space:nowrap">${formatDate(d.date)}</td>
      <td>${d.agent}</td>
      <td style="font-weight:500">${d.nome||'—'}</td>
      <td>${d.tipo?`<span class="tipo-tag tipo-${d.tipo.toLowerCase()}">${d.tipo}</span>`:'—'}</td>
      <td>${d.bairro||'—'}</td>
      <td class="num-cell">${formatCurrency(d.valor)}</td>
      <td>
        <select class="nota-select status-sel-${(d.nota||'').toLowerCase().replace(/\s/g,'')}" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}">
          ${STATUS_OPTIONS.map(o=>`<option value="${o.value}" ${d.nota===o.value?'selected':''}>${o.label}</option>`).join('')}
        </select>
      </td>
      <td><button class="del-doc-btn" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}" title="Excluir">✕</button></td>
    </tr>`).join('')}</tbody></table></div>`;

  wrap.querySelector('#doc-agent-filter').addEventListener('change',function(){ activeDocAgent=this.value; renderDocList(entries); });

  wrap.querySelectorAll('.nota-select').forEach(sel=>{
    const applyColor = s => {
      const opt = STATUS_OPTIONS.find(o=>o.value===s.value);
      s.style.color = opt ? opt.color : 'var(--text-muted)';
      s.style.borderColor = opt?.value ? opt.color : 'var(--border)';
    };
    applyColor(sel);
    sel.addEventListener('change', async () => {
      applyColor(sel);
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
  const agentNames=getAgentNames();
  const entries=getEntries();
  const wrap=document.getElementById('day-view-wrap');

  const rows = agentNames.map(name => {
    const e=entries.find(x=>x.date===dateStr&&x.agent===name), has=!!e;
    return `<tr>
      <td class="day-agent-name">${name}</td>
      <td class="num-cell day-num">${has ? e.prosp : '<span class="day-empty">—</span>'}</td>
      <td class="num-cell day-num">${has ? e.cpd   : '<span class="day-empty">—</span>'}</td>
      <td class="num-cell day-num doc-cell">${has ? e.doc : '<span class="day-empty">—</span>'}</td>
      <td>${has ? `<button class="del-day-btn" data-date="${dateStr}" data-agent="${name}">Remover</button>` : ''}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML=`
    <table class="data-table rank-table" style="table-layout:auto">
      <thead><tr>
        <th>Angariador</th>
        <th class="num-cell">PROSP</th>
        <th class="num-cell">CPD</th>
        <th class="num-cell doc-th">DOC</th>
        <th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  wrap.querySelectorAll('.del-day-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { date, agent } = btn.dataset;
      if (!confirm(`Remover lançamento de ${agent} em ${formatDate(date)}?\nO angariador poderá relançar.`)) return;
      btn.disabled = true; btn.textContent = '...';
      saveEntries(getEntries().filter(e => !(e.date===date && e.agent===agent)));
      await fbDeleteEntry(date, agent);
      resetEditCount(agent, date);
      renderDayView(date);
    });
  });
}

// ── PDF EXPORT ───────────────────────────────────────────
function initExport() {
  document.querySelectorAll('.export-btn').forEach(btn=>{
    btn.addEventListener('click',()=>generateReport(btn.dataset.period));
  });
}

function generateReport(period) {
  const t = period==='month' ? activeMonthRef : period==='week' ? activeWeekRef : today();
  const entries=filterEntries(period, period==='month'?activeMonthRef:period==='week'?activeWeekRef:undefined);
  const byAgent=sumByAgent(entries);
  const allDocs=entries.flatMap(e=>(e.docDetails||[]).map(d=>({...d,date:e.date,agent:e.agent})));
  const ranked=[...byAgent].sort((a,b)=>b.doc!==a.doc?b.doc-a.doc:b.cpd!==a.cpd?b.cpd-a.cpd:b.prosp-a.prosp);
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
  <table><thead><tr><th>Data</th><th>Angariador</th><th>Proprietário</th><th>Tipo</th><th>Bairro</th><th class="num">Valor</th><th>Status</th></tr></thead>
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
