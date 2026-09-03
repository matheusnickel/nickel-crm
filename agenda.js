import {
  fbGetTeam,
  fbListenAgendaEvents,
  fbSaveAgendaEvent,
  fbUpdateAgendaEvent,
  fbDeleteAgendaEvent,
} from './firebase.js';

// ── SESSION ───────────────────────────────────────────────
const SESSION_KEY = 'nickel_agenda_session';
function getSession()       { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
function setSession(s)      { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession()     { localStorage.removeItem(SESSION_KEY); }

// ── TODAY ─────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0,10); }

// ── TYPE CONFIG ───────────────────────────────────────────
const TIPOS = {
  angariacao:  { label: 'ANGARIAÇÃO',  short: 'A', color: '#f97316', bg: 'rgba(249,115,22,0.13)'  },
  venda:       { label: 'VENDA',       short: 'V', color: '#22c55e', bg: 'rgba(34,197,94,0.13)'   },
  fotos:       { label: 'FOTOS',       short: 'F', color: '#6495ed', bg: 'rgba(100,149,237,0.13)' },
  reuniao:     { label: 'REUNIÃO',     short: 'R', color: '#a855f7', bg: 'rgba(168,85,247,0.13)'  },
  treinamento: { label: 'TREINAMENTO', short: 'TREIN', color: '#f59e0b', bg: 'rgba(245,158,11,0.13)'  },
};

// ── CALENDAR STATE ────────────────────────────────────────
let view      = 'week';
let navDate   = today();
let filterAgent = '';
let filterType  = '';
let allEvents   = [];
let TEAM        = [];
let session     = null;
let unsubscribe = null;

// ── DATE HELPERS ──────────────────────────────────────────
function getWeekDates(ref) {
  const d = new Date(ref + 'T12:00:00');
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({length:7}, (_, i) => {
    const x = new Date(mon); x.setDate(mon.getDate() + i);
    return x.toISOString().slice(0,10);
  });
}
function getMonthDates(ref) {
  const [y, m] = ref.slice(0,7).split('-').map(Number);
  const last = new Date(y, m, 0);
  const dates = [];
  for (let d = 1; d <= last.getDate(); d++)
    dates.push(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  return dates;
}
function fmtDate(d) { const [,m,day] = d.split('-'); return `${day}/${m}`; }
function fmtMonth(d) {
  const M = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const [y, m] = d.split('-'); return `${M[+m-1]} ${y}`;
}
function navLabel() {
  if (view === 'day')   return navDate.split('-').reverse().join('/');
  if (view === 'week')  { const w = getWeekDates(navDate); return `${fmtDate(w[0])} – ${fmtDate(w[6])}`; }
  return fmtMonth(navDate);
}

// ── FILTER ────────────────────────────────────────────────
function filtered() {
  return allEvents.filter(e => {
    if (filterAgent && e.agent !== filterAgent) return false;
    if (filterType  && e.tipo  !== filterType)  return false;
    return true;
  });
}

// ── RENDER CALENDAR ───────────────────────────────────────
function pill(ev, full=false) {
  const t = TIPOS[ev.tipo] || TIPOS.fotos;
  const time = ev.dataHora ? ev.dataHora.slice(11,16) : '';
  const name = `${ev.condominio||'—'}`;
  const agentFirst = (ev.agent||'').split(' ')[0];

  if (full) {
    return `<div class="ag-day-event" data-id="${ev.id}" style="background:${t.bg};border-color:${t.color}">
      <div class="ag-day-event-left">
        <span class="ag-day-event-type" style="color:${t.color}">${t.label}</span>
        <span class="ag-day-event-time">${time||'—'}</span>
      </div>
      <div style="flex:1;min-width:0">
        <div class="ag-day-event-name">${name} — ${agentFirst}</div>
        <div class="ag-day-event-agent">${ev.agent}</div>
      </div>
      <span style="font-size:11px;color:var(--text-muted)">✏️</span>
    </div>`;
  }
  return `<div class="ag-pill" data-id="${ev.id}" style="background:${t.bg};border-color:${t.color}" title="${t.label} — ${name} — ${ev.agent} ${time}">
    <span class="ag-pill-badge" style="color:${t.color}">${t.short}</span>
    ${time ? `<span class="ag-pill-time">${time}</span>` : ''}
    <span class="ag-pill-name">${name} — ${agentFirst}</span>
  </div>`;
}

function renderCalendar() {
  const cal = document.getElementById('ag-calendar');
  if (!cal) return;
  document.getElementById('ag-nav-label').textContent = navLabel();
  document.querySelectorAll('.ag-view-btn').forEach(b => b.classList.toggle('active', b.dataset.v === view));

  const evs = filtered();
  const evsByDate = {};
  evs.forEach(e => {
    const d = e.dataHora ? e.dataHora.slice(0,10) : '';
    if (!d) return;
    if (!evsByDate[d]) evsByDate[d] = [];
    evsByDate[d].push(e);
  });
  Object.values(evsByDate).forEach(arr => arr.sort((a,b)=>(a.dataHora||'').localeCompare(b.dataHora||'')));

  if (view === 'week') {
    const days = getWeekDates(navDate);
    const NAMES = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
    cal.innerHTML = `<div class="ag-cal-week">${days.map((d,i)=>{
      const isToday = d === today();
      const isPast  = d < today();
      const dayEvs  = evsByDate[d] || [];
      const MAX = 4;
      return `<div class="ag-day-col${isToday?' today':''}${isPast?' past':''}">
        <div class="ag-day-head">
          <div class="ag-day-name">${NAMES[i]}</div>
          <div class="ag-day-num">${d.slice(8)}</div>
        </div>
        ${dayEvs.slice(0,MAX).map(e=>pill(e)).join('')}
        ${dayEvs.length>MAX?`<div class="ag-more" data-goto="${d}">+${dayEvs.length-MAX} mais</div>`:''}
      </div>`;
    }).join('')}</div>`;

  } else if (view === 'month') {
    const dates = getMonthDates(navDate);
    const firstDay = new Date(navDate.slice(0,7)+'-01T12:00:00').getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const NAMES = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
    const blanks = Array(offset).fill('<div></div>').join('');
    cal.innerHTML = `<div class="ag-cal-month">
      ${NAMES.map(n=>`<div class="ag-month-head">${n}</div>`).join('')}
      ${blanks}
      ${dates.map(d=>{
        const isToday = d === today();
        const isPast  = d < today();
        const dayEvs  = evsByDate[d] || [];
        const t = TIPOS;
        return `<div class="ag-month-day${isToday?' today':''}${isPast?' past':''}" data-goto="${d}">
          <div class="ag-month-day-num">${d.slice(8)}</div>
          ${dayEvs.slice(0,2).map(e=>{
            const tp = TIPOS[e.tipo]||TIPOS.fotos;
            return `<div class="ag-month-pill" style="background:${tp.bg};color:${tp.color}">${tp.short} ${e.condominio||''} — ${(e.agent||'').split(' ')[0]}</div>`;
          }).join('')}
          ${dayEvs.length>2?`<div style="font-size:9px;color:var(--text-muted);text-align:center">+${dayEvs.length-2}</div>`:''}
        </div>`;
      }).join('')}
    </div>`;

  } else {
    const dayEvs = evsByDate[navDate] || [];
    cal.innerHTML = dayEvs.length
      ? `<div class="ag-day-view">${dayEvs.map(e=>pill(e,true)).join('')}</div>`
      : `<div class="ag-empty">Nenhum compromisso neste dia.</div>`;
  }

  // click events on pills
  cal.querySelectorAll('[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      const ev = allEvents.find(e => e.id === el.dataset.id);
      if (ev) openEditModal(ev);
    });
  });
  cal.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', () => { navDate = el.dataset.goto; view = 'day'; renderCalendar(); });
  });
}

// ── NEW / EDIT MODAL ──────────────────────────────────────
function openEditModal(ev = null) {
  const existing = document.getElementById('ag-modal');
  if (existing) existing.remove();

  const isNew   = !ev;
  const canEdit = session.role === 'gestor' || isNew || ev?.agentUid === session.uid;
  const INP = 'background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;padding:9px 11px;outline:none;width:100%;box-sizing:border-box;font-family:inherit';
  const LB  = 'display:block;font-size:10px;font-weight:700;letter-spacing:.6px;color:var(--text-muted);margin-bottom:3px;margin-top:10px';
  const semCond = ['reuniao','treinamento'];
  const currentTipo = ev?.tipo || 'angariacao';

  const tipoOptions = Object.entries(TIPOS).map(([k,t])=>
    `<option value="${k}"${currentTipo===k?' selected':''}>${t.label}</option>`
  ).join('');

  const modal = document.createElement('div');
  modal.id = 'ag-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);padding:16px';

  modal.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:22px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.55);max-height:90vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:14px;font-weight:800;color:var(--text)">${isNew?'Novo compromisso':'Editar compromisso'}</div>
        <button id="ag-modal-close" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:22px;line-height:1;padding:0">×</button>
      </div>
      <span style="${LB}">TIPO DE ATIVIDADE</span>
      <select id="ag-tipo" style="${INP};cursor:pointer;margin-bottom:2px" ${!canEdit?'disabled':''}>
        ${tipoOptions}
      </select>

      <div id="ag-grp-cond">
        <span style="${LB}">NOME DO CONDOMÍNIO</span>
        <input id="ag-cond" type="text" value="${(ev?.condominio||'').replace(/"/g,'&quot;')}" style="${INP};margin-bottom:2px" ${!canEdit?'readonly':''}>
        <span style="${LB}">VALOR DO IMÓVEL (R$)</span>
        <input id="ag-valor" type="text" value="${(ev?.valor||'').replace(/"/g,'&quot;')}" style="${INP};margin-bottom:2px" ${!canEdit?'readonly':''}>
      </div>

      <div id="ag-grp-assunto">
        <span style="${LB}">ASSUNTO / PAUTA</span>
        <textarea id="ag-assunto" rows="3" style="${INP};resize:vertical;margin-bottom:2px" ${!canEdit?'readonly':''}>${(ev?.assunto||'').replace(/</g,'&lt;')}</textarea>
      </div>

      <div id="ag-grp-venda">
        <span style="${LB}">CORRETOR DA CAPTAÇÃO</span>
        <input id="ag-captacao" type="text" value="${(ev?.corretorCaptacao||session.name).replace(/"/g,'&quot;')}" style="${INP};margin-bottom:2px" ${!canEdit?'readonly':''}>
        <span style="${LB}">CORRETOR DO CLIENTE COMPRADOR</span>
        <input id="ag-cliente" type="text" value="${(ev?.corretorCliente||'').replace(/"/g,'&quot;')}" style="${INP};margin-bottom:2px" ${!canEdit?'readonly':''}>
      </div>

      <span style="${LB}">DATA E HORÁRIO</span>
      <input id="ag-dt" type="datetime-local" value="${ev?.dataHora||''}" style="${INP};margin-bottom:18px" ${!canEdit?'readonly':''}>
      ${!isNew?`<div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Corretor: <strong style="color:var(--text)">${ev?.agent||'—'}</strong></div>`:''}
      ${canEdit?`<div style="display:flex;gap:8px">
        <button id="ag-save" style="flex:1;background:#22c55e;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer">Salvar</button>
        ${!isNew?`<button id="ag-del" style="background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:10px 14px;font-size:13px;font-weight:700;cursor:pointer">Excluir</button>`:''}
      </div>`:''}
    </div>
  `;

  document.body.appendChild(modal);

  function applyTipo(tipo) {
    document.getElementById('ag-grp-cond').style.display    = semCond.includes(tipo) ? 'none' : 'block';
    document.getElementById('ag-grp-assunto').style.display = semCond.includes(tipo) ? 'block' : 'none';
    document.getElementById('ag-grp-venda').style.display   = tipo === 'venda' ? 'block' : 'none';
  }

  applyTipo(currentTipo);

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.getElementById('ag-modal-close').addEventListener('click', () => modal.remove());
  document.getElementById('ag-tipo').addEventListener('change', e => applyTipo(e.target.value));

  if (!canEdit) return;

  document.getElementById('ag-save').addEventListener('click', async () => {
    const btn  = document.getElementById('ag-save');
    const tipo = document.getElementById('ag-tipo').value;
    const dt   = document.getElementById('ag-dt').value;
    const cond = document.getElementById('ag-cond')?.value.trim() || '';
    if (!dt) { alert('Preencha a data/horário.'); return; }
    if (!semCond.includes(tipo) && !cond) { alert('Preencha o nome do condomínio.'); return; }
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
      const data = {
        tipo,
        condominio: cond,
        valor:      document.getElementById('ag-valor')?.value.trim() || '',
        dataHora:   dt,
        agent:      ev?.agent || session.name,
        agentUid:   ev?.agentUid || session.uid || session.username || '',
        corretorCaptacao: tipo === 'venda' ? (document.getElementById('ag-captacao')?.value.trim() || '') : '',
        corretorCliente:  tipo === 'venda' ? (document.getElementById('ag-cliente')?.value.trim()  || '') : '',
        assunto: semCond.includes(tipo) ? (document.getElementById('ag-assunto')?.value.trim() || '') : '',
      };
      if (isNew) {
        await fbSaveAgendaEvent(data);
      } else {
        await fbUpdateAgendaEvent(ev.id, data);
      }
      modal.remove();
    } catch(err) {
      alert('Erro ao salvar. Verifique sua conexão.');
      btn.disabled = false; btn.textContent = 'Salvar';
    }
  });

  document.getElementById('ag-del')?.addEventListener('click', async () => {
    if (!confirm('Excluir este compromisso?')) return;
    try { await fbDeleteAgendaEvent(ev.id); modal.remove(); }
    catch(err) { alert('Erro ao excluir.'); }
  });
}

// ── INIT ──────────────────────────────────────────────────
const page = location.pathname.split('/').pop() || 'index.html';
const isLoginPage = page === 'agenda-login.html';
const isMainPage  = page === 'agenda.html';

async function initLogin() {
  const s = getSession();
  if (s) { window.location.href = 'agenda.html'; return; }

  TEAM = await fbGetTeam() || [];

  const grid = document.getElementById('names-grid');
  if (!grid) return;

  function initials(name) {
    return name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
  }

  function makeBtn(uid, name, role) {
    const btn = document.createElement('button');
    btn.className = 'name-btn';
    const isGestor = role === 'gestor';
    btn.innerHTML = `
      <div class="name-avatar${isGestor?' gestor':''}">${initials(name)}</div>
      <div class="name-info">
        <div class="name-full">${name}</div>
        <div class="name-role">${isGestor?'Gestor':'Corretor'}</div>
      </div>
      <div class="name-arrow">›</div>
    `;
    btn.addEventListener('click', () => {
      setSession({ uid, username: uid, name, role });
      window.location.href = 'agenda.html';
    });
    return btn;
  }

  grid.innerHTML = '';
  TEAM.forEach(a => {
    grid.appendChild(makeBtn(a.username || a.name, a.name, 'agent'));
  });
  grid.appendChild(makeBtn('matheus', 'Matheus', 'gestor'));
}

async function initMain() {
  session = getSession();
  if (!session) { window.location.href = 'agenda-login.html'; return; }

  document.getElementById('ag-user-label').textContent =
    `${session.name}${session.role === 'gestor' ? ' · Gestor' : ''}`;

  document.getElementById('ag-logout').addEventListener('click', () => {
    if (unsubscribe) unsubscribe();
    clearSession();
    window.location.href = 'agenda-login.html';
  });

  // Gestor vê filtro de agente; corretor só vê os próprios mas pode escolher
  TEAM = await fbGetTeam() || [];
  const agentSel = document.getElementById('ag-filter-agent');
  if (session.role === 'gestor') {
    agentSel.style.display = '';
  }

  // Nav controls
  document.querySelectorAll('.ag-view-btn').forEach(btn => {
    btn.addEventListener('click', () => { view = btn.dataset.v; renderCalendar(); });
  });
  document.getElementById('ag-prev').addEventListener('click', () => {
    const d = new Date(navDate + 'T12:00:00');
    if (view === 'day')   d.setDate(d.getDate() - 1);
    else if (view === 'week')  d.setDate(d.getDate() - 7);
    else                       d.setMonth(d.getMonth() - 1);
    navDate = d.toISOString().slice(0,10);
    renderCalendar();
  });
  document.getElementById('ag-next').addEventListener('click', () => {
    const d = new Date(navDate + 'T12:00:00');
    if (view === 'day')   d.setDate(d.getDate() + 1);
    else if (view === 'week')  d.setDate(d.getDate() + 7);
    else                       d.setMonth(d.getMonth() + 1);
    navDate = d.toISOString().slice(0,10);
    renderCalendar();
  });

  agentSel.addEventListener('change', () => { filterAgent = agentSel.value; renderCalendar(); });
  document.getElementById('ag-filter-type').addEventListener('change', e => {
    filterType = e.target.value; renderCalendar();
  });

  document.getElementById('ag-new-btn').addEventListener('click', () => openEditModal(null));

  // Listen to events
  unsubscribe = fbListenAgendaEvents(evs => {
    allEvents = evs;

    // Rebuild agent filter options
    const agents = [...new Set(evs.map(e => e.agent).filter(Boolean))].sort();
    agentSel.innerHTML = '<option value="">Todos os corretores</option>' +
      agents.map(a => `<option value="${a}"${filterAgent===a?' selected':''}>${a}</option>`).join('');

    renderCalendar();
  });
}

if (isLoginPage) initLogin();
if (isMainPage)  initMain();
