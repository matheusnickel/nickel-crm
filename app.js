// ── USERS ──────────────────────────────────────────────
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

const TIPOS = ['Casa', 'Apto', 'Terreno', 'Comercial'];
const META_DOC = 1;

// ── SEED DATA ───────────────────────────────────────────
const SEED = [
  { date: '2026-06-01', agent: 'Rian',       prosp: 30, cpd: 2, doc: 0, docDetails: [] },
  { date: '2026-06-01', agent: 'Luís',       prosp: 19, cpd: 0, doc: 0, docDetails: [] },
  { date: '2026-06-01', agent: 'Jhonnathan', prosp: 25, cpd: 1, doc: 0, docDetails: [] },
  { date: '2026-06-01', agent: 'Deisy',      prosp: 12, cpd: 1, doc: 0, docDetails: [] },
  { date: '2026-06-01', agent: 'Karen',      prosp:  8, cpd: 4, doc: 2, docDetails: [
    { nome: 'Não informado', valor: 0, bairro: 'Não informado', tipo: 'Apto' },
    { nome: 'Não informado', valor: 0, bairro: 'Não informado', tipo: 'Casa' },
  ]},
  { date: '2026-06-01', agent: 'João',       prosp:  0, cpd: 0, doc: 0, docDetails: [] },
  { date: '2026-06-01', agent: 'Felipe',     prosp:  0, cpd: 0, doc: 0, docDetails: [] },
  { date: '2026-06-01', agent: 'Bruna',      prosp:  0, cpd: 0, doc: 0, docDetails: [] },
  { date: '2026-06-02', agent: 'Rian',       prosp:  2, cpd: 1, doc: 1, docDetails: [
    { nome: 'Não informado', valor: 0, bairro: 'Não informado', tipo: 'Casa' },
  ]},
  { date: '2026-06-02', agent: 'Luís',       prosp:  0, cpd: 0, doc: 0, docDetails: [] },
  { date: '2026-06-02', agent: 'Jhonnathan', prosp:  9, cpd: 0, doc: 0, docDetails: [] },
  { date: '2026-06-02', agent: 'Deisy',      prosp:  9, cpd: 3, doc: 0, docDetails: [] },
  { date: '2026-06-02', agent: 'Karen',      prosp: 12, cpd: 4, doc: 2, docDetails: [
    { nome: 'Não informado', valor: 0, bairro: 'Não informado', tipo: 'Apto' },
    { nome: 'Não informado', valor: 0, bairro: 'Não informado', tipo: 'Terreno' },
  ]},
  { date: '2026-06-02', agent: 'João',       prosp:  3, cpd: 0, doc: 0, docDetails: [] },
  { date: '2026-06-02', agent: 'Felipe',     prosp:112, cpd: 3, doc: 0, docDetails: [] },
  { date: '2026-06-02', agent: 'Bruna',      prosp:  0, cpd: 0, doc: 0, docDetails: [] },
];

function initSeed() {
  if (!localStorage.getItem('nickel_seeded')) {
    const existing = getEntries();
    if (existing.length === 0) {
      localStorage.setItem('nickel_entries', JSON.stringify(SEED));
      localStorage.setItem('nickel_seeded', '1');
    }
  }
}

// ── STORAGE ─────────────────────────────────────────────
function getEntries() {
  return JSON.parse(localStorage.getItem('nickel_entries') || '[]');
}

function saveEntries(entries) {
  localStorage.setItem('nickel_entries', JSON.stringify(entries));
}

function upsertEntry(entry) {
  const entries = getEntries();
  const idx = entries.findIndex(e => e.date === entry.date && e.agent === entry.agent);
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  saveEntries(entries);
}

// ── EDIT COUNT ───────────────────────────────────────────
function getEditCounts() {
  return JSON.parse(localStorage.getItem('nickel_edit_count') || '{}');
}
function getEditCount(agentName, date) {
  return getEditCounts()[agentName + '_' + date] || 0;
}
function incrementEditCount(agentName, date) {
  const counts = getEditCounts();
  const key = agentName + '_' + date;
  counts[key] = (counts[key] || 0) + 1;
  localStorage.setItem('nickel_edit_count', JSON.stringify(counts));
}
function resetEditCount(agentName, date) {
  const counts = getEditCounts();
  delete counts[agentName + '_' + date];
  localStorage.setItem('nickel_edit_count', JSON.stringify(counts));
}

// ── SESSION ──────────────────────────────────────────────
function getSession() {
  return JSON.parse(localStorage.getItem('nickel_session') || 'null');
}
function setSession(user) {
  localStorage.setItem('nickel_session', JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem('nickel_session');
}

// ── DATE UTILS ───────────────────────────────────────────
function today() {
  return new Date().toISOString().split('T')[0];
}
function toDateStr(d) {
  return d.toISOString().split('T')[0];
}
function weekRange(ref) {
  const d = new Date(ref + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: toDateStr(mon), end: toDateStr(sun) };
}
function monthRange(ref) {
  const d = new Date(ref + 'T12:00:00');
  const start = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
  const last = new Date(d.getFullYear(), d.getMonth()+1, 0);
  return { start, end: toDateStr(last) };
}
function inRange(dateStr, start, end) {
  return dateStr >= start && dateStr <= end;
}
function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}
function formatCurrency(v) {
  if (!v) return '—';
  return 'R$ ' + Number(v).toLocaleString('pt-BR');
}

// ── FILTER / AGGREGATE ───────────────────────────────────
function filterEntries(period, ref) {
  const entries = getEntries();
  const t = ref || today();
  if (period === 'today') return entries.filter(e => e.date === t);
  if (period === 'week')  { const r = weekRange(t);  return entries.filter(e => inRange(e.date, r.start, r.end)); }
  if (period === 'month') { const r = monthRange(t); return entries.filter(e => inRange(e.date, r.start, r.end)); }
  return entries;
}
function sumByAgent(entries) {
  const map = {};
  for (const e of entries) {
    if (!map[e.agent]) map[e.agent] = { agent: e.agent, prosp: 0, cpd: 0, doc: 0 };
    map[e.agent].prosp += e.prosp;
    map[e.agent].cpd   += e.cpd;
    map[e.agent].doc   += e.doc;
  }
  return Object.values(map);
}

// ── STREAK ───────────────────────────────────────────────
function calcStreak(agentName) {
  const entries = getEntries().filter(e => e.agent === agentName);
  const days = [...new Set(entries.map(e => e.date))].sort().reverse();
  if (days.length === 0) return 0;
  let streak = 0;
  let cursor = new Date(today() + 'T12:00:00');
  for (let i = 0; i < days.length; i++) {
    if (days[i] === toDateStr(cursor)) { streak++; cursor.setDate(cursor.getDate() - 1); }
    else break;
  }
  return streak;
}

// ── LOGIN ────────────────────────────────────────────────
function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  const errEl = document.getElementById('login-error');
  const user = USERS[username];
  if (!user || user.password !== password) { errEl.textContent = 'Usuário ou senha incorretos.'; return; }
  setSession({ username, name: user.name, role: user.role });
  window.location.href = user.role === 'gestor' ? 'dashboard-gestor.html' : 'dashboard-agente.html';
}

// ── DOC DETAILS FORM BUILDER ─────────────────────────────
function buildDocDetailsHTML(count, prefill) {
  if (count === 0) return '';
  let html = `<div class="doc-details-wrap">
    <div class="doc-details-title">Detalhes dos ${count} DOC${count > 1 ? 's' : ''}</div>`;
  for (let i = 0; i < count; i++) {
    const pre = (prefill && prefill[i]) ? prefill[i] : { nome: '', valor: '', bairro: '', tipo: '' };
    const tipoOptions = TIPOS.map(t =>
      `<option value="${t}" ${pre.tipo === t ? 'selected' : ''}>${t}</option>`
    ).join('');
    html += `
    <div class="doc-detail-card">
      <div class="doc-detail-num">DOC ${i + 1}</div>
      <div class="doc-detail-fields">
        <div class="form-group">
          <label>Nome do proprietário</label>
          <input type="text" class="doc-nome" data-idx="${i}" placeholder="Ex: João Silva" value="${pre.nome}" required>
        </div>
        <div class="doc-detail-row2">
          <div class="form-group">
            <label>Valor (R$)</label>
            <input type="number" class="doc-valor" data-idx="${i}" placeholder="0" min="0" value="${pre.valor || ''}" required>
          </div>
          <div class="form-group">
            <label>Bairro</label>
            <input type="text" class="doc-bairro" data-idx="${i}" placeholder="Ex: Batel" value="${pre.bairro}" required>
          </div>
          <div class="form-group">
            <label>Tipo</label>
            <select class="doc-tipo" data-idx="${i}" required>
              <option value="">Selecione</option>
              ${tipoOptions}
            </select>
          </div>
        </div>
      </div>
    </div>`;
  }
  html += '</div>';
  return html;
}

function collectDocDetails(count) {
  const details = [];
  for (let i = 0; i < count; i++) {
    const nome   = document.querySelector(`.doc-nome[data-idx="${i}"]`)?.value.trim()  || '';
    const valor  = parseFloat(document.querySelector(`.doc-valor[data-idx="${i}"]`)?.value) || 0;
    const bairro = document.querySelector(`.doc-bairro[data-idx="${i}"]`)?.value.trim() || '';
    const tipo   = document.querySelector(`.doc-tipo[data-idx="${i}"]`)?.value           || '';
    details.push({ nome, valor, bairro, tipo });
  }
  return details;
}

// ── AGENT DASHBOARD ──────────────────────────────────────
function initAgentDashboard() {
  const session = getSession();
  if (!session || session.role !== 'agent') { window.location.href = 'index.html'; return; }
  document.getElementById('agent-name').textContent = session.name;
  document.getElementById('logout-btn').addEventListener('click', () => {
    clearSession(); window.location.href = 'index.html';
  });
  renderAgentDashboard(session);
}

function renderAgentDashboard(session, editing) {
  const t = today();
  const { start: wStart, end: wEnd } = weekRange(t);
  const entries = getEntries().filter(e => e.agent === session.name);
  const weekEntries = entries.filter(e => inRange(e.date, wStart, wEnd));
  const weekDoc = weekEntries.reduce((s, e) => s + e.doc, 0);

  document.getElementById('doc-week-num').textContent = weekDoc;
  document.getElementById('doc-week-meta').textContent = `Meta: ${META_DOC} DOC`;
  document.getElementById('doc-week-range').textContent = `${formatDate(wStart)} – ${formatDate(wEnd)}`;

  const statusEl = document.getElementById('week-status');
  if (weekDoc >= META_DOC) {
    statusEl.className = 'status-badge green';
    statusEl.innerHTML = '<span class="status-icon">✓</span><span>Meta da semana atingida — ' + META_DOC + ' DOC</span>';
  } else {
    const faltam = META_DOC - weekDoc;
    statusEl.className = 'status-badge red';
    statusEl.innerHTML = `<span class="status-icon">!</span><span>Falta${faltam > 1 ? 'm' : ''} <strong>${faltam} DOC</strong> para atingir a meta desta semana</span>`;
  }

  document.getElementById('streak-num').textContent = calcStreak(session.name);

  const sentToday = entries.find(e => e.date === t);
  const editCount = getEditCount(session.name, t);
  const canEdit = editCount < 1;
  const formWrap = document.getElementById('form-wrap');

  if (sentToday && !editing) {
    const docSummary = (sentToday.docDetails || []).map((d, i) =>
      `<div class="doc-summary-item">DOC ${i+1}: <strong>${d.nome}</strong> · ${d.tipo} · ${d.bairro} · ${formatCurrency(d.valor)}</div>`
    ).join('');

    const editBtn = canEdit
      ? `<button class="btn btn-outline" id="edit-today-btn" style="margin-top:14px;font-size:13px;padding:9px">Corrigir lançamento de hoje</button>`
      : `<div style="margin-top:14px;padding:10px 14px;background:rgba(224,62,62,.08);border:1px solid rgba(224,62,62,.25);border-radius:8px;font-size:12px;color:#ff6b6b;text-align:center">
           Correção já utilizada. Para nova alteração, fale com o gestor.
         </div>`;

    formWrap.innerHTML = `
      <div class="sent-today">
        <div style="font-size:24px;margin-bottom:6px">✓</div>
        <div style="font-weight:600;color:#f0f0f0">Relatório enviado hoje</div>
        <div style="font-size:13px;margin-top:6px;color:var(--text-muted)">
          PROSP <strong style="color:#f0f0f0">${sentToday.prosp}</strong>
          &nbsp;·&nbsp; CPD <strong style="color:#f0f0f0">${sentToday.cpd}</strong>
          &nbsp;·&nbsp; DOC <strong style="color:#f0f0f0">${sentToday.doc}</strong>
        </div>
        ${docSummary ? `<div class="doc-summary-list">${docSummary}</div>` : ''}
        ${editBtn}
      </div>`;
    if (canEdit) {
      document.getElementById('edit-today-btn').addEventListener('click', () => renderAgentDashboard(session, true));
    }
  } else {
    const pre = sentToday || { prosp: 0, cpd: 0, doc: 0, docDetails: [] };
    const docCount = pre.doc || 0;

    formWrap.innerHTML = `
      <form class="daily-form" id="daily-form">
        ${sentToday ? '<div style="font-size:12px;color:var(--gold);margin-bottom:12px;text-align:center">Editando lançamento de hoje</div>' : ''}
        <div class="fields-row">
          <div class="field-box">
            <label>PROSP</label>
            <input type="number" id="f-prosp" min="0" value="${pre.prosp}" required>
          </div>
          <div class="field-box">
            <label>CPD</label>
            <input type="number" id="f-cpd" min="0" value="${pre.cpd}" required>
          </div>
          <div class="field-box">
            <label>DOC</label>
            <input type="number" id="f-doc" min="0" value="${pre.doc}" required>
          </div>
        </div>
        <div id="doc-details-area">${buildDocDetailsHTML(docCount, pre.docDetails)}</div>
        <button type="submit" class="btn" style="margin-top:14px">${sentToday ? 'Salvar correção' : 'Enviar relatório'}</button>
        ${sentToday ? '<button type="button" class="btn btn-outline" id="cancel-edit-btn" style="margin-top:8px">Cancelar</button>' : ''}
      </form>`;

    // Update doc details when DOC value changes
    document.getElementById('f-doc').addEventListener('input', function() {
      const n = Math.max(0, parseInt(this.value) || 0);
      document.getElementById('doc-details-area').innerHTML = buildDocDetailsHTML(n, []);
    });

    document.getElementById('daily-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const docVal = parseInt(document.getElementById('f-doc').value) || 0;
      const docDetails = collectDocDetails(docVal);

      // validate doc details
      for (let i = 0; i < docDetails.length; i++) {
        const d = docDetails[i];
        if (!d.nome || !d.bairro || !d.tipo) {
          alert(`Preencha todos os campos do DOC ${i+1} para continuar.`);
          return;
        }
      }

      const isEdit = !!sentToday;
      upsertEntry({
        date:  t,
        agent: session.name,
        prosp: parseInt(document.getElementById('f-prosp').value) || 0,
        cpd:   parseInt(document.getElementById('f-cpd').value)   || 0,
        doc:   docVal,
        docDetails,
      });
      if (isEdit) incrementEditCount(session.name, t);
      renderAgentDashboard(session);
    });

    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => renderAgentDashboard(session));
  }

  // Histórico
  const historyBody = document.getElementById('history-body');
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  if (sorted.length === 0) {
    historyBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">Nenhum registro</td></tr>';
  } else {
    historyBody.innerHTML = sorted.map(e => `
      <tr>
        <td>${formatDate(e.date)}</td>
        <td class="num-cell">${e.prosp}</td>
        <td class="num-cell">${e.cpd}</td>
        <td class="num-cell">${e.doc}</td>
      </tr>`).join('');
  }
}

// ── GESTOR DASHBOARD ────────────────────────────────────
let gestorChart = null;
let docStatusChart = null;
let tipoChart = null;
let activePeriod = 'week';
let activeConvMode = 'prosp-cpd';

const PODIUM = ['', 'gold', 'silver', 'bronze'];
const PODIUM_LABEL = ['', '🥇', '🥈', '🥉'];

function initGestorDashboard() {
  const session = getSession();
  if (!session || session.role !== 'gestor') { window.location.href = 'index.html'; return; }
  document.getElementById('gestor-name').textContent = session.name;
  document.getElementById('logout-btn').addEventListener('click', () => {
    clearSession(); window.location.href = 'index.html';
  });
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activePeriod = btn.dataset.period;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGestorDashboard();
    });
  });
  renderGestorDashboard();
  initDayView();
}

function renderGestorDashboard() {
  const entries = filterEntries(activePeriod);
  const byAgent = sumByAgent(entries);
  const agentNames = Object.keys(USERS).filter(k => USERS[k].role === 'agent').map(k => USERS[k].name);

  // Totals
  const totProsp = byAgent.reduce((s, a) => s + a.prosp, 0);
  const totCpd   = byAgent.reduce((s, a) => s + a.cpd,   0);
  const totDoc   = byAgent.reduce((s, a) => s + a.doc,   0);
  document.getElementById('tot-prosp').textContent = totProsp;
  document.getElementById('tot-cpd').textContent   = totCpd;
  document.getElementById('tot-doc').textContent   = totDoc;

  // Ranking
  const ranked = [...byAgent].sort((a, b) =>
    b.doc !== a.doc ? b.doc - a.doc :
    b.cpd !== a.cpd ? b.cpd - a.cpd :
    b.prosp - a.prosp
  );

  const rankBody = document.getElementById('rank-body');
  rankBody.innerHTML = ranked.map((a, i) => {
    const pos = i + 1;
    const badgeClass = pos <= 3 ? PODIUM[pos] : '';
    const medal = pos <= 3 ? PODIUM_LABEL[pos] : pos;
    return `
      <tr class="${pos <= 3 ? 'podium-row podium-' + pos : ''}">
        <td><span class="rank-badge ${badgeClass}">${medal}</span></td>
        <td class="agent-name-cell">${a.agent}</td>
        <td class="num-cell doc-cell">${a.doc}</td>
        <td class="num-cell">${a.cpd}</td>
        <td class="num-cell dim-cell">${a.prosp}</td>
      </tr>`;
  }).join('');

  // Gráfico desempenho
  const agentMap = {};
  byAgent.forEach(a => { agentMap[a.agent] = a; });
  const labels    = agentNames;
  const prospData = labels.map(n => agentMap[n] ? agentMap[n].prosp : 0);
  const cpdData   = labels.map(n => agentMap[n] ? agentMap[n].cpd   : 0);
  const docData   = labels.map(n => agentMap[n] ? agentMap[n].doc   : 0);

  const ctx = document.getElementById('team-chart').getContext('2d');
  if (gestorChart) gestorChart.destroy();
  gestorChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'PROSP', data: prospData, backgroundColor: 'rgba(201,168,76,.45)', borderColor: '#c9a84c', borderWidth: 1 },
        { label: 'CPD',   data: cpdData,   backgroundColor: 'rgba(100,149,237,.45)', borderColor: '#6495ed', borderWidth: 1 },
        { label: 'DOC',   data: docData,   backgroundColor: 'rgba(46,204,113,.7)',  borderColor: '#2ecc71', borderWidth: 1 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#888', font: { family: 'DM Sans', size: 12 } } } },
      scales: {
        x: { ticks: { color: '#888', font: { family: 'DM Sans', size: 11 } }, grid: { color: '#1a1a1a' } },
        y: { ticks: { color: '#888', font: { family: 'DM Sans' } }, grid: { color: '#1a1a1a' }, beginAtZero: true },
      }
    }
  });

  // Gráfico DOC semana (verde/vermelho)
  const { start: wStart, end: wEnd } = weekRange(today());
  const weekAll = getEntries().filter(e => inRange(e.date, wStart, wEnd));
  const weekDocMap = {};
  weekAll.forEach(e => { weekDocMap[e.agent] = (weekDocMap[e.agent] || 0) + e.doc; });

  const docCtx = document.getElementById('doc-status-chart').getContext('2d');
  if (docStatusChart) docStatusChart.destroy();
  const docColors  = agentNames.map(n => (weekDocMap[n] || 0) >= META_DOC ? 'rgba(46,204,113,.8)' : 'rgba(224,62,62,.7)');
  const docBorders = agentNames.map(n => (weekDocMap[n] || 0) >= META_DOC ? '#2ecc71' : '#e03e3e');
  docStatusChart = new Chart(docCtx, {
    type: 'bar',
    data: {
      labels: agentNames,
      datasets: [{ label: 'DOC na semana', data: agentNames.map(n => weekDocMap[n] || 0), backgroundColor: docColors, borderColor: docBorders, borderWidth: 1 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#888', font: { family: 'DM Sans', size: 11 } }, grid: { color: '#1a1a1a' } },
        y: { ticks: { color: '#888', font: { family: 'DM Sans' }, stepSize: 1 }, grid: { color: '#1a1a1a' }, beginAtZero: true },
      }
    }
  });

  // Gráfico por tipo de imóvel
  const allDocs = entries.flatMap(e => e.docDetails || []);
  const tipoCounts = {};
  TIPOS.forEach(t => { tipoCounts[t] = 0; });
  allDocs.forEach(d => { if (d.tipo && tipoCounts[d.tipo] !== undefined) tipoCounts[d.tipo]++; });

  const tipoCtx = document.getElementById('tipo-chart').getContext('2d');
  if (tipoChart) tipoChart.destroy();
  tipoChart = new Chart(tipoCtx, {
    type: 'doughnut',
    data: {
      labels: TIPOS,
      datasets: [{
        data: TIPOS.map(t => tipoCounts[t]),
        backgroundColor: ['rgba(201,168,76,.8)', 'rgba(100,149,237,.8)', 'rgba(46,204,113,.8)', 'rgba(230,126,34,.8)'],
        borderColor: ['#c9a84c', '#6495ed', '#2ecc71', '#e67e22'],
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#888', font: { family: 'DM Sans', size: 12 }, padding: 16 } },
      }
    }
  });

  // DOC list (tabela de DOCs com detalhes)
  renderDocList(entries);

  // Conversão
  renderConversion(ranked);
  document.querySelectorAll('.conv-mode-btn').forEach(b => {
    b.onclick = () => {
      activeConvMode = b.dataset.mode;
      document.querySelectorAll('.conv-mode-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      renderConversion(ranked);
    };
    if (b.dataset.mode === activeConvMode) b.classList.add('active');
    else b.classList.remove('active');
  });
}

function renderDocList(entries) {
  const allDocRows = [];
  entries.forEach(e => {
    (e.docDetails || []).forEach((d, i) => {
      allDocRows.push({ date: e.date, agent: e.agent, idx: i, ...d });
    });
  });
  allDocRows.sort((a, b) => b.date.localeCompare(a.date));

  const wrap = document.getElementById('doc-list-wrap');
  if (allDocRows.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Nenhum DOC registrado no período</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="data-table" style="table-layout:auto">
      <thead>
        <tr>
          <th>Data</th>
          <th>Angariador</th>
          <th>Proprietário</th>
          <th>Tipo</th>
          <th>Bairro</th>
          <th class="num-cell">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${allDocRows.map(d => `
          <tr>
            <td style="white-space:nowrap">${formatDate(d.date)}</td>
            <td>${d.agent}</td>
            <td style="font-weight:500">${d.nome || '—'}</td>
            <td><span class="tipo-tag tipo-${(d.tipo||'').toLowerCase()}">${d.tipo || '—'}</span></td>
            <td>${d.bairro || '—'}</td>
            <td class="num-cell">${formatCurrency(d.valor)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ── GESTOR: CONSULTA POR DIA ─────────────────────────────
function initDayView() {
  const input = document.getElementById('day-input');
  input.value = today();
  input.addEventListener('change', () => renderDayView(input.value));
  renderDayView(input.value);
}

function renderDayView(dateStr) {
  if (!dateStr) return;
  const agentNames = Object.keys(USERS).filter(k => USERS[k].role === 'agent').map(k => USERS[k].name);
  const entries = getEntries();
  const wrap = document.getElementById('day-view-wrap');

  const rows = agentNames.map(name => {
    const e = entries.find(x => x.date === dateStr && x.agent === name);
    const hasEntry = !!e;
    return `
      <tr data-agent="${name}" data-has="${hasEntry}">
        <td>${name}</td>
        <td class="num-cell">
          ${hasEntry ? `<input class="inline-edit-input" data-field="prosp" type="number" min="0" value="${e.prosp}">` : '<span style="color:var(--text-muted)">—</span>'}
        </td>
        <td class="num-cell">
          ${hasEntry ? `<input class="inline-edit-input" data-field="cpd" type="number" min="0" value="${e.cpd}">` : '<span style="color:var(--text-muted)">—</span>'}
        </td>
        <td class="num-cell">
          ${hasEntry ? `<input class="inline-edit-input" data-field="doc" type="number" min="0" value="${e.doc}">` : '<span style="color:var(--text-muted)">—</span>'}
        </td>
      </tr>`;
  });

  wrap.innerHTML = `
    <table class="data-table rank-table" style="table-layout:fixed">
      <colgroup><col style="width:auto"><col style="width:70px"><col style="width:70px"><col style="width:70px"></colgroup>
      <thead>
        <tr>
          <th>Angariador</th>
          <th class="num-cell">PROSP</th>
          <th class="num-cell">CPD</th>
          <th class="num-cell doc-th">DOC</th>
        </tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    <button class="save-day-btn" id="save-day-btn">Salvar alterações do dia</button>`;

  document.getElementById('save-day-btn').addEventListener('click', () => {
    wrap.querySelectorAll('tbody tr').forEach(tr => {
      if (tr.dataset.has !== 'true') return;
      const name  = tr.dataset.agent;
      const prosp = parseInt(tr.querySelector('[data-field="prosp"]').value) || 0;
      const cpd   = parseInt(tr.querySelector('[data-field="cpd"]').value)   || 0;
      const doc   = parseInt(tr.querySelector('[data-field="doc"]').value)   || 0;
      const existing = getEntries().find(e => e.date === dateStr && e.agent === name);
      upsertEntry({ date: dateStr, agent: name, prosp, cpd, doc, docDetails: existing?.docDetails || [] });
      resetEditCount(name, dateStr);
    });
    const btn = document.getElementById('save-day-btn');
    btn.textContent = 'Salvo ✓'; btn.style.background = '#2ecc71';
    setTimeout(() => { btn.textContent = 'Salvar alterações do dia'; btn.style.background = ''; }, 2000);
    renderGestorDashboard();
  });
}

// ── CONVERSÃO ────────────────────────────────────────────
function renderConversion(ranked) {
  const convList = document.getElementById('conv-list');
  if (!ranked.length) { convList.innerHTML = '<div class="empty-state">Sem dados</div>'; return; }
  const isProspCpd = activeConvMode === 'prosp-cpd';
  const rows = ranked.map((a, i) => {
    const num = isProspCpd ? a.cpd : a.doc;
    const den = isProspCpd ? a.prosp : a.cpd;
    const label = isProspCpd ? 'CPD / PROSP' : 'DOC / CPD';
    const pct = den > 0 ? ((num / den) * 100).toFixed(1) + '%' : '—';
    const ratio = den > 0 ? `${num} de ${den}` : '—';
    const pos = i + 1;
    const medal = pos <= 3 ? PODIUM_LABEL[pos] : '';
    return `
      <div class="conv-card">
        <div class="conv-card-header">
          <span class="conv-agent">${medal} ${a.agent}</span>
          <span class="conv-pct ${pct === '—' ? 'muted' : ''}">${pct}</span>
        </div>
        <div class="conv-bar-wrap">
          <div class="conv-bar" style="width:${den > 0 ? Math.min((num/den)*100, 100) : 0}%"></div>
        </div>
        <div class="conv-detail">${label}: ${ratio}</div>
      </div>`;
  });
  convList.innerHTML = rows.join('');
}
