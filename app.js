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

// ── SEED DATA ───────────────────────────────────────────
const SEED = [
  { date: '2026-06-01', agent: 'Rian',       prosp: 30, cpd: 2, doc: 0 },
  { date: '2026-06-01', agent: 'Luís',       prosp: 19, cpd: 0, doc: 0 },
  { date: '2026-06-01', agent: 'Jhonnathan', prosp: 25, cpd: 1, doc: 0 },
  { date: '2026-06-01', agent: 'Deisy',      prosp: 12, cpd: 1, doc: 0 },
  { date: '2026-06-01', agent: 'Karen',      prosp:  8, cpd: 4, doc: 2 },
  { date: '2026-06-01', agent: 'João',       prosp:  0, cpd: 0, doc: 0 },
  { date: '2026-06-01', agent: 'Felipe',     prosp:  0, cpd: 0, doc: 0 },
  { date: '2026-06-01', agent: 'Bruna',      prosp:  0, cpd: 0, doc: 0 },
  { date: '2026-06-02', agent: 'Rian',       prosp:  2, cpd: 1, doc: 1 },
  { date: '2026-06-02', agent: 'Luís',       prosp:  0, cpd: 0, doc: 0 },
  { date: '2026-06-02', agent: 'Jhonnathan', prosp:  9, cpd: 0, doc: 0 },
  { date: '2026-06-02', agent: 'Deisy',      prosp:  9, cpd: 3, doc: 0 },
  { date: '2026-06-02', agent: 'Karen',      prosp: 12, cpd: 4, doc: 2 },
  { date: '2026-06-02', agent: 'João',       prosp:  3, cpd: 0, doc: 0 },
  { date: '2026-06-02', agent: 'Felipe',     prosp:112, cpd: 3, doc: 0 },
  { date: '2026-06-02', agent: 'Bruna',      prosp:  0, cpd: 0, doc: 0 },
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

function addEntry(entry) {
  const entries = getEntries();
  entries.push(entry);
  saveEntries(entries);
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
  const day = d.getDay(); // 0=Sun
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
  const end = toDateStr(last);
  return { start, end };
}

function inRange(dateStr, start, end) {
  return dateStr >= start && dateStr <= end;
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// ── FILTER ENTRIES ───────────────────────────────────────
function filterEntries(period, ref) {
  const entries = getEntries();
  const t = ref || today();
  if (period === 'today') return entries.filter(e => e.date === t);
  if (period === 'week')  { const r = weekRange(t); return entries.filter(e => inRange(e.date, r.start, r.end)); }
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
    const expected = toDateStr(cursor);
    if (days[i] === expected) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
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
  if (!user || user.password !== password) {
    errEl.textContent = 'Usuário ou senha incorretos.';
    return;
  }

  setSession({ username, name: user.name, role: user.role });
  if (user.role === 'gestor') {
    window.location.href = 'dashboard-gestor.html';
  } else {
    window.location.href = 'dashboard-agente.html';
  }
}

// ── AGENT DASHBOARD ──────────────────────────────────────
function initAgentDashboard() {
  const session = getSession();
  if (!session || session.role !== 'agent') {
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('agent-name').textContent = session.name;
  document.getElementById('logout-btn').addEventListener('click', () => {
    clearSession();
    window.location.href = 'index.html';
  });

  renderAgentDashboard(session);
}

function renderAgentDashboard(session) {
  const t = today();
  const { start: wStart, end: wEnd } = weekRange(t);
  const entries = getEntries().filter(e => e.agent === session.name);

  // DOC da semana
  const weekEntries = entries.filter(e => inRange(e.date, wStart, wEnd));
  const weekDoc = weekEntries.reduce((s, e) => s + e.doc, 0);

  document.getElementById('doc-week-num').textContent = weekDoc;
  document.getElementById('doc-week-range').textContent =
    `${formatDate(wStart)} – ${formatDate(wEnd)}`;

  // Status meta
  const statusEl = document.getElementById('week-status');
  if (weekDoc >= 1) {
    statusEl.className = 'status-badge green';
    statusEl.innerHTML = '<span class="status-icon">✓</span><span>Meta da semana atingida</span>';
  } else {
    statusEl.className = 'status-badge red';
    statusEl.innerHTML = '<span class="status-icon">!</span><span>Você ainda não atingiu sua meta essa semana</span>';
  }

  // Streak
  document.getElementById('streak-num').textContent = calcStreak(session.name);

  // Form / sent today
  const sentToday = entries.find(e => e.date === t);
  const formWrap = document.getElementById('form-wrap');
  if (sentToday) {
    formWrap.innerHTML = `
      <div class="sent-today">
        <div style="font-size:24px;margin-bottom:6px">✓</div>
        <div style="font-weight:600;color:#f0f0f0">Relatório enviado hoje</div>
        <div style="font-size:12px;margin-top:4px">PROSP ${sentToday.prosp} · CPD ${sentToday.cpd} · DOC ${sentToday.doc}</div>
      </div>`;
  } else {
    formWrap.innerHTML = `
      <form class="daily-form" id="daily-form">
        <div class="fields-row">
          <div class="field-box">
            <label>PROSP</label>
            <input type="number" id="f-prosp" min="0" value="0" required>
          </div>
          <div class="field-box">
            <label>CPD</label>
            <input type="number" id="f-cpd" min="0" value="0" required>
          </div>
          <div class="field-box">
            <label>DOC</label>
            <input type="number" id="f-doc" min="0" value="0" required>
          </div>
        </div>
        <button type="submit" class="btn">Enviar relatório</button>
      </form>`;
    document.getElementById('daily-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const entry = {
        date:  today(),
        agent: session.name,
        prosp: parseInt(document.getElementById('f-prosp').value) || 0,
        cpd:   parseInt(document.getElementById('f-cpd').value)   || 0,
        doc:   parseInt(document.getElementById('f-doc').value)   || 0,
      };
      addEntry(entry);
      renderAgentDashboard(session);
    });
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
let activePeriod = 'week';

function initGestorDashboard() {
  const session = getSession();
  if (!session || session.role !== 'gestor') {
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('gestor-name').textContent = session.name;
  document.getElementById('logout-btn').addEventListener('click', () => {
    clearSession();
    window.location.href = 'index.html';
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
}

function renderGestorDashboard() {
  const entries = filterEntries(activePeriod);
  const byAgent = sumByAgent(entries);
  const agentNames = Object.keys(USERS).filter(k => USERS[k].role === 'agent').map(k => USERS[k].name);

  // totals
  const totProsp = byAgent.reduce((s, a) => s + a.prosp, 0);
  const totCpd   = byAgent.reduce((s, a) => s + a.cpd,   0);
  const totDoc   = byAgent.reduce((s, a) => s + a.doc,   0);
  document.getElementById('tot-prosp').textContent = totProsp;
  document.getElementById('tot-cpd').textContent   = totCpd;
  document.getElementById('tot-doc').textContent   = totDoc;

  // ranking
  const ranked = [...byAgent].sort((a, b) =>
    b.doc !== a.doc ? b.doc - a.doc :
    b.cpd !== a.cpd ? b.cpd - a.cpd :
    b.prosp - a.prosp
  );

  const rankBody = document.getElementById('rank-body');
  rankBody.innerHTML = ranked.map((a, i) => `
    <tr>
      <td><span class="rank-badge ${i === 0 ? 'gold' : ''}">${i+1}</span></td>
      <td>${a.agent}</td>
      <td class="num-cell">${a.prosp}</td>
      <td class="num-cell">${a.cpd}</td>
      <td class="num-cell">${a.doc}</td>
    </tr>`).join('');

  // chart
  const labels = agentNames;
  const agentMap = {};
  byAgent.forEach(a => { agentMap[a.agent] = a; });
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
        { label: 'PROSP', data: prospData, backgroundColor: 'rgba(201,168,76,.5)', borderColor: '#c9a84c', borderWidth: 1 },
        { label: 'CPD',   data: cpdData,   backgroundColor: 'rgba(100,149,237,.5)', borderColor: '#6495ed', borderWidth: 1 },
        { label: 'DOC',   data: docData,   backgroundColor: 'rgba(46,204,113,.5)', borderColor: '#2ecc71', borderWidth: 1 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#888', font: { family: 'DM Sans' } } } },
      scales: {
        x: { ticks: { color: '#888', font: { family: 'DM Sans', size: 11 } }, grid: { color: '#1a1a1a' } },
        y: { ticks: { color: '#888', font: { family: 'DM Sans' } }, grid: { color: '#1a1a1a' }, beginAtZero: true },
      }
    }
  });

  // conversions
  const convWrap = document.getElementById('conv-list');
  convWrap.innerHTML = ranked.map(a => {
    const p2d = a.doc > 0 ? (a.prosp / a.doc).toFixed(1) : '—';
    const c2d = a.doc > 0 ? (a.cpd   / a.doc).toFixed(1) : '—';
    return `
      <div class="conversion-row">
        <span class="conv-name">${a.agent}</span>
        <span class="conv-vals">
          <span>PROSP/DOC <span>${p2d}</span></span>
          <span>CPD/DOC <span>${c2d}</span></span>
        </span>
      </div>`;
  }).join('') || '<div class="empty-state">Sem dados</div>';

  // alerts
  const t = today();
  const todayEntries = getEntries().filter(e => e.date === t);
  const sentToday = new Set(todayEntries.map(e => e.agent));
  const { start: wStart, end: wEnd } = weekRange(t);
  const weekAll = getEntries().filter(e => inRange(e.date, wStart, wEnd));
  const weekDocMap = {};
  weekAll.forEach(e => { weekDocMap[e.agent] = (weekDocMap[e.agent] || 0) + e.doc; });

  const alertsEl = document.getElementById('alerts-list');
  let alertsHTML = '';

  agentNames.forEach(name => {
    if (!sentToday.has(name)) {
      alertsHTML += `
        <div class="alert-item red">
          <span class="a-name">${name}</span>
          <span class="a-tag">Sem relatório hoje</span>
        </div>`;
    }
    if ((weekDocMap[name] || 0) === 0) {
      alertsHTML += `
        <div class="alert-item orange">
          <span class="a-name">${name}</span>
          <span class="a-tag">DOC zero na semana</span>
        </div>`;
    }
  });

  alertsEl.innerHTML = alertsHTML || '<div class="empty-state">Nenhum alerta</div>';
}
