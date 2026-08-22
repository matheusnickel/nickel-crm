import { fbUpsertEntry, fbDeleteEntry, fbSeedIfFirstTime, fbListen, fbGetTeam, fbSaveTeam, fbGetOfertas, fbSaveOferta, fbDeleteOferta, fbSaveSale, fbDeleteSale, fbListenSales, fbGetVideoAuth, fbSaveVideoAuth, fbRenameAgent, fbMigrateToUid, fbUpdateAgentDisplayName } from './firebase.js';

// ── USERS (deve vir antes de TEAM) ───────────────────────
const USERS = {
  deisy:      { name: 'Deyse Brito',         role: 'agent',  password: 'nickel123' },
  luis:       { name: 'Luiz Davaro',         role: 'agent',  password: 'nickel123' },
  jhonnathan: { name: 'Jhonnathan Pinheiro', role: 'agent',  password: 'nickel123' },
  joao:       { name: 'João Andrade',        role: 'agent',  password: 'nickel123' },
  felipe:     { name: 'Felipe Moreira',      role: 'agent',  password: 'nickel123' },
  karen:      { name: 'Karen Abreu',         role: 'agent',  password: 'nickel123' },
  alex:       { name: 'Aleksander Vaz',      role: 'agent',  password: 'nickel123' },
  konrad:     { name: 'Konrad Horst',        role: 'agent',  password: 'nickel123' },
  fernanda:   { name: 'Fernanda Prochnow',   role: 'agent',  password: 'nickel123' },
  matheus:    { name: 'Matheus',             role: 'gestor', password: 'nickel123' },
};

// ── TEAM (após USERS) ────────────────────────────────────
// username = chave curta de login; name = nome completo exibido no sistema
let TEAM = Object.keys(USERS)
  .filter(k => USERS[k].role === 'agent')
  .map(k => ({ username: k, name: USERS[k].name, password: USERS[k].password }));

function getAgentNames() { return TEAM.map(a => a.name); }

async function loadTeam() {
  try {
    const remote = await fbGetTeam();
    if (remote && remote.length > 0) {
      const needsUpgrade = remote.some(a => !a.username);
      if (needsUpgrade) {
        // Upgrade: add username fields using USERS map
        const byName = Object.fromEntries(Object.entries(USERS).map(([k,v])=>[v.name, k]));
        TEAM = remote.map(a => {
          const canonName = normalizeAgentName(a.name);
          const ukey = byName[canonName];
          return ukey ? { username: ukey, name: USERS[ukey].name, password: a.password || USERS[ukey].password } : null;
        }).filter(Boolean);
        if (TEAM.length === 0) TEAM = Object.keys(USERS).filter(k=>USERS[k].role==='agent').map(k=>({username:k,name:USERS[k].name,password:USERS[k].password}));
        await fbSaveTeam(TEAM);
        console.log('✅ TEAM atualizado com campos username');
      } else {
        TEAM = remote;
      }
    } else {
      await fbSaveTeam(TEAM);
    }
  } catch(e) { console.warn('loadTeam error, using defaults', e); }
}

const TIPOS   = ['Casa', 'Apto', 'Studio', 'Terreno', 'Comercial'];

const STATUS_OPTIONS = [
  { value: '',      label: '—',                 color: 'var(--text-muted)' },
  { value: 'FOTOS', label: 'FOTOS',             color: '#e67e22' },
  { value: 'AVI',   label: 'AV ASSINADA',                       color: '#3498db' },
  { value: 'AV',    label: 'FALTA ASSINAR', color: '#9b59b6' },
  { value: 'SITE',  label: 'SITE',              color: '#a8e63d' },
];
const CPD_STATUS_OPTIONS = [
  { value: '',          label: '—' },
  { value: 'tratativa', label: 'EM TRATATIVA' },
  { value: 'doc',       label: 'VIROU DOC' },
  { value: 'descarte',  label: 'DESCARTE' },
];
const BAIRROS = ['Batel','Água Verde','Bigorrilho','Ecoville','Cabral','Juvevê','Mercês','Campo Comprido','Santa Felicidade','Santo Inácio','Vila Izabel'];
const META_DOC_MONTH = 12;
const META_DOC_GESTOR = 80;
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
  await fbUpsertEntry(entry); // throws on network error → caller must catch
}

// ── VIDEO AUTH STATE ────────────────────────────────────
// videoAuthData: { "Agent_YYYY-MM": [{ts, count}], ... }
let videoAuthData = {};

async function loadVideoAuth() {
  try { videoAuthData = await fbGetVideoAuth(); } catch(e) { videoAuthData = {}; }
}

function videoAuthKey(agent, period) { return `${agent}_${period}`; }

function getAuthorizedTotal(agent, period) {
  const recs = videoAuthData[videoAuthKey(agent, period)] || [];
  return recs.reduce((s, r) => s + r.count, 0);
}

function hasAnyAuth(agent, period) {
  return (videoAuthData[videoAuthKey(agent, period)] || []).length > 0;
}

async function addVideoAuthorization(agent, period, count) {
  const key = videoAuthKey(agent, period);
  if (!videoAuthData[key]) videoAuthData[key] = [];
  videoAuthData[key].push({ ts: new Date().toISOString(), count });
  await fbSaveVideoAuth(videoAuthData);
}

function effectiveVideo(e) {
  return typeof e.videoApproved === 'number' ? e.videoApproved : (e.video || 0);
}

async function updateDocNota(date, agent, docIdx, nota) {
  const entries = getEntries();
  const entry = entries.find(e => e.date===date && e.agent===agent);
  if (!entry || !entry.docDetails[docIdx]) return;
  entry.docDetails[docIdx].nota = nota;
  localUpsert(entry);
  try { await fbUpsertEntry(entry); } catch(e) { alert('❌ Erro ao salvar nota. Verifique sua conexão.'); }
}

// ── VA DETAILS (Visita Agendada — Treino Livre) ──────────
function buildVaDetailsHTML(count, prefill=[]) {
  if (count === 0) return '';
  const selSt = 'background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:\'DM Sans\',sans-serif;font-size:13px;padding:8px 6px;outline:none;flex:1';
  const inpSt = 'background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:\'DM Sans\',sans-serif;font-size:13px;padding:8px 10px;outline:none;width:100%';
  const hours = Array.from({length:24},(_,h)=>`<option value="${String(h).padStart(2,'0')}">${String(h).padStart(2,'0')}h</option>`).join('');
  const mins  = ['00','05','10','15','20','25','30','35','40','45','50','55'].map(m=>`<option value="${m}">${m}min</option>`).join('');

  let html = '<div class="cpd-details-wrap">';
  for (let i = 0; i < count; i++) {
    const p = prefill[i] || {};
    const [pH='', pMin=''] = (p.horario||'').split(':');
    html += `<div class="va-detail-item">
      <div class="va-label">🏎️ VA ${i+1}</div>
      <input class="va-nome" data-idx="${i}" type="text" placeholder="Nome do cliente" value="${(p.nome||'').replace(/"/g,'&quot;')}">
      <input class="va-imovel" data-idx="${i}" type="text" placeholder="Imóvel (endereço/ref)" value="${(p.imovel||'').replace(/"/g,'&quot;')}">
      <input class="va-dataagend" data-idx="${i}" type="date" value="${p.dataAgend||''}">
      <div class="va-row">
        <select class="va-hour" data-idx="${i}"><option value="">Hora</option>${hours.replace(`value="${pH}"`,`value="${pH}" selected`)}</select>
        <select class="va-min" data-idx="${i}"><option value="">Min</option>${mins.replace(`value="${pMin}"`,`value="${pMin}" selected`)}</select>
      </div>
    </div>`;
  }
  return html + '</div>';
}
function collectVaDetails(count) {
  const d=[];
  for (let i=0;i<count;i++) {
    const hour = document.querySelector(`.va-hour[data-idx="${i}"]`)?.value||'';
    const min  = document.querySelector(`.va-min[data-idx="${i}"]`)?.value||'';
    d.push({
      nome:      document.querySelector(`.va-nome[data-idx="${i}"]`)?.value.trim()||'',
      imovel:    document.querySelector(`.va-imovel[data-idx="${i}"]`)?.value.trim()||'',
      dataAgend: document.querySelector(`.va-dataagend[data-idx="${i}"]`)?.value||'',
      horario:   hour && min ? `${hour}:${min}` : '',
    });
  }
  return d;
}

// ── VR DETAILS (Visita Realizada — Pit Stop) ─────────────
function buildVrDetailsHTML(count, prefill=[]) {
  if (count === 0) return '';
  let html = '<div class="cpd-details-wrap">';
  for (let i = 0; i < count; i++) {
    const p = prefill[i] || {};
    html += `<div class="cpd-detail-item">
      <span class="cpd-detail-label" style="color:#f97316">VR ${i+1}</span>
      <input class="vr-nome" data-idx="${i}" type="text" placeholder="Nome do cliente comprador" value="${(p.nome||'').replace(/"/g,'&quot;')}">
      <input class="vr-tel" data-idx="${i}" type="tel" placeholder="Telefone" value="${(p.telefone ? formatPhone(p.telefone) : '').replace(/"/g,'&quot;')}">
    </div>`;
  }
  return html + '</div>';
}
function collectVrDetails(count) {
  const d=[];
  for (let i=0;i<count;i++) d.push({ nome:document.querySelector(`.vr-nome[data-idx="${i}"]`)?.value.trim()||'', telefone:document.querySelector(`.vr-tel[data-idx="${i}"]`)?.value.trim()||'' });
  return d;
}

// ── CPD DETAILS ──────────────────────────────────────────
function buildCpdDetailsHTML(count, prefill=[]) {
  if (count === 0) return '';
  let html = '<div class="cpd-details-wrap">';
  for (let i = 0; i < count; i++) {
    const p = prefill[i] || {};
    html += `<div class="cpd-detail-item">
      <span class="cpd-detail-label">CQ ${i+1}</span>
      <input class="cpd-nome" data-idx="${i}" type="text" placeholder="Nome do proprietário" value="${(p.nome||'').replace(/"/g,'&quot;')}">
      <input class="cpd-tel" data-idx="${i}" type="tel" placeholder="Telefone" value="${(p.telefone ? formatPhone(p.telefone) : '').replace(/"/g,'&quot;')}">
    </div>`;
  }
  html += '</div>';
  return html;
}

function collectCpdDetails(count) {
  const details = [];
  for (let i = 0; i < count; i++) {
    details.push({
      nome:     document.querySelector(`.cpd-nome[data-idx="${i}"]`)?.value.trim() || '',
      telefone: document.querySelector(`.cpd-tel[data-idx="${i}"]`)?.value.trim() || '',
      status: '',
      motivo: '',
    });
  }
  return details;
}

async function updateCpdDetail(date, agent, cpdIdx, fields) {
  const entries = getEntries();
  const entry = entries.find(e => e.date===date && e.agent===agent);
  if (!entry || !(entry.cpdDetails||[])[cpdIdx]) return;
  Object.assign(entry.cpdDetails[cpdIdx], fields);
  localUpsert(entry);
  try { await fbUpsertEntry(entry); } catch(e) { alert('❌ Erro ao salvar CQ. Verifique sua conexão.'); }
}

async function updateVideoValidated(date, agent, count) {
  const entries = getEntries();
  const entry = entries.find(e => e.date===date && e.agent===agent);
  if (!entry) return;
  entry.videoValidated = count;
  localUpsert(entry);
  try { await fbUpsertEntry(entry); } catch(e) { alert('❌ Erro ao salvar vídeo. Verifique sua conexão.'); }
}

async function updateVaRealized(date, agent, vaIdx, dataRealizacao, horarioRealizacao='') {
  const entries = getEntries();
  const entry = entries.find(e => e.date === date && e.agent === agent);
  if (!entry || !entry.vaDetails?.[vaIdx]) return;
  entry.vaDetails[vaIdx].realizada = dataRealizacao === 'nao' ? false : true;
  entry.vaDetails[vaIdx].dataRealizacao = dataRealizacao;
  entry.vaDetails[vaIdx].horarioRealizacao = horarioRealizacao;
  localUpsert(entry);
  try {
    await fbUpsertEntry(entry);
  } catch(err) {
    alert('❌ Erro ao salvar visita. Verifique sua conexão e tente novamente.');
    // reverte estado local
    entry.vaDetails[vaIdx].realizada = undefined;
    entry.vaDetails[vaIdx].dataRealizacao = '';
    entry.vaDetails[vaIdx].horarioRealizacao = '';
    localUpsert(entry);
    throw err;
  }
}

async function updateVaDetail(date, agent, vaIdx, fields) {
  const entries = getEntries();
  const entry = entries.find(e => e.date === date && e.agent === agent);
  if (!entry || !entry.vaDetails?.[vaIdx]) return;
  Object.assign(entry.vaDetails[vaIdx], fields);
  localUpsert(entry);
  try { await fbUpsertEntry(entry); } catch(e) { alert('❌ Erro ao salvar visita. Verifique sua conexão.'); }
}

async function convertCpdToDoc(date, agent, cpdIdx, docDetail) {
  const entries = getEntries();
  const entry = entries.find(e => e.date === date && e.agent === agent);
  if (!entry) return;
  // Salva estado anterior para reverter se falhar
  const prevStatus = entry.cpdDetails?.[cpdIdx]?.status;
  const prevDocDetails = [...(entry.docDetails||[])];
  const prevDoc = entry.doc;
  if (entry.cpdDetails?.[cpdIdx]) entry.cpdDetails[cpdIdx].status = 'doc';
  if (!entry.docDetails) entry.docDetails = [];
  entry.docDetails.push(docDetail);
  entry.doc = entry.docDetails.length;
  localUpsert(entry);
  try {
    await fbUpsertEntry(entry);
  } catch(e) {
    // Reverte para não ficar inconsistente
    if (entry.cpdDetails?.[cpdIdx]) entry.cpdDetails[cpdIdx].status = prevStatus;
    entry.docDetails = prevDocDetails;
    entry.doc = prevDoc;
    localUpsert(entry);
    alert('❌ Erro ao converter CQ em DOC. Verifique sua conexão e tente novamente.');
    throw e;
  }
}

function showDescarteModal(nomeLead, onConfirm, onCancel) {
  document.getElementById('descarte-modal-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'descarte-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = `
    <div style="background:var(--bg2);border-radius:14px;padding:24px;width:100%;max-width:420px;border:1px solid var(--border)">
      <div style="font-size:15px;font-weight:700;margin-bottom:4px;color:#ef4444">🗑 Descartar CQ</div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:18px">${nomeLead ? `<strong style="color:var(--text)">${nomeLead}</strong> será movido para a base de descartados.` : 'O lead será movido para a base de descartados.'}</div>
      <div class="form-group" style="margin-bottom:18px">
        <label style="font-size:12px">Motivo do descarte</label>
        <input id="descarte-motivo-inp" type="text" placeholder="Ex: Não tem interesse, Não atende..." style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;padding:10px 12px;width:100%;outline:none;box-sizing:border-box">
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button id="descarte-cancel" style="background:none;border:1px solid var(--border);color:var(--text-muted);border-radius:8px;padding:9px 18px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px">Cancelar</button>
        <button id="descarte-confirm" style="background:#ef4444;color:#fff;border:none;border-radius:8px;padding:9px 18px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600">Descartar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const inp = overlay.querySelector('#descarte-motivo-inp');
  inp.focus();
  overlay.querySelector('#descarte-cancel').addEventListener('click', () => { overlay.remove(); onCancel(); });
  overlay.querySelector('#descarte-confirm').addEventListener('click', () => { overlay.remove(); onConfirm(inp.value.trim()); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { overlay.remove(); onConfirm(inp.value.trim()); } });
}

function showDocFromCpdModal(cpd, onConfirm, onCancel) {
  document.getElementById('doc-modal-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'doc-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
  const bairrosOpts = BAIRROS.map(b=>`<option value="${b}">${b}</option>`).join('');
  const tiposOpts   = TIPOS.map(t=>`<option value="${t}">${t}</option>`).join('');
  overlay.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto">
      <div style="font-size:14px;font-weight:700;color:#f0f0f0;margin-bottom:6px">📋 Preencher dados do DOC</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px"><strong>${cpd.nome||''}</strong> está virando DOC — preencha as informações:</div>
      <div class="form-group"><label>Nome do proprietário</label><input type="text" id="md-nome" value="${(cpd.nome||'').replace(/"/g,'&quot;')}" required></div>
      <div class="form-group"><label>Tipo</label><select id="md-tipo"><option value="">Selecione</option>${tiposOpts}</select></div>
      <div class="form-group"><label>Bairro</label>
        <select id="md-bairro"><option value="">Selecione</option>${bairrosOpts}<option value="__outro__">Outro...</option></select>
        <input type="text" id="md-bairro-outro" placeholder="Digite o bairro" style="margin-top:6px;display:none">
      </div>
      <div class="form-group"><label>Valor (ex: 450000)</label><input type="number" id="md-valor" min="0" placeholder="0"></div>
      <div class="form-group"><label>É indicação?</label><select id="md-indicacao"><option value="nao">Não</option><option value="sim">Sim</option></select></div>
      <div class="form-group" id="md-indicador-wrap" style="display:none"><label>Nome do indicador</label><input type="text" id="md-indicador" placeholder="Ex: Maria Souza"></div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button type="button" class="btn" id="md-confirm" style="flex:1">Confirmar DOC</button>
        <button type="button" class="btn btn-outline" id="md-cancel" style="flex:1">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('md-bairro').addEventListener('change', function() {
    document.getElementById('md-bairro-outro').style.display = this.value==='__outro__' ? 'block' : 'none';
  });
  document.getElementById('md-indicacao').addEventListener('change', function() {
    document.getElementById('md-indicador-wrap').style.display = this.value==='sim' ? 'block' : 'none';
  });
  document.getElementById('md-cancel').addEventListener('click', () => { overlay.remove(); onCancel(); });
  document.getElementById('md-confirm').addEventListener('click', () => {
    const nome      = document.getElementById('md-nome').value.trim();
    const tipo      = document.getElementById('md-tipo').value;
    const bairroSel = document.getElementById('md-bairro').value;
    const bairro    = bairroSel==='__outro__' ? document.getElementById('md-bairro-outro').value.trim() : bairroSel;
    const valor     = parseFloat(document.getElementById('md-valor').value) || 0;
    const indicacao = document.getElementById('md-indicacao').value;
    const indicador = document.getElementById('md-indicador').value.trim();
    if (!nome || !tipo || !bairro) { alert('Preencha nome, tipo e bairro.'); return; }
    overlay.remove();
    onConfirm({ nome, tipo, bairro, valor, indicacao, indicador, nota:'', lastContact:'', contactDates:[] });
  });
}

async function deleteDocDetail(date, agent, docIdx) {
  const entries = getEntries();
  const entry = entries.find(e => e.date === date && e.agent === agent);
  if (!entry || !entry.docDetails[docIdx]) return;
  const removed = entry.docDetails.splice(docIdx, 1);
  entry.doc = entry.docDetails.length;
  localUpsert(entry);
  try {
    await fbUpsertEntry(entry);
  } catch(e) {
    // Reverte deleção local
    entry.docDetails.splice(docIdx, 0, removed[0]);
    entry.doc = entry.docDetails.length;
    localUpsert(entry);
    alert('❌ Erro ao excluir DOC. Verifique sua conexão.');
    throw e;
  }
}

async function updateDocDetail(date, agent, docIdx, fields) {
  const entries = getEntries();
  const entry = entries.find(e => e.date===date && e.agent===agent);
  if (!entry || !entry.docDetails[docIdx]) return;
  Object.assign(entry.docDetails[docIdx], fields);
  localUpsert(entry);
  try { await fbUpsertEntry(entry); } catch(e) { alert('❌ Erro ao salvar DOC. Verifique sua conexão.'); }
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
function formatPhone(v) {
  const d = v.replace(/\D/g,'');
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3').replace(/-$/,'');
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3').replace(/-$/,'');
}
function applyPhoneMask(el) {
  el.addEventListener('input', () => {
    const pos = el.selectionStart;
    const prev = el.value;
    el.value = formatPhone(prev);
    const diff = el.value.length - prev.length;
    el.setSelectionRange(pos+diff, pos+diff);
  });
}
function formatCurrency(v){ return (v&&v>0)?'R$ '+Number(v).toLocaleString('pt-BR'):'—'; }
function getSalesMonth(monthRef) {
  const ym = (monthRef || today()).slice(0, 7);
  return SALES.filter(s => s.date && s.date.slice(0, 7) === ym);
}
function getSalesPeriod(period) {
  const t = today();
  const [y, m] = t.split('-').map(Number);
  return SALES.filter(s => {
    if (!s.date) return false;
    const [sy, sm] = s.date.split('-').map(Number);
    if (period === 'month')    return s.date.slice(0,7) === vgvMonth;
    if (period === 'quarter')  return (y-sy)*12+(m-sm) < 3  && sy*12+sm <= y*12+m;
    if (period === 'semester') return (y-sy)*12+(m-sm) < 6  && sy*12+sm <= y*12+m;
    if (period === 'year')     return sy === y;
    return false;
  });
}
function getPeriodLabel(period, ref) {
  const t = ref||today();
  if (period==='today') return `Hoje (${formatDate(t)})`;
  if (period==='week')  { const r=weekRange(t); return `Semana (${formatDate(r.start)} – ${formatDate(r.end)})`; }
  return `Mês (${new Date(t+'T12:00:00').toLocaleString('pt-BR',{month:'long',year:'numeric'})})`;
}

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

// ── RATIOS DO TIME (mês anterior) ────────────────────────
// Fonte única de verdade para META_CQ e META_PROSP usados em AMBOS os painéis.
function getTeamRatios(refDate) {
  const t = refDate || today();
  const prevMonthD = new Date(t + 'T12:00:00');
  prevMonthD.setDate(1);
  prevMonthD.setMonth(prevMonthD.getMonth() - 1);
  const prevRef = toDateStr(prevMonthD);
  const { start: pStart, end: pEnd } = monthRange(prevRef);
  const teamSet = new Set(getAgentNames());
  const prevE = getEntries().filter(e => inRange(e.date, pStart, pEnd) && teamSet.has(normalizeAgentName(e.agent)));
  const prevDoc   = prevE.reduce((s, e) => s + (e.doc  || 0), 0);
  const prevCpd   = prevE.reduce((s, e) => s + (e.cpd  || 0), 0);
  const prevProsp = prevE.reduce((s, e) => s + (e.prosp || 0), 0);
  // Fallback: ratios aproximados caso não haja dados do mês anterior
  const ratioCpd   = prevDoc > 0 ? prevCpd   / prevDoc : 3.5;
  const ratioProsp = prevDoc > 0 ? prevProsp / prevDoc : 32;
  // Metas do time para META_DOC_GESTOR DOCs
  const metaCqGestor    = Math.round(ratioCpd   * META_DOC_GESTOR);
  const metaProspGestor = Math.round(ratioProsp * META_DOC_GESTOR);
  // Metas individuais escalonadas para META_DOC_MONTH DOCs (mesma proporção, mesmo arredondamento)
  const metaCqMonth    = Math.round(metaCqGestor    / META_DOC_GESTOR * META_DOC_MONTH);
  const metaProspMonth = Math.round(metaProspGestor / META_DOC_GESTOR * META_DOC_MONTH);
  return { metaCqGestor, metaProspGestor, metaCqMonth, metaProspMonth };
}

// ── FILTER / AGGREGATE ───────────────────────────────────
function filterEntries(period, ref) {
  const entries=getEntries(), t=ref||today();
  if (period==='today')   return entries.filter(e=>e.date===t);
  if (period==='week')    { const r=weekRange(t);  return entries.filter(e=>inRange(e.date,r.start,r.end)); }
  if (period==='month')   { const r=monthRange(t); return entries.filter(e=>inRange(e.date,r.start,r.end)); }
  if (period==='quarter') {
    const d=new Date(t+'T12:00:00');
    const qStart=new Date(d.getFullYear(), Math.floor(d.getMonth()/3)*3, 1);
    const qEnd=new Date(qStart.getFullYear(), qStart.getMonth()+3, 0);
    return entries.filter(e=>inRange(e.date, toDateStr(qStart), toDateStr(qEnd)));
  }
  if (period==='year') {
    const y=t.slice(0,4);
    return entries.filter(e=>e.date.slice(0,4)===y);
  }
  return entries;
}
function sumByAgent(entries, period) {
  const map={};
  const team = new Set(getAgentNames());
  entries.forEach(e=>{
    const name = normalizeAgentName(e.agent);
    if (!team.has(name)) return;
    if(!map[name]) map[name]={agent:name,prosp:0,cpd:0,doc:0,va:0,vr:0,vidSubmitted:0};
    map[name].prosp+=e.prosp; map[name].cpd+=e.cpd; map[name].doc+=e.doc;
    map[name].va += (e.va||0);
    map[name].vr += (e.vaDetails||[]).filter(d=>d.realizada).length;
    map[name].vidSubmitted += (e.video||0);
  });
  // Apply video authorizations: if any auth exists for the period, use authorized total; else submitted
  if (period) {
    Object.values(map).forEach(a => {
      a.vid = hasAnyAuth(a.agent, period) ? getAuthorizedTotal(a.agent, period) : a.vidSubmitted;
    });
  } else {
    Object.values(map).forEach(a => { a.vid = a.vidSubmitted; });
  }
  return Object.values(map);
}
// Um lançamento só conta para a sequência se foi enviado no próprio dia
// (submittedDate === date). Lançamentos retroativos (enviados depois) não
// contam — o dia perdido não volta, mas não trava o envio dos dias seguintes.
function isOnTime(e) {
  return true; // sequência conta qualquer dia com lançamento, independente do horário de envio
}
function getOnTimeDates(agentName, uid) {
  return [...new Set(getEntries().filter(e => {
    const match = uid ? (e.uid===uid || normalizeAgentName(e.agent)===agentName)
                      : (normalizeAgentName(e.agent)===agentName || e.agent===agentName);
    return match && isOnTime(e);
  }).map(e=>e.date))];
}
function calcStreak(agentName, uid) {
  const days=getOnTimeDates(agentName, uid).sort().reverse();
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

// ── SISTEMA DE PONTUAÇÃO ─────────────────────────────────
// DOC é o resultado principal. CPD e PROSP são pipeline — ajudam, mas têm teto.
// Taxas reais (jun+jul/2026): 1 DOC = 4.5 CPD = 37 PROSP
//
// Fórmula: (doc + min(pipeline, teto)) / meta × 10
//   pipeline = cpd/4.5 + prosp/37  (DOC-equivalentes de pipeline)
//   teto: máx de pipeline que pode contribuir (não substitui DOC)
//
// Metas: 12 DOC/mês · 3 DOC/semana · 1 DOC/dia

function calcDailyScore(entry) {
  if (!entry) return 0;
  // Faixas: vermelho 0–2.9 · amarelo 3–5.9 · verde 6–7.9 · azul 8–10
  //
  // VERMELHO: sem CP, sem DOC, sem vídeo E prosp ≤ 30
  // AMARELO mínimo (3.0) quando:
  //   - pelo menos 1 CP, ou
  //   - pelo menos 1 vídeo, ou
  //   - prosp > 30 (esforço alto de prospecção)
  // A partir do mínimo 3.0, cada atividade extra sobe a nota
  // Sem DOC: teto 7.9 (azul é exclusivo de quem captou DOC)
  // Com DOC: base 8.0 + bônus de esforço até 10.0
  const vid = effectiveVideo(entry);
  const effort = entry.cpd * 1.0 + vid * 1.0 + entry.prosp * 0.025;

  if (entry.doc > 0) {
    const base  = Math.min(entry.doc * 8.0, 10);
    const bonus = Math.min(effort * 0.15, 2.0);
    return parseFloat(Math.min(base + bonus, 10).toFixed(1));
  }

  // Sem DOC: verifica se atinge o piso amarelo
  const meetsFloor = entry.cpd > 0 || vid > 0 || entry.prosp > 30; // vid já usa effectiveVideo
  if (!meetsFloor) {
    // Vermelho: só prosp baixo ou nada — mostra valor pequeno mas fica vermelho
    return parseFloat(Math.min(entry.prosp * 0.025, 2.9).toFixed(1));
  }
  return parseFloat(Math.min(3.0 + effort, 7.9).toFixed(1));
}


function calcMonthlyScore(agentName, monthEntries) {
  const mine  = monthEntries.filter(e => normalizeAgentName(e.agent) === agentName || e.agent === agentName);
  const doc   = mine.reduce((s, e) => s + e.doc,   0);
  const cpd   = mine.reduce((s, e) => s + e.cpd,   0);
  const prosp = mine.reduce((s, e) => s + e.prosp, 0);
  // Meta: 12 DOC = 10.0 — nota é quase 100% proporcional ao DOC.
  // CP e PROSP são desempate mínimo apenas.
  const base    = (doc / 12) * 10;
  const bonusCp = Math.min(cpd * 0.004, 0.2);
  const bonusPr = Math.min(prosp * 0.0001, 0.05);
  return parseFloat(Math.min(base + bonusCp + bonusPr, 10).toFixed(1));
}

function scoreColor(score) {
  if (score >= 8)  return '#6495ed'; // azul   — DOC garantido
  if (score >= 6)  return '#a8e63d'; // verde  — esforço forte (3+ CP/VID)
  if (score >= 3)  return '#f0c040'; // amarelo — esforço moderado
  return '#e74c3c';                  // vermelho — pouco ou nada feito
}

function scoreLabel(score) {
  if (score >= 8)  return 'Excelente';
  if (score >= 6)  return 'Bom';
  if (score >= 3)  return 'Regular';
  return 'Fraco';
}

// ── NOTAS RANKING ─────────────────────────────────────────
let activeNotaTab = 'dia';

function renderNotasRanking() {
  const wrap = document.getElementById('notas-ranking-wrap');
  if (!wrap) return;

  const t = today();
  const weekRef   = activeWeekRef  || t;
  const monthRef  = activeMonthRef || t;

  const weekE  = filterEntries('week',  weekRef);
  const monthE = filterEntries('month', monthRef);
  const dayE   = filterEntries('today', t);

  const names = getAgentNames();

  let rows;
  if (activeNotaTab === 'dia') {
    rows = names.map(name => {
      const uid = TEAM.find(a=>a.name===name)?.username;
      const e = dayE.find(x => uid ? (x.uid===uid || normalizeAgentName(x.agent)===name) : normalizeAgentName(x.agent)===name || x.agent===name);
      return { name, score: calcDailyScore(e || null), doc: e?.doc || 0, sent: !!e };
    });
  } else {
    rows = names.map(name => {
      const uid = TEAM.find(a=>a.name===name)?.username;
      const doc = monthE.filter(x => uid ? (x.uid===uid || normalizeAgentName(x.agent)===name) : normalizeAgentName(x.agent)===name || x.agent===name).reduce((s, e) => s + e.doc, 0);
      return { name, score: calcMonthlyScore(name, monthE), doc, sent: true };
    });
  }

  if (activeNotaTab === 'dia') {
    rows.sort((a, b) => {
      if (a.sent !== b.sent) return a.sent ? -1 : 1;
      return b.score - a.score;
    });
  } else {
    rows.sort((a, b) => b.score - a.score);
  }

  const medals = ['🥇', '🥈', '🥉'];

  const rowsHTML = rows.map((r, i) => {
    const col = scoreColor(r.score);
    const notShown = activeNotaTab === 'dia' && !r.sent;
    const medal = (!notShown && i < 3) ? medals[i] : (notShown ? '—' : `${i + 1}`);
    const scoreStr = notShown ? '—' : r.score.toFixed(1);
    const colorStyle = notShown ? 'color:var(--text-muted)' : `color:${col};font-weight:700`;
    return `<tr>
      <td style="font-size:16px;text-align:center;width:36px">${medal}</td>
      <td>${r.name}</td>
      <td class="num-cell nota-score" style="${colorStyle}">${scoreStr}</td>
      <td class="num-cell" style="color:var(--text-muted);font-size:12px">${notShown ? '—' : scoreLabel(r.score)}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="nota-tabs">
      <button class="nota-tab-btn${activeNotaTab==='dia'?' active':''}" data-tab="dia">Dia</button>
      <button class="nota-tab-btn${activeNotaTab==='mes'?' active':''}" data-tab="mes">Mês</button>
    </div>
    <table class="data-table rank-table" style="margin-top:10px">
      <thead><tr><th style="width:36px">#</th><th>Angariador</th><th class="num-cell">Nota</th><th class="num-cell">Nível</th></tr></thead>
      <tbody>${rowsHTML}</tbody>
    </table>
    ${activeNotaTab==='dia'?'<div style="font-size:11px;color:var(--text-muted);margin-top:8px;text-align:center">Apenas quem enviou hoje aparece com nota</div>':''}`;

  wrap.querySelectorAll('.nota-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeNotaTab = btn.dataset.tab;
      renderNotasRanking();
    });
  });
}

// ── AGENT CONTACTS (CPDs & DOCs) ─────────────────────────
let agentContactTab = '';

function renderAgentContacts(agentName) {
  const wrap = document.getElementById('agent-contacts-wrap');
  if (!wrap) return;
  const t = today();
  const agentUid = TEAM.find(a=>a.name===agentName)?.username;
  const entries = getEntries().filter(e => agentUid ? (e.uid===agentUid || normalizeAgentName(e.agent)===agentName) : normalizeAgentName(e.agent)===agentName || e.agent===agentName);

  // CPDs ativos (exclui os que viraram DOC ou descarte)
  const cpds = [];
  const descartados = [];
  entries.forEach(e => (e.cpdDetails||[]).forEach((d, i) => {
    if (!d.nome) return;
    if (d.status === 'descarte') descartados.push({ ...d, entryDate: e.date, idx: i });
    else if (d.status !== 'doc') cpds.push({ ...d, entryDate: e.date, idx: i, _type: 'cpd' });
  }));
  cpds.sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  descartados.sort((a, b) => b.entryDate.localeCompare(a.entryDate));

  // DOCs: apenas lançamentos reais do docDetails
  const docs = [];
  entries.forEach(e => (e.docDetails||[]).forEach((d, i) => {
    if (d.nome) docs.push({ ...d, entryDate: e.date, idx: i, _type: 'doc' });
  }));
  docs.sort((a, b) => b.entryDate.localeCompare(a.entryDate));

  // Visitas por status
  const allVisits = [];
  entries.forEach(e => (e.vaDetails||[]).forEach((d, i) => {
    if (d.nome || d.imovel) allVisits.push({ ...d, entryDate: e.date, idx: i });
  }));
  allVisits.sort((a,b) => b.entryDate.localeCompare(a.entryDate));
  const visAgendadas  = allVisits.filter(v => v.realizada !== true && !(v.realizada === false && v.dataRealizacao === 'nao'));
  const visRealizadas = allVisits.filter(v => v.realizada === true);
  const visNao        = allVisits.filter(v => v.realizada === false && v.dataRealizacao === 'nao');

  const makeRow = (d) => {
    const dates = d.contactDates || (d.lastContact ? [d.lastContact] : []);
    const histLabel = dates.length === 0 ? '—'
      : `${formatDate(dates[dates.length-1])}${dates.length > 1 ? ` <span style="color:var(--text-muted);font-size:10px">(${dates.length}x)</span>` : ''}`;

    const inpStyle = 'background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:\'DM Sans\',sans-serif;font-size:13px;padding:7px 10px;width:100%;outline:none';
    const cancelBtnStyle = 'background:none;border:1px solid var(--border);color:var(--text-muted);border-radius:8px;padding:7px 12px;cursor:pointer;font-family:\'DM Sans\',sans-serif;font-size:13px;white-space:nowrap';

    if (d._type === 'cpd') {
      const statusSelOpts = CPD_STATUS_OPTIONS.map(o =>
        `<option value="${o.value}" ${d.status===o.value?'selected':''}>${o.label}</option>`).join('');
      return `<tr data-entry-date="${d.entryDate}" data-idx="${d.idx}">
        <td style="font-weight:500">${d.nome}</td>
        <td style="color:var(--text-muted);font-size:12px">${d.telefone ? formatPhone(d.telefone) : '—'}</td>
        <td><select class="cpd-tracker-status nota-select" data-entry-date="${d.entryDate}" data-idx="${d.idx}" style="font-size:11px;padding:3px 6px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)">${statusSelOpts}</select></td>
        <td style="font-size:11px;white-space:nowrap">${histLabel}</td>
        <td style="white-space:nowrap">
          <button class="ac-edit-btn" data-type="cpd" data-entry-date="${d.entryDate}" data-idx="${d.idx}" style="background:none;border:none;cursor:pointer;font-size:13px;padding:2px 4px">✏️</button>
        </td>
      </tr>
      <tr class="ac-edit-row" data-edit-type="cpd" data-edit-date="${d.entryDate}" data-edit-idx="${d.idx}" style="display:none">
        <td colspan="5" style="padding:8px 0">
          <div style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:8px;align-items:end">
            <div class="form-group" style="margin:0"><label style="font-size:11px">Nome</label><input class="ac-ef-nome" type="text" value="${(d.nome||'').replace(/"/g,'&quot;')}" style="${inpStyle}"></div>
            <div class="form-group" style="margin:0"><label style="font-size:11px">Telefone</label><input class="ac-ef-tel" type="text" value="${(d.telefone ? formatPhone(d.telefone) : '').replace(/"/g,'&quot;')}" style="${inpStyle}"></div>
            <button class="ac-ef-save btn" data-type="cpd" data-entry-date="${d.entryDate}" data-idx="${d.idx}" style="padding:8px 14px;font-size:13px;white-space:nowrap">Salvar</button>
            <button class="ac-ef-cancel" data-edit-type="cpd" data-edit-date="${d.entryDate}" data-edit-idx="${d.idx}" style="${cancelBtnStyle}">Cancelar</button>
          </div>
        </td>
      </tr>`;
    } else {
      const bairrosOpts = BAIRROS.map(b=>`<option value="${b}" ${d.bairro===b?'selected':''}>${b}</option>`).join('');
      const tiposOpts   = TIPOS.map(tp=>`<option value="${tp}" ${d.tipo===tp?'selected':''}>${tp}</option>`).join('');
      const statusCell = `<select class="doc-tracker-status nota-select" data-entry-date="${d.entryDate}" data-idx="${d.idx}" style="font-size:11px;padding:3px 6px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)">
          ${STATUS_OPTIONS.map(o=>`<option value="${o.value}" ${d.nota===o.value?'selected':''}>${o.label}</option>`).join('')}
         </select>`;
      return `<tr data-entry-date="${d.entryDate}" data-idx="${d.idx}">
        <td style="font-weight:500">${d.nome}</td>
        <td style="color:var(--text-muted);font-size:12px">${d.tipo||'—'} · ${d.bairro||'—'}</td>
        <td>${statusCell}</td>
        <td style="white-space:nowrap">
          <button class="ac-edit-btn" data-type="doc" data-entry-date="${d.entryDate}" data-idx="${d.idx}" style="background:none;border:none;cursor:pointer;font-size:13px;padding:2px 4px">✏️</button>
          <button class="del-doc-detail-btn" data-entry-date="${d.entryDate}" data-idx="${d.idx}" title="Excluir DOC" style="background:none;border:1px solid rgba(231,76,60,.4);color:#e74c3c;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:13px">🗑</button>
        </td>
      </tr>
      <tr class="ac-edit-row" data-edit-type="doc" data-edit-date="${d.entryDate}" data-edit-idx="${d.idx}" style="display:none">
        <td colspan="4" style="padding:8px 0">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto auto;gap:8px;align-items:end">
            <div class="form-group" style="margin:0"><label style="font-size:11px">Nome</label><input class="ac-ef-nome" type="text" value="${(d.nome||'').replace(/"/g,'&quot;')}" style="${inpStyle}"></div>
            <div class="form-group" style="margin:0"><label style="font-size:11px">Tipo</label><select class="ac-ef-tipo" style="${inpStyle}"><option value="">Selecione</option>${tiposOpts}</select></div>
            <div class="form-group" style="margin:0"><label style="font-size:11px">Bairro</label><select class="ac-ef-bairro" style="${inpStyle}"><option value="">Selecione</option>${bairrosOpts}${d.bairro&&!BAIRROS.includes(d.bairro)?`<option value="${d.bairro}" selected>${d.bairro}</option>`:''}</select></div>
            <div class="form-group" style="margin:0"><label style="font-size:11px">Valor</label><input class="ac-ef-valor" type="number" min="0" value="${d.valor||0}" style="${inpStyle}"></div>
            <button class="ac-ef-save btn" data-type="doc" data-entry-date="${d.entryDate}" data-idx="${d.idx}" style="padding:8px 14px;font-size:13px;white-space:nowrap">Salvar</button>
            <button class="ac-ef-cancel" data-edit-type="doc" data-edit-date="${d.entryDate}" data-edit-idx="${d.idx}" style="${cancelBtnStyle}">Cancelar</button>
          </div>
        </td>
      </tr>`;
    }
  };

  const tab = agentContactTab;
  const isDesc = tab === 'descartados';
  const isCpd  = tab === 'cpd';
  const isNone = tab === '';

  const makeDescRow = (d) => `<tr>
    <td style="font-weight:500">${d.nome}</td>
    <td style="color:var(--text-muted);font-size:12px">${d.telefone ? formatPhone(d.telefone) : '—'}</td>
    <td style="color:var(--text-muted);font-size:12px">${formatDate(d.entryDate)}</td>
    <td style="color:#ef4444;font-size:12px">${d.motivo||'—'}</td>
    <td><button class="cq-restore-btn btn" data-entry-date="${d.entryDate}" data-idx="${d.idx}"
      style="font-size:11px;padding:4px 10px;background:none;border:1px solid var(--border);color:var(--text-muted)">Restaurar</button></td>
  </tr>`;

  const isVisit = ['agendadas','realizadas','nao'].includes(tab);
  const list = isCpd ? cpds : isDesc ? descartados : isVisit ? [] : docs;

  const makeVisitRow = (v) => {
    const isAgendada = v.realizada !== true && !(v.realizada === false && v.dataRealizacao === 'nao');
    const statusTxt = v.realizada === true
      ? `<span style="color:#a8e63d;font-size:11px">✅ ${v.dataRealizacao && v.dataRealizacao!=='nao' ? formatDate(v.dataRealizacao) : ''}${v.horarioRealizacao ? ' às '+v.horarioRealizacao : ''}</span>`
      : v.realizada === false && v.dataRealizacao === 'nao'
        ? `<span style="color:#888;font-size:11px">❌ Não realizada</span>`
        : `<span style="color:#ef4444;font-size:11px">⏳ Agendada</span>`;
    const actionBtns = isAgendada
      ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
           <button class="va-confirm-btn" data-entry="${v.entryDate}" data-idx="${v.idx}"
             style="flex:1;padding:8px 4px;background:#a8e63d22;border:1px solid #a8e63d66;color:#a8e63d;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">✅ Confirmar</button>
           <button class="va-cancel-btn" data-entry="${v.entryDate}" data-idx="${v.idx}"
             style="flex:1;padding:8px 4px;background:#ef444422;border:1px solid #ef444466;color:#ef4444;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">❌ Desmarcar</button>
         </div>`
      : '';
    return `<tr>
      <td colspan="4" style="padding:10px 6px">
        <div style="font-weight:600;font-size:13px">${v.nome||'—'}</div>
        <div style="color:var(--text-muted);font-size:12px;margin-top:2px">${v.imovel||'—'} · ${v.dataAgend ? formatDate(v.dataAgend) : '—'}${v.horario ? ' às '+v.horario : ''}</div>
        <div style="margin-top:4px">${statusTxt}</div>
        ${actionBtns}
      </td>
    </tr>`;
  };

  const visitList = tab==='agendadas' ? visAgendadas : tab==='realizadas' ? visRealizadas : tab==='nao' ? visNao : [];

  wrap.innerHTML = `
    <div class="nota-tabs" style="position:relative;flex-wrap:wrap;gap:4px">
      <button class="nota-tab-btn${isCpd?' active':''}" data-ctab="cpd">CQs (${cpds.length})</button>
      <button class="nota-tab-btn${tab==='doc'?' active':''}" data-ctab="doc">DOCs (${docs.length})</button>
      <button class="nota-tab-btn${isDesc?' active':''}" data-ctab="descartados" style="color:${isDesc?'inherit':'#ef4444aa'}">🗑 Desc. (${descartados.length})</button>
      <button class="nota-tab-btn${tab==='agendadas'?' active':''}" data-ctab="agendadas" style="color:${tab==='agendadas'?'inherit':'#ef4444aa'}">⏳ Agendadas (${visAgendadas.length})</button>
      <button class="nota-tab-btn${tab==='realizadas'?' active':''}" data-ctab="realizadas" style="color:${tab==='realizadas'?'inherit':'#a8e63daa'}">✅ Realizadas (${visRealizadas.length})</button>
      <button class="nota-tab-btn${tab==='nao'?' active':''}" data-ctab="nao" style="color:${tab==='nao'?'inherit':'#888'}">❌ Não realizadas (${visNao.length})</button>
    </div>
    ${isNone
      ? `<div class="empty-state" style="margin-top:14px;color:var(--text-muted);font-size:13px">Selecione uma aba para visualizar</div>`
      : isVisit
        ? visitList.length === 0
          ? `<div class="empty-state" style="margin-top:12px">Nenhuma visita neste filtro</div>`
          : `<div style="margin-top:10px"><table class="data-table" style="table-layout:fixed;width:100%"><tbody>${visitList.map(makeVisitRow).join('')}</tbody></table></div>`
        : list.length === 0
          ? `<div class="empty-state" style="margin-top:12px">Nenhum ${isCpd?'CQ ativo':isDesc?'CQ descartado':'DOC'} registrado</div>`
          : `<div style="overflow-x:auto;margin-top:10px">
              <table class="data-table">
                <thead><tr>${isDesc
                  ? '<th>Nome</th><th>Telefone</th><th>Data</th><th>Motivo do Descarte</th><th></th>'
                  : `<th>Nome</th><th>${isCpd?'Telefone':'Imóvel'}</th><th>Status</th>${isCpd?'<th>Histórico</th>':''}<th></th>`
                }</tr></thead>
                <tbody>${isDesc ? list.map(makeDescRow).join('') : list.map(makeRow).join('')}</tbody>
              </table>
            </div>`}`;

  wrap.querySelectorAll('[data-ctab]').forEach(btn =>
    btn.addEventListener('click', () => { agentContactTab = btn.dataset.ctab; renderAgentContacts(agentName); })
  );

  // Confirmar visita realizada (abre modal com data + hora)
  wrap.querySelectorAll('.va-confirm-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const entryDate = btn.dataset.entry;
      const idx = parseInt(btn.dataset.idx);
      showVaRealizedModal(async (date, time) => {
        await updateVaRealized(entryDate, agentName, idx, date || today(), time);
        agentContactTab = 'realizadas';
        renderAgentContacts(agentName);
      });
    });
  });

  // Marcar visita como não realizada / desmarcada
  wrap.querySelectorAll('.va-cancel-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const entryDate = btn.dataset.entry;
      const idx = parseInt(btn.dataset.idx);
      if (!confirm('Marcar esta visita como não realizada?')) return;
      await updateVaRealized(entryDate, agentName, idx, 'nao', '');
      agentContactTab = 'nao';
      renderAgentContacts(agentName);
    });
  });

  // Status change (CPD tracker)
  wrap.querySelectorAll('.cpd-tracker-status').forEach(sel => {
    sel.addEventListener('change', async () => {
      const entryDate = sel.dataset.entryDate;
      const idx = parseInt(sel.dataset.idx);
      const entries = getEntries();
      const entry = entries.find(e => e.date === entryDate && e.agent === agentName);
      const cpd = entry?.cpdDetails?.[idx] || {};

      if (sel.value === 'doc') {
        sel.value = cpd.status || '';
        showDocFromCpdModal(cpd, async (docDetail) => {
          await convertCpdToDoc(entryDate, agentName, idx, docDetail);
          agentContactTab = 'doc';
          renderAgentContacts(agentName);
        }, () => {});
      } else if (sel.value === 'descarte') {
        sel.value = cpd.status || '';
        showDescarteModal(cpd.nome || '', async (motivo) => {
          await updateCpdDetail(entryDate, agentName, idx, { status: 'descarte', motivo });
          agentContactTab = 'descartados';
          renderAgentContacts(agentName);
        }, () => {});
      } else {
        await updateCpdDetail(entryDate, agentName, idx, { status: sel.value });
        renderAgentContacts(agentName);
      }
    });
  });

  // Restaurar lead descartado
  wrap.querySelectorAll('.cq-restore-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '...';
      await updateCpdDetail(btn.dataset.entryDate, agentName, parseInt(btn.dataset.idx), { status: '', motivo: '' });
      agentContactTab = 'cpd';
      renderAgentContacts(agentName);
    });
  });

  // Status change + color (DOC tracker)
  wrap.querySelectorAll('.doc-tracker-status').forEach(sel => {
    const applyColor = () => {
      const opt = STATUS_OPTIONS.find(o => o.value === sel.value);
      sel.style.color = opt?.color || 'var(--text-muted)';
      sel.style.borderColor = opt?.value ? opt.color : 'var(--border)';
    };
    applyColor();
    sel.addEventListener('change', async () => {
      applyColor();
      await updateDocNota(sel.dataset.entryDate, agentName, parseInt(sel.dataset.idx), sel.value);
    });
  });

  // Delete DOC detail button
  wrap.querySelectorAll('.del-doc-detail-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este DOC?')) return;
      btn.disabled = true; btn.textContent = '...';
      await deleteDocDetail(btn.dataset.entryDate, agentName, parseInt(btn.dataset.idx));
      renderAgentContacts(agentName);
    });
  });

  // Edit button (toggle inline row)
  wrap.querySelectorAll('.ac-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const editRow = wrap.querySelector(`.ac-edit-row[data-edit-type="${btn.dataset.type}"][data-edit-date="${btn.dataset.entryDate}"][data-edit-idx="${btn.dataset.idx}"]`);
      const isOpen = editRow.style.display !== 'none';
      wrap.querySelectorAll('.ac-edit-row').forEach(r => r.style.display = 'none');
      if (!isOpen) { editRow.style.display = ''; const telEl = editRow.querySelector('.ac-ef-tel'); if (telEl) applyPhoneMask(telEl); }
    });
  });

  // Save edit
  wrap.querySelectorAll('.ac-ef-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const editRow = wrap.querySelector(`.ac-edit-row[data-edit-type="${btn.dataset.type}"][data-edit-date="${btn.dataset.entryDate}"][data-edit-idx="${btn.dataset.idx}"]`);
      btn.textContent = 'Salvando...'; btn.disabled = true;
      if (btn.dataset.type === 'cpd') {
        const nome = editRow.querySelector('.ac-ef-nome').value.trim();
        const telefone = editRow.querySelector('.ac-ef-tel').value.trim();
        await updateCpdDetail(btn.dataset.entryDate, agentName, parseInt(btn.dataset.idx), { nome, telefone });
      } else {
        const nome  = editRow.querySelector('.ac-ef-nome').value.trim();
        const tipo  = editRow.querySelector('.ac-ef-tipo').value;
        const bairro = editRow.querySelector('.ac-ef-bairro').value;
        const valor = parseFloat(editRow.querySelector('.ac-ef-valor').value) || 0;
        await updateDocDetail(btn.dataset.entryDate, agentName, parseInt(btn.dataset.idx), { nome, tipo, bairro, valor });
      }
      renderAgentContacts(agentName);
    });
  });

  // Cancel edit
  wrap.querySelectorAll('.ac-ef-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      wrap.querySelector(`.ac-edit-row[data-edit-type="${btn.dataset.editType}"][data-edit-date="${btn.dataset.editDate}"][data-edit-idx="${btn.dataset.editIdx}"]`).style.display = 'none';
    });
  });

}

function renderAgentVisits(agentName) {
  const wrap = document.getElementById('agent-visits-wrap');
  if (!wrap) return;
  const agentUidV = TEAM.find(a=>a.name===agentName)?.username;
  const entries = getEntries().filter(e => agentUidV ? (e.uid===agentUidV || normalizeAgentName(e.agent)===agentName) : normalizeAgentName(e.agent)===agentName || e.agent===agentName);

  const allVisits = [];
  entries.forEach(e => (e.vaDetails||[]).forEach((d,i) => {
    if (d.nome || d.imovel) allVisits.push({ ...d, entryDate: e.date, idx: i });
  }));
  allVisits.sort((a,b) => b.entryDate.localeCompare(a.entryDate));

  if (allVisits.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Nenhuma visita agendada registrada</div>';
    return;
  }

  const items = allVisits.map(v => {
    const isRealizada = v.realizada === true;
    const isNaoRealizada = v.realizada === false && v.dataRealizacao === 'nao';
    const statusColor = isRealizada ? '#a8e63d' : isNaoRealizada ? '#888' : '#ef4444';
    const realizadaLabel = isRealizada
      ? `✅ Realizada em ${formatDate(v.dataRealizacao||v.entryDate)}${v.horarioRealizacao ? ' às ' + v.horarioRealizacao : ''}`
      : '';
    const statusText = isRealizada ? realizadaLabel : isNaoRealizada ? '❌ Não realizada' : '⏳ Agendada';

    const btnBase = `border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;padding:10px 16px;font-weight:600;`;
    const actionBtns = isRealizada
      ? `<button class="va-unrealize-btn" data-entry-date="${v.entryDate}" data-idx="${v.idx}"
           style="${btnBase}background:none;border:1px solid var(--border);color:var(--text-muted)">↩ Desfazer</button>`
      : `<button class="va-realize-btn" data-entry-date="${v.entryDate}" data-idx="${v.idx}"
           style="${btnBase}background:#a8e63d;border:1px solid #a8e63d;color:#000">✅ Realizada</button>
         <button class="va-nao-realize-btn" data-entry-date="${v.entryDate}" data-idx="${v.idx}"
           style="${btnBase}background:none;border:1px solid var(--border);color:var(--text-muted)">❌ Não realizada</button>`;

    return `<div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:15px;margin-bottom:4px">${v.nome||'—'}</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <span style="font-size:12px;color:var(--text-muted)">🏠 ${v.imovel||'—'}</span>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:11px;color:var(--text-muted)">${v.dataAgend ? formatDate(v.dataAgend) : formatDate(v.entryDate)}${v.horario ? ' às ' + v.horario : ''}</div>
          <div style="font-size:12px;font-weight:700;color:${statusColor};margin-top:4px">${statusText}</div>
        </div>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:10px;display:flex;gap:8px;flex-wrap:wrap">${actionBtns}</div>
    </div>`;
  }).join('');

  wrap.innerHTML = items;

  wrap.querySelectorAll('.va-realize-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '...';
      const entries = getEntries();
      const entry = entries.find(e => e.date === btn.dataset.entryDate && e.agent === agentName);
      const v = entry?.vaDetails?.[parseInt(btn.dataset.idx)];
      const dataRealizacao = v?.dataAgend || today();
      const horarioRealizacao = v?.horario || '';
      await updateVaRealized(btn.dataset.entryDate, agentName, parseInt(btn.dataset.idx), dataRealizacao, horarioRealizacao);
      renderAgentVisits(agentName);
    });
  });
  wrap.querySelectorAll('.va-nao-realize-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '...';
      await updateVaRealized(btn.dataset.entryDate, agentName, parseInt(btn.dataset.idx), 'nao');
      renderAgentVisits(agentName);
    });
  });
  wrap.querySelectorAll('.va-unrealize-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '...';
      const entries = getEntries();
      const entry = entries.find(e => e.date===btn.dataset.entryDate && e.agent===agentName);
      if (entry?.vaDetails?.[parseInt(btn.dataset.idx)]) {
        const idx = parseInt(btn.dataset.idx);
        const prev = { ...entry.vaDetails[idx] };
        entry.vaDetails[idx].realizada = null;
        entry.vaDetails[idx].dataRealizacao = '';
        entry.vaDetails[idx].horarioRealizacao = '';
        localUpsert(entry);
        try {
          await fbUpsertEntry(entry);
        } catch(e) {
          entry.vaDetails[idx].realizada = prev.realizada;
          entry.vaDetails[idx].dataRealizacao = prev.dataRealizacao;
          entry.vaDetails[idx].horarioRealizacao = prev.horarioRealizacao;
          localUpsert(entry);
          alert('❌ Erro ao desfazer visita. Verifique sua conexão.');
          btn.disabled = false; btn.textContent = 'Desfazer';
          return;
        }
      }
      renderAgentVisits(agentName);
    });
  });
}

function showVaRealizedModal(onConfirm) {
  document.getElementById('va-realized-modal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'va-realized-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
  const inpStyle = 'background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:\'DM Sans\',sans-serif;font-size:13px;padding:10px 12px;width:100%;outline:none;box-sizing:border-box';
  overlay.innerHTML = `
    <div style="background:var(--bg2);border-radius:14px;padding:24px;width:100%;max-width:380px;border:1px solid var(--border)">
      <div style="font-size:15px;font-weight:700;margin-bottom:16px;color:#a8e63d">✅ Marcar visita como realizada</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px">
        <div class="form-group" style="margin:0">
          <label style="font-size:12px">Data da visita</label>
          <input id="va-realized-date" type="date" value="${today()}" style="${inpStyle}">
        </div>
        <div class="form-group" style="margin:0">
          <label style="font-size:12px">Horário</label>
          <div style="display:flex;gap:6px;margin-top:4px">
            <select id="va-realized-hour" style="${inpStyle};padding:8px 6px">
              <option value="">Hora</option>${Array.from({length:24},(_,h)=>`<option value="${String(h).padStart(2,'0')}">${String(h).padStart(2,'0')}h</option>`).join('')}
            </select>
            <select id="va-realized-min" style="${inpStyle};padding:8px 6px">
              <option value="">Min</option>${['00','05','10','15','20','25','30','35','40','45','50','55'].map(m=>`<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button id="va-realized-cancel" style="background:none;border:1px solid var(--border);color:var(--text-muted);border-radius:8px;padding:9px 18px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px">Cancelar</button>
        <button id="va-realized-confirm" style="background:#a8e63d;color:#000;border:none;border-radius:8px;padding:9px 18px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600">Confirmar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#va-realized-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#va-realized-confirm').addEventListener('click', () => {
    const date = overlay.querySelector('#va-realized-date').value;
    const h = overlay.querySelector('#va-realized-hour').value;
    const m = overlay.querySelector('#va-realized-min').value;
    const time = h && m ? `${h}:${m}` : '';
    overlay.remove();
    onConfirm(date, time);
  });
}

// ── AGENT RANKING (mesmo ranking do gestor: DOC·CQ·PROSP·VA·VR) ──
let activeAgentRankTab = 'mes';

function renderAgentDailyRanking(currentAgentName) {
  const wrap = document.getElementById('agent-daily-ranking');
  if (!wrap) return;
  const t = today();
  const names = getAgentNames();
  const PODIUM = { 1:'gold-badge', 2:'silver-badge', 3:'bronze-badge' };
  const PODIUM_LABEL = { 1:'🥇', 2:'🥈', 3:'🥉' };

  let periodEntries;
  if (activeAgentRankTab === 'dia') {
    periodEntries = filterEntries('today', t);
  } else if (activeAgentRankTab === 'semana') {
    periodEntries = filterEntries('week', t);
  } else {
    periodEntries = filterEntries('month', t);
  }

  const byAgent = names.map(name => {
    const memberUid = TEAM.find(a=>a.name===name)?.username;
    const agentE = periodEntries.filter(e => memberUid ? (e.uid===memberUid || normalizeAgentName(e.agent)===name) : e.agent===name);
    const streak = calcStreak(name, memberUid);
    return {
      agent: name,
      doc:   agentE.reduce((s,e)=>s+e.doc,0),
      cpd:   agentE.reduce((s,e)=>s+(e.cpd||0),0),
      prosp: agentE.reduce((s,e)=>s+(e.prosp||0),0),
      va:    agentE.reduce((s,e)=>s+(e.va||0),0),
      vr:    agentE.reduce((s,e)=>s+(e.vaDetails||[]).filter(d=>d.realizada).length,0),
      streak,
    };
  });

  byAgent.sort((a,b) => b.doc!==a.doc ? b.doc-a.doc : b.cpd!==a.cpd ? b.cpd-a.cpd : b.prosp-a.prosp);

  const rowsHTML = byAgent.map((a, i) => {
    const pos = i + 1;
    const isMe = a.agent === currentAgentName;
    const streakBadge = a.streak >= 3 ? ` <span style="font-size:10px;color:#f0c040">🔥${a.streak}d</span>` : '';
    const rowBg = isMe ? 'background:rgba(168,230,61,0.08);' : '';
    const nameTxt = `${a.agent}${isMe?' 👤':''}${streakBadge}`;
    const badge = pos <= 3
      ? `<span class="rank-badge ${PODIUM[pos]}">${PODIUM_LABEL[pos]}</span>`
      : pos;
    return `<tr class="${pos<=3?'podium-row podium-'+pos:''}" style="${rowBg}">
      <td><span>${badge}</span></td>
      <td style="${isMe?'font-weight:700;color:#f0f0f0':''}">${nameTxt}</td>
      <td class="num-cell doc-cell">${a.doc}</td>
      <td class="num-cell">${a.cpd}</td>
      <td class="num-cell dim-cell">${a.prosp}</td>
      <td class="num-cell dim-cell" style="color:#ef4444">${a.va}</td>
      <td class="num-cell dim-cell" style="color:#f97316">${a.vr}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="nota-tabs">
      <button class="nota-tab-btn${activeAgentRankTab==='dia'?' active':''}" data-tab="dia">Dia</button>
      <button class="nota-tab-btn${activeAgentRankTab==='semana'?' active':''}" data-tab="semana">Semana</button>
      <button class="nota-tab-btn${activeAgentRankTab==='mes'?' active':''}" data-tab="mes">Mês</button>
    </div>
    <div style="overflow-x:auto;margin-top:10px">
      <table class="data-table rank-table" style="min-width:320px">
        <thead><tr>
          <th style="width:36px">#</th>
          <th>Angariador</th>
          <th class="num-cell" style="color:#a8e63d">DOC</th>
          <th class="num-cell">CQ</th>
          <th class="num-cell dim-cell">PROSP</th>
          <th class="num-cell dim-cell" style="color:#ef4444">VA</th>
          <th class="num-cell dim-cell" style="color:#f97316">VR</th>
        </tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>`;

  wrap.querySelectorAll('.nota-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => { activeAgentRankTab = btn.dataset.tab; renderAgentDailyRanking(currentAgentName); });
  });
}

// ── STREAK VISUAL ────────────────────────────────────────
function renderStreak(agentName, uid) {
  const t = today();
  const entries = getEntries().filter(e =>
    uid ? (e.uid===uid || normalizeAgentName(e.agent)===agentName)
        : (normalizeAgentName(e.agent)===agentName || e.agent===agentName));

  // Build last 7 calendar days
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(t + 'T12:00:00');
    d.setDate(d.getDate() - i);
    const ds = toDateStr(d);
    const entry = entries.find(e => e.date === ds) || null;
    const score = entry ? calcDailyScore(entry) : null;
    const isToday = ds === t;
    // Short label: day/month
    const [,mm,dd] = ds.split('-');
    days.push({ ds, entry, score, isToday, label: `${dd}/${mm}` });
  }

  const streak = calcStreak(agentName, uid);
  let streakColor = '#555';
  if (streak >= 30) streakColor = '#2ecc71';
  else if (streak >= 14) streakColor = '#6495ed';
  else if (streak >= 7)  streakColor = '#a8e63d';
  else if (streak >= 3)  streakColor = '#ff7a00';
  else if (streak >= 1)  streakColor = '#cd7f32';

  const barsHTML = days.map(d => {
    const hasSent = d.score !== null;
    const score = d.score ?? 0;
    const barPct = hasSent ? Math.max(score / 10 * 100, 6) : 0;
    const barColor = hasSent ? scoreColor(score) : 'var(--border)';
    const scoreText = hasSent ? score.toFixed(1) : '—';
    const todayStyle = d.isToday ? 'border:2px solid rgba(255,255,255,0.3);border-radius:10px;padding:2px 2px 0;' : '';
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;${todayStyle}">
        <div style="font-size:11px;font-weight:700;color:${hasSent ? barColor : 'var(--text-muted)'}">${scoreText}</div>
        <div style="width:100%;height:72px;background:var(--bg3);border-radius:6px;overflow:hidden;display:flex;align-items:flex-end">
          <div style="width:100%;height:${barPct}%;background:${barColor};border-radius:6px;transition:height .3s"></div>
        </div>
        <div style="font-size:10px;color:${d.isToday ? '#fff' : 'var(--text-muted)'};font-weight:${d.isToday ? 700 : 400}">${d.label}</div>
      </div>`;
  }).join('');

  document.getElementById('streak-wrap').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div style="font-size:13px;color:var(--text-muted)">Sequência atual:</div>
      <div style="font-size:20px;font-weight:700;color:${streakColor}">${streak > 0 ? `🔥 ${streak}d` : '—'}</div>
    </div>
    <div style="display:flex;gap:6px;align-items:flex-end">${barsHTML}</div>`;
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
  document.querySelectorAll('.doc-indicacao').forEach(sel => {
    sel.addEventListener('change', function() {
      const wrap = document.querySelector(`.doc-indicador-wrap[data-idx="${this.dataset.idx}"]`);
      if (!wrap) return;
      wrap.style.display = this.value==='sim' ? 'block' : 'none';
    });
  });
}

// ── DOC FORM BUILDER (agent — no nota field) ─────────────
function buildDocDetailsHTML(count, prefill) {
  if (count===0) return '';
  let html=`<div class="doc-details-wrap"><div class="doc-details-title">Detalhes dos ${count} DOC${count>1?'s':''}</div>`;
  for (let i=0; i<count; i++) {
    const pre=(prefill&&prefill[i])?prefill[i]:{nome:'',valor:'',bairro:'',tipo:'',indicacao:'',indicador:''};
    const isIndicacao=pre.indicacao==='sim';
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
      <div class="doc-detail-row-indic">
        <div class="form-group">
          <label>É indicação?</label>
          <select class="doc-indicacao" data-idx="${i}">
            <option value="nao" ${!isIndicacao?'selected':''}>Não</option>
            <option value="sim" ${isIndicacao?'selected':''}>Sim</option>
          </select>
        </div>
        <div class="form-group doc-indicador-wrap" data-idx="${i}" style="display:${isIndicacao?'block':'none'}">
          <label>Nome do indicador</label>
          <input type="text" class="doc-indicador" data-idx="${i}" placeholder="Ex: Maria Souza" value="${pre.indicador||''}">
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
      indicacao: document.querySelector(`.doc-indicacao[data-idx="${i}"]`)?.value||'nao',
      indicador: document.querySelector(`.doc-indicador[data-idx="${i}"]`)?.value.trim()||'',
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
    o.value = a.username || a.name.toLowerCase();
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
    const agent = TEAM.find(a => (a.username || a.name.toLowerCase()) === username);
    if (!agent || agent.password !== password) { errEl.textContent='Usuário ou senha incorretos.'; return; }
    setSession({ uid: agent.username || username, username, name:agent.name, role:'agent' });
    window.location.href='dashboard-agente.html';
  });
}

// ── AGENT DASHBOARD ──────────────────────────────────────
let agentUnsubscribe=null;
let histExpanded=false;
let agentEditing=false;
let wizardInProgress=false; // true enquanto o agente está preenchendo o wizard

async function initAgentDashboard() {
  const session=getSession();
  if (!session||session.role!=='agent') { window.location.href='index.html'; return; }
  document.getElementById('agent-name').textContent=session.name;
  document.getElementById('logout-btn').addEventListener('click', ()=>{ if(agentUnsubscribe)agentUnsubscribe(); clearSession(); window.location.href='index.html'; });

  await loadTeam();

  agentUnsubscribe=fbListen(entries=>{
    saveEntries(entries);
    if (wizardInProgress) return; // não interrompe preenchimento em andamento
    const dp=document.getElementById('selected-date');
    renderAgentDashboard(session, dp?.value||today(), agentEditing);
  });
  fbListenSales(sales=>{ SALES=sales; renderVGVRankingAgent(); });
}

function renderVGVRankingAgent() {
  const wrap=document.getElementById('vgv-agent-wrap');
  if (!wrap) return;
  if (!SALES.length) { wrap.innerHTML='<div style="color:var(--text-muted);font-size:13px">Nenhuma venda registrada este mês.</div>'; return; }
  const sales=getSalesPeriod('month');
  const byAgent={};
  sales.forEach(s=>{ byAgent[s.agent]=(byAgent[s.agent]||0)+s.value; });
  const ranked=Object.entries(byAgent).sort((a,b)=>b[1]-a[1]);
  const total=ranked.reduce((s,[,v])=>s+v,0);
  const posColor={1:'#f0c040',2:'#b8b8b8',3:'#cd7f32'};
  if (!ranked.length) { wrap.innerHTML='<div style="color:var(--text-muted);font-size:13px">Nenhuma venda registrada este mês.</div>'; return; }
  wrap.innerHTML=`
    <div style="margin-bottom:10px;padding-bottom:10px;border-bottom:0.5px solid var(--border);display:flex;justify-content:space-between">
      <span style="font-size:13px;color:var(--text-muted)">Total do mês</span>
      <span style="font-size:15px;font-weight:500;color:#a8e63d">${formatCurrency(total)}</span>
    </div>
    ${ranked.map(([name,val],i)=>{
      const pos=i+1;
      const pct=Math.round((val/total)*100);
      const color=posColor[pos]||'var(--text-muted)';
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:0.5px solid var(--border)">
        <span style="font-size:15px;font-weight:500;color:${color};min-width:26px;text-align:center">${pos}°</span>
        <span style="flex:1;font-size:14px">${name}</span>
        <div style="text-align:right">
          <div style="font-size:14px;font-weight:500;color:#a8e63d">${formatCurrency(val)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${pct}%</div>
        </div>
      </div>`;
    }).join('')}`;
}

function renderAgentDashboard(session, selectedDate, editing) {
  const t=today();
  const date = selectedDate || t;
  const { start:wStart, end:wEnd }=weekRange(t);
  const entries=getEntries().filter(e=> session.uid ? (e.uid===session.uid || normalizeAgentName(e.agent)===session.name) : normalizeAgentName(e.agent)===session.name || e.agent===session.name);
  const weekDoc=entries.filter(e=>inRange(e.date,wStart,wEnd)).reduce((s,e)=>s+e.doc,0);
  const sentToday=entries.find(e=>e.date===date);
  const editCount=getEditCount(session.uid||session.name,date);
  const canEdit=editCount<2;

  const { start:mStart, end:mEnd } = monthRange(t);
  const monthDoc = entries.filter(e => inRange(e.date, mStart, mEnd)).reduce((s,e) => s+e.doc, 0);

  // Metas card
  const metasWrap = document.getElementById('metas-wrap');
  if (metasWrap) {
    const monthCpd  = entries.filter(e => inRange(e.date, mStart, mEnd)).reduce((s,e) => s + (e.cpd||0), 0);
    const monthProsp= entries.filter(e => inRange(e.date, mStart, mEnd)).reduce((s,e) => s + (e.prosp||0), 0);

    const { metaCqMonth: META_CQ, metaProspMonth: META_PROSP } = getTeamRatios(t);

    const mesLabel = new Date(t+'T12:00:00').toLocaleString('pt-BR',{month:'long',year:'numeric'});

    // ── Dias do mês ──────────────────────────────────────
    const tDate       = new Date(t+'T12:00:00');
    const daysInMonth = new Date(tDate.getFullYear(), tDate.getMonth()+1, 0).getDate();
    const dayOfMonth  = tDate.getDate();
    const daysRemaining = daysInMonth - dayOfMonth; // dias que ainda faltam (não conta hoje)

    const mkBar = (val, meta, color) => {
      const pct  = Math.min(val / meta * 100, 100);
      const over = val >= meta;
      const c    = over ? '#2ecc71' : val >= meta * 0.6 ? '#f0c040' : color;
      const falta= Math.max(meta - val, 0);
      return { pct, over, c, falta };
    };

    const doc   = mkBar(monthDoc,   META_DOC_MONTH, '#e74c3c');
    const cq    = mkBar(monthCpd,   META_CQ,        '#6495ed');
    const prosp = mkBar(monthProsp, META_PROSP,     '#f0c040');

    // ── Ritmo esperado até hoje (meta proporcional ao dia) ──
    // Ex: meta 128 PROSP, dia 15 de 31 → esperado = round(128 * 15/31) = 62
    const expectedToday = (meta) => Math.round(meta * dayOfMonth / daysInMonth);
    const onPace        = (val, meta) => val >= expectedToday(meta);
    const paceChip      = (val, meta, unit) => {
      const exp  = expectedToday(meta);
      const ahead = val - exp;
      if (val >= meta) return { html: '', ok: true };
      if (ahead >= 0) {
        return { html: `<span class="pace-chip ok">▲ ${ahead} ${unit} à frente do ritmo</span>`, ok: true };
      } else {
        return { html: `<span class="pace-chip warn">▼ ${Math.abs(ahead)} ${unit} abaixo do ritmo</span>`, ok: false };
      }
    };

    // ── Identifica gargalo no funil PROSP → CQ → DOC ────
    const gap = (val, meta) => {
      const exp = expectedToday(meta);
      if (val >= meta) return 0;
      if (exp === 0) return 0; // início do mês: sem expectativa ainda, sem gargalo
      return Math.max(exp - val, 0) / exp; // % abaixo do esperado
    };

    const gapDoc   = gap(monthDoc,   META_DOC_MONTH);
    const gapCpd   = gap(monthCpd,   META_CQ);
    const gapProsp = gap(monthProsp, META_PROSP);

    const bottleneck = (gapProsp === 0 && gapCpd === 0 && gapDoc === 0) ? null
                     : gapProsp >= gapCpd && gapProsp >= gapDoc          ? 'prosp'
                     : gapCpd  >= gapDoc                                  ? 'cq'
                     : 'doc';

    const ndProsp = Math.ceil(Math.max(META_PROSP - monthProsp, 0) / Math.max(daysRemaining, 1));
    const ndCpd   = Math.ceil(Math.max(META_CQ    - monthCpd,   0) / Math.max(daysRemaining, 1));

    const ndDoc = Math.ceil(Math.max(META_DOC_MONTH - monthDoc, 0) / Math.max(daysRemaining, 1));
    const okProsp = onPace(monthProsp, META_PROSP);
    const okCpd   = onPace(monthCpd,   META_CQ);
    const okDoc   = onPace(monthDoc,   META_DOC_MONTH);
    const key = `${okProsp?1:0}${okCpd?1:0}${okDoc?1:0}`; // 000..111
    const MSGS = {
      '000': ['🔥', 'Tudo está abaixo do ritmo. Aumente a prospecção, gere mais CQs e volte a colocar documentação na mesa.'],
      '100': ['🔥', 'Você está prospectando, mas isso não está virando CQ. Revise sua abordagem e gere mais conversas qualificadas.'],
      '110': ['💥', 'CQ você tem. Agora faça essas oportunidades avançarem. Conduza as conversas e transforme CQ em DOC.'],
      '010': ['💥', 'Você está qualificando bem, mas precisa avançar esses CQs. Trabalhe as oportunidades abertas e puxe documentação.'],
      '001': ['🚨', 'Os DOCs estão saindo, mas a entrada está enfraquecendo. Volte a prospectar e gere novos CQs para manter o ritmo.'],
      '101': ['🚨', 'Os DOCs estão vindo, mas seus CQs estão baixos. Melhore a qualidade das conversas para sustentar esse resultado.'],
      '011': ['🔥', 'Você está convertendo bem, mas prospectando pouco. Aumente a entrada para não deixar o ritmo cair.'],
      '111': ['🏆', 'É isso. Não inventa moda. Mantém esse ritmo e vai ser difícil alguém te alcançar.'],
    };
    const [icon, msg] = MSGS[key];
    const isOk = key === '111';
    const bottleneckHTML = `<div class="agent-gargalo ${isOk ? 'ok' : 'warn'}"><div class="agent-gargalo-msg">${icon} ${isOk ? `<strong>${msg}</strong>` : msg}</div></div>`;

    const mkMetaRow = (label, val, meta, unit, b, isBottleneck) => {
      const chip = paceChip(val, meta, unit);
      return `
      <div class="agent-meta-row${isBottleneck ? ' is-bottleneck' : ''}">
        <div class="agent-meta-head">
          <span class="agent-meta-lbl">${label}${isBottleneck ? ' <span class="bottleneck-tag">⚠ abaixo</span>' : ''}</span>
          <span class="agent-meta-nums" style="color:${b.c}">
            <strong>${val}</strong><span style="color:var(--text-muted);font-weight:400"> / ${meta} ${unit}</span>
          </span>
        </div>
        <div class="agent-meta-bar-wrap">
          <div class="agent-meta-bar" style="width:${b.pct}%;background:${b.c}"></div>
        </div>
        <div class="agent-meta-foot">
          <span class="agent-meta-status" style="color:${b.c}">
            ${b.over ? '✓ Meta atingida!' : `Faltam <strong>${b.falta} ${unit}</strong>`}
          </span>
          ${chip.html}
        </div>
      </div>`;
    };

    metasWrap.innerHTML = `
      <div class="agent-meta-card">
        <div class="agent-meta-period">${mesLabel} · dia ${dayOfMonth} de ${daysInMonth} · ${daysRemaining} dias restantes</div>
        ${bottleneckHTML}
        ${mkMetaRow('Angariações (DOC)',     monthDoc,   META_DOC_MONTH, 'DOC',   doc,   !okDoc)}
        ${mkMetaRow('Conversas Qualif. (CQ)',monthCpd,   META_CQ,        'CQ',    cq,    !okCpd)}
        ${mkMetaRow('Prospecções',           monthProsp, META_PROSP,     'PROSP', prosp, !okProsp)}
      </div>`;
  }

  // date picker
  const datePicker = document.getElementById('selected-date');
  if (datePicker) {
    datePicker.max = t;
    if (datePicker.value !== date) datePicker.value = date;
    if (!datePicker._bound) {
      datePicker._bound = true;
      datePicker.addEventListener('change', () => { agentEditing=false; wizardInProgress=false; renderAgentDashboard(session, datePicker.value); });
    }
  }


  renderStreak(session.name, session.uid);

  // Banner agressivo — não enviou hoje
  const noSendBanner = document.getElementById('no-send-banner');
  if (noSendBanner) {
    const notSentToday = !entries.find(e => e.date === t);
    noSendBanner.style.display = notSentToday ? 'flex' : 'none';
  }

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
      `<div class="doc-summary-item">DOC ${i+1}: <strong>${d.nome||'—'}</strong> · ${d.tipo||'—'} · ${d.bairro||'—'} · ${formatCurrency(d.valor)}${d.indicacao==='sim'?` · Indicação: ${d.indicador||'—'}`:''}</div>`
    ).join('');
    const editBtn=canEdit
      ?`<button class="btn btn-outline" id="edit-today-btn" style="margin-top:14px;font-size:13px;padding:9px">Corrigir lançamento de ${formatDate(date)}</button>`
      :`<div style="margin-top:14px;padding:10px 14px;background:rgba(224,62,62,.08);border:1px solid rgba(224,62,62,.25);border-radius:8px;font-size:12px;color:#ff6b6b;text-align:center">Correções esgotadas. Para nova alteração, fale com o gestor.</div>`;
    const dailyScore = calcDailyScore(sentToday);
    const dsColor = scoreColor(dailyScore);
    const dsLabel = scoreLabel(dailyScore);
    const dsMsg = dailyScore >= 8 ? 'Você foi bem, continue!' : dailyScore >= 6 ? 'Bom, mas pode melhorar.' : dailyScore > 3 ? 'Melhore!' : 'Fraco demais!';
    formWrap.innerHTML=`
      <div class="sent-today">
        <div style="font-size:24px;margin-bottom:6px">✓</div>
        <div style="font-weight:600;color:#f0f0f0">Relatório de ${formatDate(date)} enviado</div>
        <div style="font-size:13px;margin-top:6px;color:var(--text-muted)">PROSP <strong style="color:#f0f0f0">${sentToday.prosp}</strong> &nbsp;·&nbsp; CQ <strong style="color:#f0f0f0">${sentToday.cpd}</strong> &nbsp;·&nbsp; DOC <strong style="color:#f0f0f0">${sentToday.doc}</strong>${sentToday.video ? ` &nbsp;·&nbsp; VÍDEO <strong style="color:#e879f9">${sentToday.video}</strong>` : ''}</div>
        <div class="agent-daily-score" style="--nota-color:${dsColor}">
          <span class="agent-nota-val" style="color:${dsColor}">${dailyScore.toFixed(1)}</span>
          <span class="agent-nota-label">${dsLabel}</span>
          <span class="agent-nota-hint">nota do dia</span>
        </div>
        <div style="font-size:13px;font-weight:600;color:${dsColor};margin-top:6px;text-align:center">${dsMsg}</div>
        ${docSummary?`<div class="doc-summary-list">${docSummary}</div>`:''}
        ${editBtn}
      </div>`;
    if (canEdit) document.getElementById('edit-today-btn').addEventListener('click',()=>{ agentEditing=true; renderAgentDashboard(session,date,true); });
  } else {
    const pre=sentToday||{prosp:0,cpd:0,doc:0,video:0,docDetails:[],cpdDetails:[]};
    const isFuture = date > t;
    if (isFuture) {
      formWrap.innerHTML=`<div class="sent-today" style="color:var(--text-muted);font-size:13px">Não é possível lançar para datas futuras.</div>`;
    } else {
      // ── STEP-BY-STEP WIZARD ──────────────────────────────
      const WSTEPS = [
        { key:'prosp', label:'PROSP',  hint:'Quantos imóveis você prospectou?',                                        color:'#f0c040', pts:'+0.11 pts/unidade' },
        { key:'cp',    label:'CQ',     hint:'Quantas conversas com proprietário?',                                      color:'#6495ed', pts:'+0.9 pts/unidade' },
        { key:'doc',   label:'DOC',    hint:'Quantidade de documentações captadas',                                     color:'#a8e63d', pts:'6 pontos por DOC' },
        { key:'vid',   label:'VÍDEO',  hint:'Quantos vídeos publicou hoje? (Instagram | TikTok)',                      color:'#e879f9', pts:'+0.9 pts/unidade' },
        { key:'va',    label:'🏎️ TREINO LIVRE — VISITA AGENDADA', hint:'Quantas visitas agendou hoje? (informe nome, telefone, imóvel e horário)', color:'#ef4444', pts:'controle interno' },
      ];
      const wVals = { prosp: pre.prosp||0, cp: pre.cpd||0, doc: pre.doc||0, vid: pre.video||0, va: pre.va||0 };
      let wStep = 0;

      const wizStepsHTML = WSTEPS.map((s, i) => `
        <div class="wiz-step" id="wiz-step-${i}" style="${i>0?'display:none':''}">
          <div style="font-size:13px;color:var(--text-muted);text-align:center;margin-bottom:4px">${s.hint}</div>
          <div style="font-size:15px;font-weight:700;text-align:center;color:${s.color};margin-bottom:2px">${s.label}</div>
          <div style="font-size:11px;background:var(--bg3);border-radius:8px;padding:5px 12px;text-align:center;color:var(--text-muted);margin-bottom:18px;display:inline-block;width:100%;box-sizing:border-box"><strong style="color:${s.color}">${s.pts}</strong></div>
          <div style="display:flex;align-items:center;justify-content:center;gap:24px;margin-bottom:24px">
            <button class="wiz-adj" data-step="${i}" data-d="-1" style="width:52px;height:52px;border-radius:50%;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.1);color:#fff;font-size:28px;cursor:pointer;line-height:1;flex-shrink:0">−</button>
            <div id="wval-${i}" style="font-size:58px;font-weight:700;color:${s.color};min-width:72px;text-align:center;font-variant-numeric:tabular-nums">${wVals[s.key]}</div>
            <button class="wiz-adj" data-step="${i}" data-d="1" style="width:52px;height:52px;border-radius:50%;border:2px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.1);color:#fff;font-size:28px;cursor:pointer;line-height:1;flex-shrink:0">+</button>
          </div>
          <div style="display:flex;gap:8px">
            ${i > 0 ? `<button class="wiz-back" style="flex:1;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);color:#cdd9e5;border-radius:10px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif">← Voltar</button>` : ''}
            <button class="btn wiz-next" style="flex:2;display:block">${i < WSTEPS.length - 1 ? 'Próximo →' : 'Continuar ✓'}</button>
          </div>
        </div>`).join('');

      formWrap.innerHTML = `
        <div id="daily-wizard" style="padding:8px 0">
          ${sentToday ? `<div style="font-size:12px;color:var(--gold);margin-bottom:12px;text-align:center">Editando lançamento de ${formatDate(date)}</div>` : ''}
          <div style="display:flex;justify-content:center;gap:8px;margin-bottom:18px" id="wiz-dots">
            ${WSTEPS.map((_, i) => `<div class="wiz-dot" id="wdot-${i}"></div>`).join('')}
          </div>
          ${wizStepsHTML}
          <div id="wiz-details" style="display:none">
            <div id="wiz-cpd-area"></div>
            <div id="wiz-doc-area"></div>
            <div id="wiz-va-area"></div>
            <button id="wiz-submit" class="btn" style="margin-top:14px;width:100%">${sentToday ? 'Salvar correção' : 'Enviar relatório'}</button>
            ${sentToday ? '<button type="button" class="btn btn-outline" id="wiz-cancel" style="margin-top:8px;width:100%">Cancelar</button>' : ''}
          </div>
        </div>`;

      const updateDots = () => {
        formWrap.querySelectorAll('.wiz-dot').forEach((d, i) => {
          d.style.cssText = `width:8px;height:8px;border-radius:50%;transition:all .2s;background:${i < wStep ? 'var(--accent)' : i === wStep ? '#fff' : 'var(--border)'};transform:${i === wStep ? 'scale(1.4)' : 'scale(1)'}`;
        });
      };
      updateDots();

      formWrap.querySelectorAll('.wiz-adj').forEach(btn => {
        btn.addEventListener('click', () => {
          wizardInProgress = true; // agente começou a preencher
          const i = parseInt(btn.dataset.step);
          const key = WSTEPS[i].key;
          wVals[key] = Math.max(0, wVals[key] + parseInt(btn.dataset.d));
          document.getElementById('wval-' + i).textContent = wVals[key];
        });
      });

      const showStep = (n) => {
        formWrap.querySelectorAll('.wiz-step').forEach(s => s.style.display = 'none');
        const el = document.getElementById('wiz-step-' + n);
        if (el) { el.style.display = ''; wStep = n; updateDots(); }
      };

      const showDetails = () => {
        formWrap.querySelectorAll('.wiz-step').forEach(s => s.style.display = 'none');
        document.getElementById('wiz-details').style.display = '';
        document.getElementById('wiz-cpd-area').innerHTML = buildCpdDetailsHTML(wVals.cp, pre.cpdDetails||[]);
        document.getElementById('wiz-doc-area').innerHTML = buildDocDetailsHTML(wVals.doc, pre.docDetails||[]);
        document.getElementById('wiz-va-area').innerHTML = buildVaDetailsHTML(wVals.va, pre.vaDetails||[]);
        document.querySelectorAll('.cpd-tel,.vr-tel').forEach(applyPhoneMask);
        bindBairroSelects();
        wStep = WSTEPS.length; updateDots();
      };

      formWrap.querySelectorAll('.wiz-next').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.closest('.wiz-step').id.split('-').pop());
          if (idx < WSTEPS.length - 1) showStep(idx + 1); else showDetails();
        });
      });
      formWrap.querySelectorAll('.wiz-back').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.closest('.wiz-step').id.split('-').pop());
          showStep(idx - 1);
        });
      });

      document.getElementById('wiz-submit').addEventListener('click', async () => {
        const cpdDetails = collectCpdDetails(wVals.cp);
        if (sentToday?.cpdDetails) {
          cpdDetails.forEach((d,i) => { if (sentToday.cpdDetails[i]) { const s=sentToday.cpdDetails[i]; d.status=s.status||''; d.motivo=s.motivo||''; d.lastContact=s.lastContact||''; d.contactDates=s.contactDates||[]; } });
        }
        const docDetails = collectDocDetails(wVals.doc);
        for (let i=0;i<docDetails.length;i++) { if(!docDetails[i].nome||!docDetails[i].bairro||!docDetails[i].tipo){alert(`Preencha todos os campos obrigatórios do DOC ${i+1}.`);return;} }
        if (sentToday?.docDetails) {
          docDetails.forEach((d,i) => { if (sentToday.docDetails[i]) { const s=sentToday.docDetails[i]; d.nota=s.nota||''; d.lastContact=s.lastContact||''; d.contactDates=s.contactDates||[]; } });
        }
        const isEdit = !!sentToday;
        agentEditing = false;
        const submitBtn = document.getElementById('wiz-submit');
        submitBtn.disabled = true; submitBtn.textContent = 'Enviando...';
        const submittedDate = sentToday?.submittedDate||sentToday?.date||today();
        const vaDetails = collectVaDetails(wVals.va);
        if (sentToday?.vaDetails) {
          vaDetails.forEach((d,i) => { if (sentToday.vaDetails[i]) { const s=sentToday.vaDetails[i]; d.realizada = s.realizada!=null ? s.realizada : false; d.dataRealizacao = s.dataRealizacao||''; d.horarioRealizacao = s.horarioRealizacao||''; } });
        }
        try {
          wizardInProgress = false; // libera re-render após submit
          await upsertEntry({date, uid:session.uid, agent:session.name, prosp:wVals.prosp, cpd:wVals.cp, doc:wVals.doc, video:wVals.vid, va:wVals.va, vr:0, cpdDetails, docDetails, vaDetails, vrDetails:[], submittedDate});
          if (isEdit) incrementEditCount(session.uid||session.name, date);
          submitBtn.textContent = '✅ Enviado!';
          setTimeout(() => { submitBtn.textContent = isEdit ? 'Salvar edição' : 'Enviar lançamento'; submitBtn.disabled = false; }, 2500);
        } catch(err) {
          submitBtn.disabled = false; submitBtn.textContent = isEdit ? 'Salvar edição' : 'Enviar lançamento';
          alert('❌ Erro ao salvar. Verifique sua conexão e tente novamente.\n\n' + (err?.message || err));
          return;
        }
      });

      const cancelBtn = document.getElementById('wiz-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', () => { agentEditing=false; wizardInProgress=false; renderAgentDashboard(session, date); });
    }
  }

  renderAgentContacts(session.name);
  renderAgentVisits(session.name);
  renderAgentDailyRanking(session.name);

  const historyBody=document.getElementById('history-body');
  const histShowMore=document.getElementById('hist-show-more');
  const sorted=[...entries].sort((a,b)=>b.date.localeCompare(a.date));
  const renderHistRows = (limit) => {
    const visible = limit ? sorted.slice(0, limit) : sorted;
    historyBody.innerHTML=visible.length===0
      ?'<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">Nenhum registro</td></tr>'
      :visible.map(e=>`<tr><td>${formatDate(e.date)}</td><td class="num-cell">${e.prosp}</td><td class="num-cell">${e.cpd}</td><td class="num-cell">${e.doc}</td></tr>`).join('');
    if (histShowMore) {
      if (sorted.length > 3 && limit) {
        histShowMore.style.display='block';
        histShowMore.textContent=`Ver todos (${sorted.length})`;
        histShowMore.onclick=()=>{ histExpanded=true; renderHistRows(null); histShowMore.style.display='none'; };
      } else {
        histShowMore.style.display='none';
      }
    }
  };
  renderHistRows(histExpanded ? null : 3);
}

// ── GESTOR DASHBOARD ─────────────────────────────────────
let evolucaoChart=null, analyticsChart=null;
let activePeriod='today', activeConvMode='prosp-cpd', activeAnalyticsMode='tipo';
let activeRankingPeriod='week';
let activeMonthRef=today(); // 'YYYY-MM-DD' — referência do mês selecionado no filtro "Mês"
let activeWeekRef=today();  // 'YYYY-MM-DD' — referência da semana selecionada no filtro "Semana"
let gestorUnsubscribe=null;
let salesUnsubscribe=null;
let SALES=[];
let vgvPeriod='month';
let vgvMonth=today().slice(0,7);

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
  document.querySelectorAll('.rank-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeRankingPeriod = btn.dataset.rp;
      renderGestorRanking();
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
  await loadVideoAuth();
  gestorUnsubscribe=fbListen(entries=>{
    saveEntries(entries);
    renderGestorDashboard();
    renderDayView(document.getElementById('day-input')?.value||today());
    renderTimeline();
    renderNotasRanking();
    renderVGVRanking();
  });
  salesUnsubscribe=fbListenSales(sales=>{
    SALES=sales;
    renderGestorDashboard();
    renderVGVRanking();
    renderVendasList();
  });
  initDayView();
  initExport();
  initGestorLancamento();
  initTeamManagement();
  initOfertaAtiva();
  initVendas();
}

function renderVGVRanking() {
  const card = document.getElementById('vgv-ranking-card');
  const wrap = document.getElementById('vgv-ranking-wrap');
  if (!card || !wrap) return;
  if (!SALES.length) { card.style.display = 'none'; return; }
  card.style.display = '';

  const PERIODS = [
    { key: 'month', label: 'Mês' },
    { key: 'quarter', label: 'Trimestre' },
    { key: 'semester', label: 'Semestre' },
    { key: 'year', label: 'Ano' },
  ];
  const sales = getSalesPeriod(vgvPeriod);
  const byAgent = {};
  sales.forEach(s => { byAgent[s.agent] = (byAgent[s.agent] || 0) + s.value; });
  const ranked = Object.entries(byAgent).sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((s, [, v]) => s + v, 0);
  const posColor = { 1:'#f0c040', 2:'#b8b8b8', 3:'#cd7f32' };
  const periodLabel = PERIODS.find(p => p.key === vgvPeriod)?.label || 'Mês';

  const monthPicker = vgvPeriod === 'month'
    ? `<input type="month" id="vgv-month-input" value="${vgvMonth}" style="width:100%;margin-bottom:12px;background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:8px 10px;font-size:13px">`
    : '';

  wrap.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:10px">
      ${PERIODS.map(p => `<button class="filter-btn vgv-period-btn${vgvPeriod===p.key?' active':''}" data-vgv="${p.key}" style="flex:1;font-size:12px;padding:6px 4px">${p.label}</button>`).join('')}
    </div>
    ${monthPicker}
    ${!ranked.length
      ? `<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Nenhuma venda neste período.</div>`
      : `<div style="margin-bottom:12px;padding-bottom:10px;border-bottom:0.5px solid var(--border);display:flex;justify-content:space-between;align-items:center">
           <span style="font-size:13px;color:var(--text-muted)">Total VGV — ${periodLabel}</span>
           <span style="font-size:17px;font-weight:500;color:#a8e63d">${formatCurrency(total)}</span>
         </div>
         ${ranked.map(([name, val], i) => {
           const pos = i + 1;
           const pct = Math.round((val / total) * 100);
           const color = posColor[pos] || 'var(--text-muted)';
           return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:0.5px solid var(--border)">
             <span style="font-size:15px;font-weight:500;color:${color};min-width:26px;text-align:center">${pos}°</span>
             <span style="flex:1;font-size:14px">${name}</span>
             <div style="text-align:right">
               <div style="font-size:14px;font-weight:500;color:#a8e63d">${formatCurrency(val)}</div>
               <div style="font-size:11px;color:var(--text-muted)">${pct}% do total</div>
             </div>
           </div>`;
         }).join('')}`}`;

  wrap.querySelectorAll('.vgv-period-btn').forEach(btn => {
    btn.addEventListener('click', () => { vgvPeriod = btn.dataset.vgv; renderVGVRanking(); });
  });
  const mi = document.getElementById('vgv-month-input');
  if (mi) mi.addEventListener('change', e => { vgvMonth = e.target.value; renderVGVRanking(); });
}

function renderVendasList() {
  const wrap=document.getElementById('venda-list');
  if (!wrap) return;
  const ref=activeMonthRef||today();
  const items=getSalesMonth(ref).sort((a,b)=>b.date.localeCompare(a.date));
  if (!items.length) {
    wrap.innerHTML='<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Nenhuma venda registrada este mês.</div>';
    return;
  }
  wrap.innerHTML=items.map(s=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:0.5px solid var(--border)">
      <div>
        <div style="font-size:14px;font-weight:500">${s.agent}</div>
        <div style="font-size:12px;color:var(--text-muted)">${s.date.slice(8)}/${s.date.slice(5,7)}/${s.date.slice(0,4)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:14px">
        <span style="font-size:15px;font-weight:500;color:#a8e63d">${formatCurrency(s.value)}</span>
        <button onclick="window.deleteSale('${s.id}')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;line-height:1;padding:0">×</button>
      </div>
    </div>`).join('');
}

window.deleteSale=async id=>{
  if (!confirm('Remover esta venda?')) return;
  await fbDeleteSale(id);
};

function initVendas() {
  const form=document.getElementById('venda-form');
  if (!form) return;
  const sel=document.getElementById('venda-agent');
  getAgentNames().forEach(n=>{ sel.innerHTML+=`<option value="${n}">${n}</option>`; });
  document.getElementById('venda-date').value=today();
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const agent=document.getElementById('venda-agent').value;
    const date=document.getElementById('venda-date').value;
    const raw=document.getElementById('venda-value').value.replace(/\D/g,'');
    const value=parseFloat(raw);
    if (!agent||!date||!value) return;
    const btn=form.querySelector('button[type=submit]');
    btn.disabled=true;
    await fbSaveSale({ agent, date, value });
    form.reset();
    sel.value='';
    document.getElementById('venda-date').value=today();
    btn.disabled=false;
  });
  renderVendasList();
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

  document.getElementById('lanc-cpd').addEventListener('input',function(){
    document.getElementById('lanc-cpd-details').innerHTML=buildCpdDetailsHTML(Math.max(0,parseInt(this.value)||0),[]);
    document.querySelectorAll('.cpd-tel').forEach(applyPhoneMask);
  });
  document.getElementById('lanc-doc').addEventListener('input',function(){
    document.getElementById('lanc-doc-details').innerHTML=buildDocDetailsHTML(Math.max(0,parseInt(this.value)||0),[]);
    bindBairroSelects();
  });
  document.getElementById('lanc-va').addEventListener('input',function(){
    document.getElementById('lanc-va-details').innerHTML=buildVaDetailsHTML(Math.max(0,parseInt(this.value)||0),[]);
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
    const lancCpdVal=parseInt(document.getElementById('lanc-cpd').value)||0;
    const lancCpdDetails=collectCpdDetails(lancCpdVal);
    const lancVaVal=parseInt(document.getElementById('lanc-va').value)||0;
    const vaDetails=collectVaDetails(lancVaVal);
    const agentUid = (TEAM.find(a=>a.name===agent))?.username || null;
    try {
      await upsertEntry({date,uid:agentUid,agent,prosp:parseInt(document.getElementById('lanc-prosp').value)||0,cpd:lancCpdVal,doc:docVal,video:parseInt(document.getElementById('lanc-video').value)||0,va:lancVaVal,vr:0,cpdDetails:lancCpdDetails,docDetails,vaDetails,vrDetails:[],submittedDate});
      resetEditCount(agentUid||agent,date);
      btn.textContent='✅ Salvo!';
      setTimeout(() => { btn.disabled=false; btn.textContent='Salvar lançamento'; }, 2000);
    } catch(err) {
      btn.disabled=false; btn.textContent='Salvar lançamento';
      alert('❌ Erro ao salvar. Verifique sua conexão e tente novamente.');
      return;
    }
    // reset form
    document.getElementById('lanc-prosp').value=0;
    document.getElementById('lanc-cpd').value=0;
    document.getElementById('lanc-doc').value=0;
    document.getElementById('lanc-video').value=0;
    document.getElementById('lanc-cpd-details').innerHTML='';
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
  if (dates.length === 0) { evolucaoChart = null; return; }

  // per agent datasets
  const agentNames = getAgentNames();
  const colors = ['#a8e63d','#6495ed','#2ecc71','#e67e22','#e74c3c','#9b59b6','#1abc9c','#f1c40f'];
  const datasets = agentNames.map((name,i) => ({
    label: name,
    data: dates.map(d => { const uid=TEAM.find(a=>a.name===name)?.username; const e=entries.find(x=>x.date===d&&(uid?(x.uid===uid||normalizeAgentName(x.agent)===name):(normalizeAgentName(x.agent)===name||x.agent===name))); return e?e.doc:0; }),
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

async function exportBackup() {
  const btn = document.getElementById('export-backup-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Exportando...'; }
  try {
    const backup = {
      exportedAt: new Date().toISOString(),
      version: 'nickel-crm-v107',
      entries: getEntries(),
      team: TEAM,
      sales: SALES,
    };
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href     = url;
    a.download = `nickel-crm-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (btn) { btn.textContent = '✅ Backup baixado!'; setTimeout(() => { btn.disabled = false; btn.textContent = '💾 Exportar backup completo'; }, 3000); }
  } catch(e) {
    alert('❌ Erro ao exportar. Verifique sua conexão.');
    if (btn) { btn.disabled = false; btn.textContent = '💾 Exportar backup completo'; }
  }
}

function initTeamManagement() {
  const wrap = document.getElementById('team-mgmt');
  if (!wrap) return;
  renderTeamList();

  const renameAllBtn = document.getElementById('rename-all-btn');
  if (renameAllBtn) {
    renameAllBtn.addEventListener('click', async () => {
      renameAllBtn.disabled = true; renameAllBtn.textContent = '🔄 Atualizando...';
      await adminRenameAll();
      renameAllBtn.disabled = false; renameAllBtn.textContent = '🔄 Atualizar todos os nomes no sistema';
    });
  }
  const exportBtn = document.getElementById('export-backup-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportBackup);

  const migrateBtn = document.getElementById('migrate-uid-btn');
  if (migrateBtn) {
    migrateBtn.addEventListener('click', async () => {
      migrateBtn.disabled = true; migrateBtn.textContent = '⏳ Migrando...';
      await adminMigrateToUid();
      migrateBtn.disabled = false; migrateBtn.textContent = '🔑 Migrar dados para UID permanente';
    });
  }

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
      <button class="clear-agent-btn" data-idx="${i}" style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#ef4444;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer">Zerar dados</button>
      <button class="del-agent-btn" data-idx="${i}">Remover</button>
    </div>`).join('');
  list.querySelectorAll('.clear-agent-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const member = TEAM[parseInt(btn.dataset.idx)];
      const name = member.name;
      const memberUid = member.username;
      const entries = getEntries().filter(e => memberUid ? (e.uid===memberUid || normalizeAgentName(e.agent)===name) : normalizeAgentName(e.agent)===name || e.agent===name);
      if (entries.length === 0) { alert(`${name} não tem nenhum lançamento.`); return; }
      if (!confirm(`Apagar todos os ${entries.length} lançamentos de ${name}?\n\nEssa ação não pode ser desfeita.`)) return;
      btn.disabled = true; btn.textContent = 'Apagando...';
      try {
        for (const e of entries) await fbDeleteEntry(e);
        saveEntries(getEntries().filter(e => !(memberUid ? (e.uid===memberUid || normalizeAgentName(e.agent)===name) : normalizeAgentName(e.agent)===name || e.agent===name)));
        alert(`✅ Dados de ${name} apagados com sucesso.`);
      } catch(err) {
        alert('❌ Erro ao apagar dados. Verifique sua conexão.');
      }
      btn.disabled = false; btn.textContent = 'Zerar dados';
    });
  });
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

// Visual da ofensiva (emoji + cor) reutilizado no ranking de sequência e no resumo p/ compartilhar
function streakTier(streak) {
  if      (streak === 0) return { emoji:'💤', color:'#555' };
  else if (streak < 3)   return { emoji:'🔥', color:'#cd7f32' };
  else if (streak < 7)   return { emoji:'🔥', color:'#ff7a00' };
  else if (streak < 14)  return { emoji:'🔥', color:'#a8e63d' };
  else if (streak < 30)  return { emoji:'🔥', color:'#6495ed' };
  else                   return { emoji:'🏆', color:'#2ecc71' };
}

function renderStreakRanking() { renderTimeline(); }

function renderGestorRanking() {
  const t = today();
  const rankEntries = filterEntries(activeRankingPeriod, t).filter(e => new Set(getAgentNames()).has(normalizeAgentName(e.agent)));
  const periodKey = activeRankingPeriod === 'month' ? t.slice(0,7) : t.slice(0,7);
  const rankByAgent = sumByAgent(rankEntries, periodKey);
  const ranked = [...rankByAgent].sort((a,b)=>b.doc!==a.doc?b.doc-a.doc:b.cpd!==a.cpd?b.cpd-a.cpd:b.prosp-a.prosp);
  const body = document.getElementById('rank-body');
  if (body) {
    body.innerHTML = ranked.map((a,i) => {
      const pos = i+1;
      return `<tr class="${pos<=3?'podium-row podium-'+pos:''}"><td><span class="rank-badge ${pos<=3?PODIUM[pos]:''}">${pos<=3?PODIUM_LABEL[pos]:pos}</span></td><td>${a.agent}</td><td class="num-cell doc-cell">${a.doc}</td><td class="num-cell">${a.cpd}</td><td class="num-cell dim-cell">${a.prosp}</td><td class="num-cell dim-cell" style="color:#ef4444">${a.va||0}</td><td class="num-cell dim-cell" style="color:#f97316">${a.vr||0}</td></tr>`;
    }).join('');
  }
  // Highlight active ranking filter btn
  document.querySelectorAll('.rank-period-btn').forEach(b => b.classList.toggle('active', b.dataset.rp === activeRankingPeriod));
}

function renderGestorDashboard() {
  const ref = activePeriod==='month' ? activeMonthRef : activePeriod==='week' ? activeWeekRef : undefined;
  const team=new Set(getAgentNames());
  const entries=filterEntries(activePeriod, ref).filter(e=>team.has(normalizeAgentName(e.agent)));
  const periodKey = activePeriod === 'month'
    ? (activeMonthRef || today()).slice(0, 7)
    : activePeriod === 'week' ? activeWeekRef || today().slice(0, 7) : today().slice(0, 7);
  const byAgent=sumByAgent(entries, periodKey);

  const totProsp=byAgent.reduce((s,a)=>s+a.prosp,0), totCpd=byAgent.reduce((s,a)=>s+a.cpd,0), totDoc=byAgent.reduce((s,a)=>s+a.doc,0);
  const totVid=byAgent.reduce((s,a)=>s+(a.vid||0),0);
  document.getElementById('tot-prosp').textContent=totProsp;
  document.getElementById('tot-cpd').textContent=totCpd;
  document.getElementById('tot-doc').textContent=totDoc;
  document.getElementById('tot-vid').textContent=totVid;

  // ── METAS com barras de progresso ────────────────────────
  // Só exibe no filtro "mês"
  const showMeta = activePeriod === 'month';
  // META_DOC_GESTOR is a global constant (defined at top of file)
  ['prosp','cpd','doc','vid'].forEach(k => {
    document.getElementById(`meta-${k}-bar-wrap`).style.display = showMeta ? '' : 'none';
    document.getElementById(`meta-${k}-lbl`).textContent = '';
  });
  if (showMeta) {
    const { metaCqGestor: metaCpd, metaProspGestor: metaProsp } = getTeamRatios(activeMonthRef || today());

    const setBar = (key, atual, meta, color) => {
      const pct = Math.min(Math.round((atual / meta) * 100), 100);
      document.getElementById(`meta-${key}-lbl`).textContent = `/ ${meta}`;
      document.getElementById(`meta-${key}-bar`).style.width = pct + '%';
      document.getElementById(`meta-${key}-bar`).style.background = pct >= 100 ? '#a8e63d' : color;
    };
    const META_VID_GESTOR = Math.round(getAgentNames().length * 15);
    setBar('doc',   totDoc,   META_DOC_GESTOR,  '#a8e63d');
    setBar('cpd',   totCpd,   metaCpd,          '#6495ed');
    setBar('prosp', totProsp, metaProsp,         '#f0c040');
    setBar('vid',   totVid,   META_VID_GESTOR,   '#e879f9');
  }

  renderGestorRanking();

  // Evolução diária de DOC
  renderEvolucaoDiaria(entries);

  const allDocs=entries.flatMap(e=>e.docDetails||[]);
  renderStreakRanking();
  renderDocList(entries);
  renderCpdList(entries);
  renderVisitList(entries);
  renderVideoValidation(entries);
  renderAnalyticsChart(allDocs);

  document.querySelectorAll('.analytics-btn').forEach(b=>{
    b.onclick=()=>{ activeAnalyticsMode=b.dataset.mode; document.querySelectorAll('.analytics-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); renderAnalyticsChart(allDocs); };
    b.classList.toggle('active',b.dataset.mode===activeAnalyticsMode);
  });
  const convRanked=[...byAgent].sort((a,b)=>b.doc!==a.doc?b.doc-a.doc:b.cpd!==a.cpd?b.cpd-a.cpd:b.prosp-a.prosp);
  renderConversion(convRanked);
  document.querySelectorAll('.conv-mode-btn').forEach(b=>{
    b.onclick=()=>{ activeConvMode=b.dataset.mode; document.querySelectorAll('.conv-mode-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); renderConversion(convRanked); };
    b.classList.toggle('active',b.dataset.mode===activeConvMode);
  });
  renderNotasRanking();
}

function renderAnalyticsChart(allDocs) {
  const ctx=document.getElementById('tipo-chart').getContext('2d');
  if (analyticsChart) analyticsChart.destroy();
  document.getElementById('analytics-empty').style.display=allDocs.length===0?'block':'none';
  if (allDocs.length===0) { analyticsChart = null; return; }
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
let activeDocAgent = '', activeCpdAgent = '', activeVisitAgent = '', activeVisitStatus = 'todas';

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
  const bairrosOpts = BAIRROS.map(b=>`<option value="${b}">${b}</option>`).join('');
  const tiposOpts   = TIPOS.map(t=>`<option value="${t}">${t}</option>`).join('');

  wrap.innerHTML=filterHTML+`<div class="doc-table-wrap"><table class="data-table doc-table">
    <colgroup>
      <col style="width:10%"><col style="width:10%"><col style="width:8%"><col style="width:11%">
      <col style="width:13%"><col style="width:8%"><col style="width:11%"><col style="width:11%"><col style="width:9%"><col style="width:9%">
    </colgroup>
    <thead><tr><th>Data</th><th>Angariador</th><th>Indicação</th><th>Indicador</th><th>Proprietário</th><th>Tipo</th><th>Bairro</th><th class="num-cell">Valor</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows.map(d=>`
    <tr data-row-date="${d.date}" data-row-agent="${d.agent}" data-row-idx="${d.idx}">
      <td>${formatDate(d.date)}</td>
      <td>${d.agent}</td>
      <td>${d.indicacao==='sim'?'Sim':'Não'}</td>
      <td>${d.indicacao==='sim'?(d.indicador||'—'):'—'}</td>
      <td style="font-weight:500">${d.nome||'—'}</td>
      <td>${d.tipo?`<span class="tipo-tag tipo-${d.tipo.toLowerCase()}">${d.tipo}</span>`:'—'}</td>
      <td>${d.bairro||'—'}</td>
      <td class="num-cell" style="padding-right:28px">${formatCurrency(d.valor)}</td>
      <td style="padding-left:12px">
        <select class="nota-select status-sel-${(d.nota||'').toLowerCase().replace(/\s/g,'')}" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}">
          ${STATUS_OPTIONS.map(o=>`<option value="${o.value}" ${d.nota===o.value?'selected':''}>${o.label}</option>`).join('')}
        </select>
      </td>
      <td><button class="doc-edit-btn" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}"
        data-nome="${(d.nome||'').replace(/"/g,'&quot;')}" data-valor="${d.valor||0}"
        data-bairro="${(d.bairro||'').replace(/"/g,'&quot;')}" data-tipo="${d.tipo||''}"
        data-indicacao="${d.indicacao||'nao'}" data-indicador="${(d.indicador||'').replace(/"/g,'&quot;')}">✏️</button></td>
    </tr>
    <tr class="doc-edit-row" data-edit-date="${d.date}" data-edit-agent="${d.agent}" data-edit-idx="${d.idx}" style="display:none">
      <td colspan="10">
        <div class="doc-edit-form">
          <div class="doc-edit-fields">
            <div class="form-group" style="margin:0"><label>Proprietário</label><input class="ef-nome" type="text" value="${(d.nome||'').replace(/"/g,'&quot;')}"></div>
            <div class="form-group" style="margin:0"><label>Valor</label><input class="ef-valor" type="number" min="0" value="${d.valor||0}"></div>
            <div class="form-group" style="margin:0"><label>Tipo</label><select class="ef-tipo"><option value="">Selecione</option>${tiposOpts}</select></div>
            <div class="form-group" style="margin:0"><label>Bairro</label><select class="ef-bairro"><option value="">Selecione</option>${bairrosOpts}<option value="__outro__">Outro...</option></select><input type="text" class="ef-bairro-outro" placeholder="Digite o bairro" style="margin-top:6px;display:none"></div>
            <div class="form-group" style="margin:0"><label>Indicação</label><select class="ef-indicacao"><option value="nao">Não</option><option value="sim">Sim</option></select></div>
            <div class="form-group ef-indicador-wrap" style="margin:0"><label>Indicador</label><input class="ef-indicador" type="text" value="${(d.indicador||'').replace(/"/g,'&quot;')}"></div>
          </div>
          <div class="doc-edit-actions">
            <button class="btn ef-save" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}">Salvar</button>
            <button class="btn btn-outline ef-cancel" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}">Cancelar</button>
          </div>
        </div>
      </td>
    </tr>`).join('')}</tbody></table></div>`;

  wrap.querySelector('#doc-agent-filter').addEventListener('change',function(){ activeDocAgent=this.value; renderDocList(entries); });

  const findEditRow = (date, agent, idx) =>
    wrap.querySelector(`.doc-edit-row[data-edit-date="${date}"][data-edit-agent="${agent}"][data-edit-idx="${idx}"]`);

  // pre-fill selects in edit rows
  rows.forEach(d => {
    const row = findEditRow(d.date, d.agent, d.idx);
    if (!row) return;
    row.querySelector('.ef-tipo').value = d.tipo||'';
    const bSel = row.querySelector('.ef-bairro');
    const bOutro = row.querySelector('.ef-bairro-outro');
    if (d.bairro && !BAIRROS.includes(d.bairro)) {
      bSel.value = '__outro__';
      bOutro.value = d.bairro;
      bOutro.style.display = 'block';
    } else {
      bSel.value = d.bairro || '';
    }
    bSel.addEventListener('change', function() {
      bOutro.style.display = this.value === '__outro__' ? 'block' : 'none';
    });
    row.querySelector('.ef-indicacao').value = d.indicacao||'nao';
    const indWrap = row.querySelector('.ef-indicador-wrap');
    indWrap.style.display = (d.indicacao==='sim') ? '' : 'none';
    row.querySelector('.ef-indicacao').addEventListener('change', function(){
      indWrap.style.display = this.value==='sim' ? '' : 'none';
    });
  });

  // edit button toggle
  wrap.querySelectorAll('.doc-edit-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const editRow = findEditRow(btn.dataset.date, btn.dataset.agent, btn.dataset.idx);
      const isOpen = editRow.style.display !== 'none';
      // close all others
      wrap.querySelectorAll('.doc-edit-row').forEach(r=>r.style.display='none');
      wrap.querySelectorAll('.doc-edit-btn').forEach(b=>b.classList.remove('active'));
      if (!isOpen) { editRow.style.display=''; btn.classList.add('active'); }
    });
  });

  // save
  wrap.querySelectorAll('.ef-save').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const row = findEditRow(btn.dataset.date, btn.dataset.agent, btn.dataset.idx);
      const fields = {
        nome:      row.querySelector('.ef-nome').value.trim(),
        valor:     parseFloat(row.querySelector('.ef-valor').value)||0,
        tipo:      row.querySelector('.ef-tipo').value,
        bairro:    row.querySelector('.ef-bairro').value === '__outro__' ? row.querySelector('.ef-bairro-outro').value.trim() : row.querySelector('.ef-bairro').value,
        indicacao: row.querySelector('.ef-indicacao').value,
        indicador: row.querySelector('.ef-indicador').value.trim(),
      };
      btn.textContent='Salvando...'; btn.disabled=true;
      await updateDocDetail(btn.dataset.date, btn.dataset.agent, parseInt(btn.dataset.idx), fields);
      const freshRef = activePeriod==='month' ? activeMonthRef : activePeriod==='week' ? activeWeekRef : undefined;
      renderDocList(filterEntries(activePeriod, freshRef));
    });
  });

  // cancel
  wrap.querySelectorAll('.ef-cancel').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      findEditRow(btn.dataset.date, btn.dataset.agent, btn.dataset.idx).style.display='none';
    });
  });

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
}

// ── LINHA DO TEMPO (últimos 30 dias) ─────────────────────
let tlStart = null, tlEnd = null, tlAgent = '';

function renderTimeline() {
  const wrap = document.getElementById('timeline-wrap');
  if (!wrap) return;
  const agentNames = getAgentNames();
  const entries = getEntries();
  const t = today();

  // default range: last 7 days
  if (!tlStart) { const d = new Date(t+'T12:00:00'); d.setDate(d.getDate()-6); tlStart = toDateStr(d); }
  if (!tlEnd)   tlEnd = t;

  // build days in range (oldest → newest)
  const days = [];
  let cur = new Date(tlStart+'T12:00:00');
  const endD = new Date(tlEnd+'T12:00:00');
  while (cur <= endD) { days.push(toDateStr(cur)); cur.setDate(cur.getDate()+1); }

  // entry lookup per agent+date — index by canonical name AND uid-based name
  const entryMap = {};
  entries.forEach(e => {
    entryMap[e.agent+'|'+e.date] = e;
    const canon = normalizeAgentName(e.agent);
    if (canon !== e.agent) entryMap[canon+'|'+e.date] = e;
    if (e.uid) {
      const member = TEAM.find(a => a.username === e.uid);
      if (member && member.name !== e.agent && member.name !== canon) entryMap[member.name+'|'+e.date] = e;
    }
  });

  // sort by streak desc, filter by selected agent
  const sorted = agentNames
    .map(name => { const uid = TEAM.find(a=>a.name===name)?.username; return { name, uid, streak: calcStreak(name, uid) }; })
    .sort((a, b) => b.streak - a.streak)
    .filter(r => !tlAgent || r.name === tlAgent);

  // header
  const headerCells = days.map((d, i) => {
    const isToday = d === t;
    const day = d.slice(8);
    const isFirstOfMonth = day === '01' || i === 0;
    const monthAbbr = isFirstOfMonth
      ? new Date(d+'T12:00:00').toLocaleString('pt-BR',{month:'short'}).replace('.','')
      : '';
    return `<div class="tl-cell tl-head${isToday?' tl-today':''}" title="${formatDate(d)}">
      ${monthAbbr?`<span class="tl-month">${monthAbbr}</span>`:''}
      <span>${day}</span>
    </div>`;
  }).join('');

  const agentRows = sorted.map(({ name, streak }) => {
    const { emoji, color } = streakTier(streak);
    const cells = days.map(d => {
      const e = entryMap[name+'|'+d];
      const sent = !!e;
      const isToday = d === t;
      const score = sent ? calcDailyScore(e) : null;
      const nota = score !== null ? (score % 1 === 0 ? score.toFixed(0) : score.toFixed(1)) : '';
      const cellBg = sent ? scoreColor(score) : '';
      const notaColor = sent && score <= 3 ? '#fff' : '#07090f';
      return `<div class="tl-cell tl-day${sent?' tl-sent':''}${isToday?' tl-today':''}" title="${formatDate(d)}${sent?' — Nota '+score.toFixed(1):''}" ${sent?`style="background:${cellBg};border-color:${cellBg}"`:''}>
        <span class="tl-nota" style="color:${notaColor}">${nota}</span>
      </div>`;
    }).join('');
    return `<div class="tl-row">
      <div class="tl-name">
        <span class="tl-agent-name">${name}</span>
        <span class="tl-streak" style="color:${color}">${emoji} ${streak}d</span>
      </div>
      <div class="tl-cells">${cells}</div>
    </div>`;
  }).join('');

  const agentOpts = `<option value="">Todos os angariadores</option>`
    + agentNames.map(n => `<option value="${n}" ${tlAgent===n?'selected':''}>${n}</option>`).join('');

  wrap.innerHTML = `
    <div class="tl-range-row" style="flex-wrap:wrap;gap:8px">
      <label>De</label>
      <input type="date" id="tl-start" value="${tlStart}" max="${tlEnd}">
      <label>até</label>
      <input type="date" id="tl-end" value="${tlEnd}" max="${t}">
      <select id="tl-agent" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:6px 10px;font-family:'DM Sans',sans-serif;font-size:13px">${agentOpts}</select>
      <button id="tl-export-btn" style="margin-left:auto;background:var(--gold);border:none;color:#07090f;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif">⬇ Exportar</button>
    </div>
    <div class="tl-row tl-header">
      <div class="tl-name"></div>
      <div class="tl-cells">${headerCells}</div>
    </div>
    ${agentRows}`;

  document.getElementById('tl-start').addEventListener('change', e => {
    tlStart = e.target.value;
    if (tlStart > tlEnd) tlEnd = tlStart;
    renderTimeline();
  });
  document.getElementById('tl-end').addEventListener('change', e => {
    tlEnd = e.target.value;
    if (tlEnd < tlStart) tlStart = tlEnd;
    renderTimeline();
  });
  document.getElementById('tl-agent').addEventListener('change', e => {
    tlAgent = e.target.value;
    renderTimeline();
  });

  document.getElementById('tl-export-btn').addEventListener('click', () => {
    exportTimeline(sorted, days, t);
  });
}

function exportTimeline(sorted, days, t) {
  const SX = s=>{if(s>=8)return'#6495ed';if(s>=6)return'#a8e63d';if(s>=3)return'#f0c040';return'#e74c3c';};
  const TX = s=>(s>=3&&s<8)?'#07090f':'#fff';

  const entries = getEntries();
  const eMap = {};
  entries.forEach(e => { eMap[e.agent+'|'+e.date] = e; });

  const WDAYS = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];

  function buildAgentPage(name, streak) {
    const agentPeriodEntries = days.map(d=>eMap[name+'|'+d]).filter(Boolean);
    const totDoc   = agentPeriodEntries.reduce((s,e)=>s+e.doc,0);
    const totCpd   = agentPeriodEntries.reduce((s,e)=>s+e.cpd,0);
    const totProsp = agentPeriodEntries.reduce((s,e)=>s+e.prosp,0);
    const missedDays = days.filter(d=>d<=t && !eMap[name+'|'+d]);

    // Calendar grid aligned to Sunday
    const padStart = new Date(days[0]+'T12:00:00').getDay();
    const cells = [];
    for (let i=0;i<padStart;i++) cells.push({type:'pad'});
    days.forEach(d=>{
      const e=eMap[name+'|'+d];
      if (!e) { cells.push({type:d>t?'future':'missing',d}); return; }
      const score=calcDailyScore(e);
      cells.push({type:'scored',d,score});
    });
    while(cells.length%7!==0) cells.push({type:'pad'});

    const numWeeks = cells.length/7;
    const rowH = Math.floor(650/numWeeks);

    const calRows = [];
    for(let r=0;r<numWeeks;r++){
      const rowCells=cells.slice(r*7,r*7+7).map(c=>{
        if(c.type==='pad') return `<td></td>`;
        const day=c.d.slice(8);
        if(c.type==='future') return `<td style="background:#0d1117;border-radius:14px">
          <div style="font-size:22px;font-weight:700;color:#1e2a38">${day}</div>
        </td>`;
        if(c.type==='missing') return `<td style="background:#1a0a0a;border-radius:14px;border:3px dashed rgba(231,76,60,.5)">
          <div style="font-size:22px;font-weight:800;color:#7a2020;margin-bottom:6px">${day}</div>
          <div style="font-size:40px;color:rgba(231,76,60,.5);font-weight:900;line-height:1">✕</div>
          <div style="font-size:11px;color:rgba(231,76,60,.6);margin-top:6px;font-weight:700;letter-spacing:1px">SEM ENVIO</div>
        </td>`;
        const bg=SX(c.score);
        const tc=TX(c.score);
        const lbl=c.score%1===0?c.score.toFixed(0):c.score.toFixed(1);
        return `<td style="background:${bg};border-radius:14px">
          <div style="font-size:20px;font-weight:800;color:${tc};opacity:.75;margin-bottom:4px">${day}</div>
          <div style="font-size:44px;font-weight:900;color:${tc};line-height:1">${lbl}</div>
        </td>`;
      }).join('');
      calRows.push(`<tr style="height:${rowH}px;text-align:center;vertical-align:middle">${rowCells}</tr>`);
    }

    const streakColor=streak>=14?'#6495ed':streak>=7?'#a8e63d':streak>=3?'#ff7a00':streak>=1?'#cd7f32':'#555';
    const rangeLabel=days[0]===days[days.length-1]?formatDate(days[0]):`${formatDate(days[0])} – ${formatDate(days[days.length-1])}`;

    const missedMsg = missedDays.length>0
      ? `<div style="background:#200d0d;border:2px solid rgba(231,76,60,.4);border-radius:14px;padding:16px 20px;display:flex;align-items:center;gap:14px">
          <span style="font-size:28px">📅</span>
          <span style="font-size:13px;color:#ff8080;line-height:1.6">
            Você teve <strong style="color:#ff4444">${missedDays.length} dia${missedDays.length>1?'s':''} sem lançamento</strong> neste período — os dias ${missedDays.map(d=>d.slice(8)+'/'+d.slice(5,7)).join(', ')}.
            Realize os lançamentos dos dias faltantes para que o seu relatório esteja completo.
          </span>
        </div>`
      : `<div style="background:#0a1f0a;border:2px solid rgba(46,204,113,.3);border-radius:14px;padding:16px 20px;display:flex;align-items:center;gap:14px">
          <span style="font-size:28px">✅</span>
          <span style="font-size:13px;color:#2ecc71;line-height:1.6">
            <strong>Relatório completo!</strong> Todos os dias do período foram lançados. Continue assim!
          </span>
        </div>`;

    return `
    <div style="background:#07090f;min-height:100vh;padding:28px 32px;display:flex;flex-direction:column;page-break-after:always">

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
        <div>
          <div style="font-size:9px;color:#a8e63d;letter-spacing:4px;font-weight:800;text-transform:uppercase;margin-bottom:6px">NICKEL CRM · SEQUÊNCIA DE ENVIOS</div>
          <div style="font-size:34px;font-weight:900;color:#fff;letter-spacing:-.5px;line-height:1">${name}</div>
          <div style="font-size:13px;color:#6b8299;margin-top:6px">${rangeLabel}</div>
        </div>
        <div style="text-align:right">
          ${streak>0?`<div style="background:#0e1218;border:1px solid #1e2a38;border-radius:14px;padding:12px 20px;text-align:center">
            <div style="font-size:28px;font-weight:900;color:${streakColor}">🔥 ${streak}d</div>
            <div style="font-size:9px;color:#6b8299;letter-spacing:2px;text-transform:uppercase;margin-top:4px">Sequência</div>
          </div>`:''}
        </div>
      </div>

      <!-- Stats -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
        <div style="background:#0e1218;border-radius:12px;padding:14px 18px;border:1px solid #1e2a38">
          <div style="font-size:36px;font-weight:900;color:#a8e63d;line-height:1">${totDoc}</div>
          <div style="font-size:9px;color:#6b8299;letter-spacing:2px;text-transform:uppercase;margin-top:6px">DOC captados</div>
        </div>
        <div style="background:#0e1218;border-radius:12px;padding:14px 18px;border:1px solid #1e2a38">
          <div style="font-size:36px;font-weight:900;color:#6495ed;line-height:1">${totCpd}</div>
          <div style="font-size:9px;color:#6b8299;letter-spacing:2px;text-transform:uppercase;margin-top:6px">Conversas (CQ)</div>
        </div>
        <div style="background:#0e1218;border-radius:12px;padding:14px 18px;border:1px solid #1e2a38">
          <div style="font-size:36px;font-weight:900;color:#f0c040;line-height:1">${totProsp}</div>
          <div style="font-size:9px;color:#6b8299;letter-spacing:2px;text-transform:uppercase;margin-top:6px">Prospecções</div>
        </div>
      </div>

      <!-- Calendar -->
      <table style="width:100%;border-collapse:separate;border-spacing:6px;flex:1;margin-bottom:16px">
        <thead><tr>${WDAYS.map(d=>`<th style="text-align:center;font-size:10px;color:#6b8299;letter-spacing:3px;font-weight:700;padding-bottom:10px;text-transform:uppercase">${d}</th>`).join('')}</tr></thead>
        <tbody>${calRows.join('')}</tbody>
      </table>

      <!-- Legenda -->
      <div style="display:flex;gap:20px;margin-bottom:14px;flex-wrap:wrap">
        ${[['#6495ed','Azul 8–10'],['#a8e63d','Verde 6–7.9'],['#f0c040','Amarelo 3–5.9'],['#e74c3c','Vermelho 0–2.9']].map(([c,l])=>`
        <div style="display:flex;align-items:center;gap:7px">
          <div style="width:14px;height:14px;border-radius:4px;background:${c};flex-shrink:0"></div>
          <span style="font-size:11px;color:#6b8299;font-weight:600">${l}</span>
        </div>`).join('')}
        <div style="display:flex;align-items:center;gap:7px">
          <div style="width:14px;height:14px;border-radius:4px;background:#1a0a0a;border:2px dashed rgba(231,76,60,.5);flex-shrink:0"></div>
          <span style="font-size:11px;color:#6b8299;font-weight:600">Sem lançamento</span>
        </div>
      </div>

      <!-- Mensagem -->
      ${missedMsg}

      <!-- Rodapé -->
      <div style="margin-top:14px;text-align:right;font-size:9px;color:#1e2a38;letter-spacing:1px;text-transform:uppercase">NICKEL CRM · Gerado em ${formatDate(t)}</div>
    </div>`;
  }

  const pages = sorted.map(({name,streak})=>buildAgentPage(name,streak)).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Nickel CRM — Sequência de Envios</title>
  <style>
    @page{size:A4 portrait;margin:0}
    *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    html,body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;background:#030508!important;color:#f0f4f8}
    @media print{.print-btn{display:none!important}}
  </style>
  </head><body>
  <div class="print-btn" style="text-align:center;padding:20px;background:#030508">
    <button onclick="window.print()" style="background:#a8e63d;color:#07090f;border:none;padding:13px 32px;border-radius:10px;cursor:pointer;font-size:15px;font-weight:800;letter-spacing:.5px">🖨&nbsp;&nbsp;Imprimir / Salvar PDF</button>
  </div>
  ${pages}
  </body></html>`;

  const w = window.open('','_blank');
  if (!w) { alert('Ative os pop-ups no navegador para exportar.'); return; }
  w.document.write(html);
  w.document.close();
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
    const memberUid = TEAM.find(a=>a.name===name)?.username;
    const e=entries.find(x=>x.date===dateStr&&(x.agent===name || normalizeAgentName(x.agent)===name || (memberUid && x.uid===memberUid))), has=!!e;
    const dash='<span class="day-empty">—</span>';
    return `<tr>
      <td class="day-agent-name">${name}</td>
      <td class="num-cell day-num">${has ? e.prosp : dash}</td>
      <td class="num-cell day-num">${has ? e.cpd   : dash}</td>
      <td class="num-cell day-num doc-cell">${has ? e.doc : dash}</td>
      <td class="num-cell day-num" style="color:#ef4444">${has ? (e.va||0) : dash}</td>
      <td class="num-cell day-num" style="color:#f97316">${has ? (e.vaDetails||[]).filter(d=>d.realizada).length : dash}</td>
      <td>${has ? `<button class="del-day-btn" data-date="${dateStr}" data-agent="${name}" data-uid="${e.uid||''}">Remover</button>` : ''}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML=`
    <table class="data-table rank-table" style="table-layout:auto">
      <thead><tr>
        <th>Angariador</th>
        <th class="num-cell">PROSP</th>
        <th class="num-cell">CQ</th>
        <th class="num-cell doc-th">DOC</th>
        <th class="num-cell" style="color:#ef4444">VA</th>
        <th class="num-cell" style="color:#f97316">VR</th>
        <th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  wrap.querySelectorAll('.del-day-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { date, agent, uid } = btn.dataset;
      if (!confirm(`Remover lançamento de ${agent} em ${formatDate(date)}?\nO angariador poderá relançar.`)) return;
      btn.disabled = true; btn.textContent = '...';
      const snapshot = getEntries();
      const entryToDelete = uid
        ? snapshot.find(e => e.date===date && (e.uid===uid || e.agent===agent))
        : snapshot.find(e => e.date===date && e.agent===agent);
      saveEntries(snapshot.filter(e => !(e.date===date && e.agent===agent)));
      try {
        await fbDeleteEntry(entryToDelete || {date, agent});
        resetEditCount(uid||agent, date);
      } catch(e) {
        saveEntries(snapshot);
        alert('❌ Erro ao remover lançamento. Verifique sua conexão.');
        btn.disabled = false; btn.textContent = '🗑';
        return;
      }
      renderDayView(date);
    });
  });
}

// ── CPD LIST (gestor) ────────────────────────────────────
function renderCpdList(entries) {
  const wrap = document.getElementById('cpd-list-wrap');
  if (!wrap) return;

  const agentNames = getAgentNames();
  const filterHTML = `<div style="margin-bottom:12px">
    <select id="cpd-agent-filter" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;padding:8px 12px;outline:none;width:100%">
      <option value="">Todos os angariadores</option>
      ${agentNames.map(n=>`<option value="${n}" ${activeCpdAgent===n?'selected':''}>${n}</option>`).join('')}
    </select>
  </div>`;

  const allRows = [];
  entries.forEach(e => (e.cpdDetails||[]).forEach((d,i) => allRows.push({date:e.date, agent:e.agent, idx:i, ...d})));
  allRows.sort((a,b) => b.date.localeCompare(a.date));

  const rows = activeCpdAgent ? allRows.filter(r => r.agent === activeCpdAgent) : allRows;

  if (allRows.length === 0) {
    wrap.innerHTML = filterHTML + '<div class="empty-state">Nenhum CQ com detalhes no período</div>';
    wrap.querySelector('#cpd-agent-filter').addEventListener('change', function(){ activeCpdAgent=this.value; renderCpdList(entries); });
    return;
  }

  const rowsHTML = rows.map(d => {
    const selOpts = CPD_STATUS_OPTIONS.map(o=>`<option value="${o.value}" ${d.status===o.value?'selected':''}>${o.label}</option>`).join('');
    const isDescarte = d.status === 'descarte';
    return `<tr data-cpd-date="${d.date}" data-cpd-agent="${d.agent}" data-cpd-idx="${d.idx}">
      <td>${formatDate(d.date)}</td>
      <td>${d.agent}</td>
      <td style="font-weight:500">${d.nome||'—'}</td>
      <td><input class="cpd-tel-inline" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}" type="tel" value="${d.telefone ? formatPhone(d.telefone) : ''}" placeholder="—" style="background:none;border:none;border-bottom:1px dashed var(--border);color:var(--text-muted);font-family:'DM Sans',sans-serif;font-size:12px;width:110px;padding:2px 4px;outline:none;cursor:pointer" readonly></td>
      <td><select class="cpd-status-sel nota-select">${selOpts}</select></td>
      <td><input class="cpd-motivo-inp" type="text" placeholder="Motivo" value="${(d.motivo||'').replace(/"/g,'&quot;')}" style="display:${isDescarte?'block':'none'};background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:12px;padding:5px 8px;width:100%;outline:none"></td>
      <td><button class="cpd-edit-btn" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px 6px">✏️</button></td>
    </tr>
    <tr class="cpd-edit-row" data-edit-date="${d.date}" data-edit-agent="${d.agent}" data-edit-idx="${d.idx}" style="display:none">
      <td colspan="7" style="padding:8px 4px">
        <div style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:8px;align-items:end">
          <div class="form-group" style="margin:0"><label style="font-size:11px">Nome</label><input class="cpd-ef-nome" type="text" value="${(d.nome||'').replace(/"/g,'&quot;')}" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;padding:7px 10px;width:100%;outline:none"></div>
          <div class="form-group" style="margin:0"><label style="font-size:11px">Telefone</label><input class="cpd-ef-tel" type="text" value="${(d.telefone ? formatPhone(d.telefone) : '').replace(/"/g,'&quot;')}" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;padding:7px 10px;width:100%;outline:none"></div>
          <button class="cpd-ef-save btn" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}" style="padding:8px 14px;font-size:13px;white-space:nowrap">Salvar</button>
          <button class="cpd-ef-cancel" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}" style="background:none;border:1px solid var(--border);color:var(--text-muted);border-radius:8px;padding:8px 12px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;white-space:nowrap">Cancelar</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = filterHTML + `<div class="doc-table-wrap"><table class="data-table doc-table" style="font-size:12px">
    <thead><tr><th>Data</th><th>Angariador</th><th>Nome</th><th>Telefone</th><th>Status</th><th>Motivo</th><th></th></tr></thead>
    <tbody>${rowsHTML || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:16px">Nenhum CQ para este angariador</td></tr>'}</tbody>
  </table></div>`;

  wrap.querySelector('#cpd-agent-filter').addEventListener('change', function(){ activeCpdAgent=this.value; renderCpdList(entries); });

  wrap.querySelectorAll('.cpd-status-sel').forEach(sel => {
    sel.addEventListener('change', async () => {
      const tr = sel.closest('tr');
      const { cpdDate:date, cpdAgent:agent, cpdIdx:idx } = tr.dataset;
      const motivoInp = tr.querySelector('.cpd-motivo-inp');
      const isDescarte = sel.value === 'descarte';
      motivoInp.style.display = isDescarte ? 'block' : 'none';
      if (!isDescarte) motivoInp.value = '';
      await updateCpdDetail(date, agent, parseInt(idx), { status: sel.value, motivo: isDescarte ? motivoInp.value : '' });
    });
  });

  wrap.querySelectorAll('.cpd-motivo-inp').forEach(inp => {
    inp.addEventListener('change', async () => {
      const tr = inp.closest('tr');
      const { cpdDate:date, cpdAgent:agent, cpdIdx:idx } = tr.dataset;
      await updateCpdDetail(date, agent, parseInt(idx), { motivo: inp.value });
    });
  });

  wrap.querySelectorAll('.cpd-tel-inline').forEach(inp => {
    applyPhoneMask(inp);
    inp.addEventListener('click', () => { inp.readOnly = false; inp.style.cursor='text'; inp.style.borderBottom='1px solid var(--primary)'; inp.style.color='var(--text)'; inp.select(); });
    inp.addEventListener('blur', async () => {
      inp.readOnly = true; inp.style.cursor='pointer'; inp.style.borderBottom='1px dashed var(--border)'; inp.style.color='var(--text-muted)';
      const raw = inp.value.trim();
      await updateCpdDetail(inp.dataset.date, inp.dataset.agent, parseInt(inp.dataset.idx), { telefone: raw });
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });

  wrap.querySelectorAll('.cpd-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const editRow = wrap.querySelector(`.cpd-edit-row[data-edit-date="${btn.dataset.date}"][data-edit-agent="${btn.dataset.agent}"][data-edit-idx="${btn.dataset.idx}"]`);
      const isOpen = editRow.style.display !== 'none';
      wrap.querySelectorAll('.cpd-edit-row').forEach(r => r.style.display = 'none');
      if (!isOpen) { editRow.style.display = ''; const telEl = editRow.querySelector('.cpd-ef-tel'); if (telEl) applyPhoneMask(telEl); }
    });
  });

  wrap.querySelectorAll('.cpd-ef-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const editRow = wrap.querySelector(`.cpd-edit-row[data-edit-date="${btn.dataset.date}"][data-edit-agent="${btn.dataset.agent}"][data-edit-idx="${btn.dataset.idx}"]`);
      const nome = editRow.querySelector('.cpd-ef-nome').value.trim();
      const telefone = editRow.querySelector('.cpd-ef-tel').value.trim();
      btn.textContent = 'Salvando...'; btn.disabled = true;
      await updateCpdDetail(btn.dataset.date, btn.dataset.agent, parseInt(btn.dataset.idx), { nome, telefone });
      const freshRef = activePeriod==='month' ? activeMonthRef : activePeriod==='week' ? activeWeekRef : undefined;
      renderCpdList(filterEntries(activePeriod, freshRef));
    });
  });

  wrap.querySelectorAll('.cpd-ef-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      wrap.querySelector(`.cpd-edit-row[data-edit-date="${btn.dataset.date}"][data-edit-agent="${btn.dataset.agent}"][data-edit-idx="${btn.dataset.idx}"]`).style.display = 'none';
    });
  });
}

// ── VIDEO VALIDATION (gestor) ────────────────────────────
let vidValPeriod = today().slice(0, 7); // "YYYY-MM"

function renderVideoValidation(entries) {
  const wrap = document.getElementById('video-validation-wrap');
  if (!wrap) return;

  // Período visível: respeita filtro ativo do gestor
  const periodRef = activePeriod === 'month' ? (activeMonthRef || today()) : today();
  vidValPeriod = periodRef.slice(0, 7);
  const period = vidValPeriod;

  // Agrupa por agente
  const agentMap = {};
  entries.forEach(e => {
    if ((e.video || 0) === 0) return;
    if (!agentMap[e.agent]) agentMap[e.agent] = 0;
    agentMap[e.agent] += e.video || 0;
  });

  const agents = Object.keys(agentMap).sort();

  if (!agents.length) {
    wrap.innerHTML = '<div class="empty-state">Nenhum vídeo lançado no período</div>';
    return;
  }

  // Mês por extenso
  const [yr, mo] = period.split('-');
  const monthLabel = new Date(`${yr}-${mo}-15`).toLocaleDateString('pt-BR', {month:'long', year:'numeric'});

  const rows = agents.map(agent => {
    const submitted   = agentMap[agent];
    const authRecs    = videoAuthData[videoAuthKey(agent, period)] || [];
    const authorized  = authRecs.reduce((s, r) => s + r.count, 0);
    const remaining   = submitted - authorized;

    const histHTML = authRecs.length
      ? authRecs.map((r, i) => {
          const d = new Date(r.ts);
          const label = d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) + ' ' +
                        d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
          const runSum = authRecs.slice(0, i + 1).reduce((s, x) => s + x.count, 0);
          return `<div class="va-hist-item">
            <span class="va-hist-time">${label}</span>
            <span class="va-hist-cnt">+${r.count}</span>
            <span class="va-hist-sum">= ${runSum} total</span>
          </div>`;
        }).join('')
      : `<div class="va-hist-empty">Nenhuma autorização ainda</div>`;

    return `<div class="va-agent-card" data-agent="${agent}">
      <div class="va-agent-header" data-toggle="${agent}">
        <div class="va-agent-name">${agent}</div>
        <div class="va-agent-nums">
          <div class="va-num-block">
            <span class="va-num">${submitted}</span>
            <span class="va-num-lbl">enviado</span>
          </div>
          <div class="va-num-divider"></div>
          <div class="va-num-block">
            <span class="va-num authorized">${authorized}</span>
            <span class="va-num-lbl">autorizado</span>
          </div>
          ${remaining > 0 ? `<span class="va-pending-chip">+${remaining} pendente${remaining>1?'s':''}</span>` : `<span class="va-ok-chip">✓</span>`}
        </div>
        <span class="va-chevron" id="chv-${agent}">▾</span>
      </div>
      <div class="va-agent-body" id="vab-${agent}" style="display:none">
        <div class="va-hist-wrap">${histHTML}</div>
        <div class="va-auth-form">
          <span class="va-auth-label">Autorizar</span>
          <div class="vid-stepper">
            <button class="vid-step-btn va-minus" data-agent="${agent}">−</button>
            <span class="vid-step-val va-inp-val" data-agent="${agent}">1</span>
            <button class="vid-step-btn va-plus"  data-agent="${agent}">+</button>
          </div>
          <button class="va-confirm-btn" data-agent="${agent}" data-period="${period}">Confirmar</button>
        </div>
      </div>
    </div>`;
  }).join('');

  const pendingCount = agents.filter(a => {
    const sub = agentMap[a];
    const auth = (videoAuthData[videoAuthKey(a, period)] || []).reduce((s,r)=>s+r.count,0);
    return auth < sub;
  }).length;

  wrap.innerHTML = `
    <div class="va-period-label">${monthLabel}</div>
    <div class="va-summary-chip ${pendingCount > 0 ? 'pending' : 'ok'}">
      ${pendingCount > 0 ? `⏳ ${pendingCount} corretor${pendingCount>1?'es':''} com vídeos pendentes` : '✅ Todos os vídeos validados'}
    </div>
    <div class="va-agent-list">${rows}</div>`;

  // Expand/collapse
  wrap.querySelectorAll('[data-toggle]').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const agent = hdr.dataset.toggle;
      const body  = document.getElementById(`vab-${agent}`);
      const chv   = document.getElementById(`chv-${agent}`);
      const open  = body.style.display === 'none';
      body.style.display = open ? '' : 'none';
      chv.textContent = open ? '▴' : '▾';
    });
  });

  // Stepper
  const tempVals = {};
  agents.forEach(a => { tempVals[a] = 1; });

  wrap.querySelectorAll('.va-minus').forEach(btn => {
    btn.addEventListener('click', () => {
      tempVals[btn.dataset.agent] = Math.max(1, (tempVals[btn.dataset.agent] || 1) - 1);
      wrap.querySelector(`.va-inp-val[data-agent="${btn.dataset.agent}"]`).textContent = tempVals[btn.dataset.agent];
    });
  });
  wrap.querySelectorAll('.va-plus').forEach(btn => {
    btn.addEventListener('click', () => {
      tempVals[btn.dataset.agent] = (tempVals[btn.dataset.agent] || 1) + 1;
      wrap.querySelector(`.va-inp-val[data-agent="${btn.dataset.agent}"]`).textContent = tempVals[btn.dataset.agent];
    });
  });

  wrap.querySelectorAll('.va-confirm-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const agent  = btn.dataset.agent;
      const period = btn.dataset.period;
      const count  = tempVals[agent] || 1;
      btn.disabled = true; btn.textContent = '...';
      await addVideoAuthorization(agent, period, count);
      renderVideoValidation(entries);
    });
  });
}

// ── VISIT LIST — VA/VR (gestor) ──────────────────────────
function renderVisitList(entries) {
  const wrap = document.getElementById('visit-list-wrap');
  if (!wrap) return;

  const agentNames = getAgentNames();
  const tabBtnStyle = (key) => {
    const active = activeVisitStatus === key;
    const colors = { todas:'var(--text-muted)', agendadas:'#ef4444', realizadas:'#a8e63d', nao:'#888' };
    return `background:${active ? colors[key] : 'none'};border:1px solid ${colors[key]};color:${active ? (key==='realizadas'?'#000':'#fff') : colors[key]};border-radius:20px;padding:5px 14px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;white-space:nowrap`;
  };
  const filterHTML = `
    <div style="margin-bottom:10px">
      <select id="visit-agent-filter" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;padding:8px 12px;outline:none;width:100%">
        <option value="">Todos os angariadores</option>
        ${agentNames.map(n=>`<option value="${n}" ${activeVisitAgent===n?'selected':''}>${n}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <button class="visit-status-tab" data-status="todas"      style="${tabBtnStyle('todas')}">Todas</button>
      <button class="visit-status-tab" data-status="agendadas"  style="${tabBtnStyle('agendadas')}">⏳ Agendadas</button>
      <button class="visit-status-tab" data-status="realizadas" style="${tabBtnStyle('realizadas')}">✅ Realizadas</button>
      <button class="visit-status-tab" data-status="nao"        style="${tabBtnStyle('nao')}">❌ Não realizadas</button>
    </div>`;

  const allRows = [];
  entries.forEach(e => {
    (e.vaDetails||[]).forEach((d,i) => {
      if (d.nome || d.imovel) allRows.push({date:e.date, agent:e.agent, idx:i, ...d});
    });
  });
  allRows.sort((a,b) => b.date.localeCompare(a.date));

  const byAgent = activeVisitAgent ? allRows.filter(r => r.agent === activeVisitAgent) : allRows;
  const rows = byAgent.filter(d => {
    if (activeVisitStatus === 'agendadas')  return d.realizada !== true && !(d.realizada === false && d.dataRealizacao === 'nao');
    if (activeVisitStatus === 'realizadas') return d.realizada === true;
    if (activeVisitStatus === 'nao')        return d.realizada === false && d.dataRealizacao === 'nao';
    return true;
  });

  if (allRows.length === 0) {
    wrap.innerHTML = filterHTML + '<div class="empty-state">Nenhuma visita registrada no período</div>';
    wrap.querySelector('#visit-agent-filter').addEventListener('change', function(){ activeVisitAgent=this.value; renderVisitList(entries); });
    wrap.querySelectorAll('.visit-status-tab').forEach(btn => { btn.addEventListener('click', () => { activeVisitStatus=btn.dataset.status; renderVisitList(entries); }); });
    return;
  }

  const inpStyle = `background:none;border:none;border-bottom:1px dashed var(--border);color:var(--text-muted);font-family:'DM Sans',sans-serif;font-size:12px;padding:2px 4px;outline:none;cursor:pointer;width:100%`;
  const rowsHTML = rows.map(d => {
    const isRealizada = d.realizada === true;
    const isNaoRealizada = d.realizada === false && d.dataRealizacao === 'nao';
    const btnStyle = `font-size:11px;padding:3px 10px;border-radius:6px;cursor:pointer;font-family:'DM Sans',sans-serif;white-space:nowrap`;
    const statusCell = isRealizada
      ? `<div style="display:flex;flex-direction:column;gap:4px">
           <span style="color:#a8e63d;font-weight:600;font-size:11px">✅ Realizada ${d.dataRealizacao && d.dataRealizacao!=='nao' ? formatDate(d.dataRealizacao) : ''}${d.horarioRealizacao ? ' às ' + d.horarioRealizacao : ''}</span>
           <button class="vi-unrealize-btn" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}" style="${btnStyle};background:none;border:1px solid var(--border);color:var(--text-muted)">↩ Desfazer</button>
         </div>`
      : isNaoRealizada
        ? `<div style="display:flex;flex-direction:column;gap:4px">
             <span style="color:#888;font-weight:600;font-size:11px">❌ Não realizada</span>
             <button class="vi-unrealize-btn" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}" style="${btnStyle};background:none;border:1px solid var(--border);color:var(--text-muted)">↩ Desfazer</button>
           </div>`
        : `<div style="display:flex;flex-direction:column;gap:4px">
             <span style="color:#ef4444;font-weight:600;font-size:11px">⏳ Agendada</span>
             <div style="display:flex;gap:4px;flex-wrap:wrap">
               <button class="vi-realize-btn" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}" style="${btnStyle};background:none;border:1px solid #a8e63d;color:#a8e63d">✅ Realizada</button>
               <button class="vi-naorealize-btn" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}" style="${btnStyle};background:none;border:1px solid var(--border);color:var(--text-muted)">❌ Não realizada</button>
             </div>
           </div>`;
    return `<tr>
      <td>${formatDate(d.date)}</td>
      <td>${d.agent}</td>
      <td style="font-weight:500"><input class="vi-nome" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}" type="text" value="${(d.nome||'').replace(/"/g,'&quot;')}" placeholder="—" style="${inpStyle};font-weight:500;color:var(--text)" readonly></td>
      <td><input class="vi-imovel" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}" type="text" value="${(d.imovel||'').replace(/"/g,'&quot;')}" placeholder="—" style="${inpStyle}" readonly></td>
      <td><button class="vi-dataagend" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}" data-val="${d.dataAgend||''}" style="background:none;border:none;border-bottom:1px dashed var(--border);color:${d.dataAgend?'var(--text-muted)':'var(--border)'};font-family:'DM Sans',sans-serif;font-size:12px;padding:2px 6px;cursor:pointer;min-width:80px;text-align:center">${d.dataAgend ? formatDate(d.dataAgend) : 'dd/mm/aaaa'}</button></td>
      <td><button class="vi-horario" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}" style="background:none;border:none;border-bottom:1px dashed var(--border);color:${d.horario?'var(--text-muted)':'var(--border)'};font-family:'DM Sans',sans-serif;font-size:12px;padding:2px 6px;cursor:pointer;min-width:52px;text-align:center">${d.horario||'—:——'}</button></td>
      <td>${statusCell}</td>
      <td><button class="vi-del-btn" data-date="${d.date}" data-agent="${d.agent}" data-idx="${d.idx}" title="Excluir agendamento" style="background:none;border:none;color:#444;font-size:16px;cursor:pointer;padding:4px 8px;border-radius:6px;line-height:1" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#444'">✕</button></td>
    </tr>`;
  }).join('');

  wrap.innerHTML = filterHTML + `<div style="overflow-x:auto"><table class="data-table" style="font-size:12px">
    <thead><tr><th>Lançamento</th><th>Angariador</th><th>Cliente</th><th>Imóvel</th><th>Data Visita</th><th>Horário</th><th>Status</th><th></th></tr></thead>
    <tbody>${rowsHTML || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:16px">Nenhuma visita para este angariador</td></tr>'}</tbody>
  </table></div>`;

  wrap.querySelector('#visit-agent-filter').addEventListener('change', function(){ activeVisitAgent=this.value; renderVisitList(entries); });
  wrap.querySelectorAll('.visit-status-tab').forEach(btn => {
    btn.addEventListener('click', () => { activeVisitStatus = btn.dataset.status; renderVisitList(entries); });
  });

  function makeViEditable(sel, field, mask) {
    wrap.querySelectorAll(sel).forEach(inp => {
      if (mask) applyPhoneMask(inp);
      inp.addEventListener('click', () => { inp.readOnly=false; inp.style.cursor='text'; inp.style.borderBottom='1px solid var(--primary)'; inp.style.color='var(--text)'; inp.select && inp.select(); });
      inp.addEventListener('blur', async () => {
        inp.readOnly=true; inp.style.cursor='pointer'; inp.style.borderBottom='1px dashed var(--border)'; inp.style.color= sel==='.vi-nome' ? 'var(--text)' : 'var(--text-muted)';
        await updateVaDetail(inp.dataset.date, inp.dataset.agent, parseInt(inp.dataset.idx), { [field]: inp.value.trim() });
      });
      inp.addEventListener('keydown', e => { if (e.key==='Enter') inp.blur(); });
    });
  }
  makeViEditable('.vi-nome',   'nome',   false);
  makeViEditable('.vi-imovel', 'imovel', false);

  // Data Visita — abre mini-modal com selects dia/mês/ano
  wrap.querySelectorAll('.vi-dataagend').forEach(btn => {
    btn.addEventListener('click', () => {
      const [curY='', curM='', curD=''] = (btn.dataset.val||'').split('-');
      const pop = document.createElement('div');
      pop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center';
      const selStyle = `flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:15px;padding:10px 6px;outline:none`;
      const days   = Array.from({length:31},(_,i)=>`<option value="${String(i+1).padStart(2,'0')}" ${String(i+1).padStart(2,'0')===curD?'selected':''}>${String(i+1).padStart(2,'0')}</option>`).join('');
      const months = ['01 Jan','02 Fev','03 Mar','04 Abr','05 Mai','06 Jun','07 Jul','08 Ago','09 Set','10 Out','11 Nov','12 Dez'].map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}" ${String(i+1).padStart(2,'0')===curM?'selected':''}>${m}</option>`).join('');
      const cy = new Date().getFullYear();
      const years = [cy,cy+1].map(y=>`<option value="${y}" ${String(y)===curY?'selected':''}>${y}</option>`).join('');
      pop.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:24px;width:320px;display:flex;flex-direction:column;gap:16px">
        <div style="font-weight:700;font-size:15px">Data da visita</div>
        <div style="display:flex;gap:8px">
          <select id="vi-d-day" style="${selStyle}"><option value="">Dia</option>${days}</select>
          <select id="vi-d-month" style="${selStyle}"><option value="">Mês</option>${months}</select>
          <select id="vi-d-year" style="${selStyle}"><option value="">Ano</option>${years}</select>
        </div>
        <div style="display:flex;gap:8px">
          <button id="vi-d-confirm" style="flex:1;background:var(--primary);color:#fff;border:none;border-radius:8px;padding:10px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:700">Salvar</button>
          <button id="vi-d-cancel" style="flex:1;background:none;border:1px solid var(--border);border-radius:8px;padding:10px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:14px;color:var(--text-muted)">Cancelar</button>
        </div>
      </div>`;
      document.body.appendChild(pop);
      pop.querySelector('#vi-d-cancel').onclick = () => pop.remove();
      pop.querySelector('#vi-d-confirm').onclick = async () => {
        const d = pop.querySelector('#vi-d-day').value;
        const m = pop.querySelector('#vi-d-month').value;
        const y = pop.querySelector('#vi-d-year').value;
        const val = y && m && d ? `${y}-${m}-${d}` : '';
        pop.remove();
        btn.dataset.val = val;
        btn.textContent = val ? formatDate(val) : 'dd/mm/aaaa';
        btn.style.color = val ? 'var(--text-muted)' : 'var(--border)';
        await updateVaDetail(btn.dataset.date, btn.dataset.agent, parseInt(btn.dataset.idx), { dataAgend: val });
      };
    });
  });

  // Horário — abre mini-modal com selects
  wrap.querySelectorAll('.vi-horario').forEach(inp => {
    inp.addEventListener('click', () => {
      const [curH='', curM=''] = (inp.textContent.includes(':') ? inp.textContent : '').split(':');
      const pop = document.createElement('div');
      pop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center';
      const selStyle = `flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:16px;padding:10px 8px;outline:none`;
      pop.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:24px;width:280px;display:flex;flex-direction:column;gap:16px">
        <div style="font-weight:700;font-size:15px">Horário da visita</div>
        <div style="display:flex;gap:10px">
          <select id="vi-h-hour" style="${selStyle}">
            <option value="">Hora</option>${Array.from({length:24},(_,h)=>`<option value="${String(h).padStart(2,'0')}" ${String(h).padStart(2,'0')===curH?'selected':''}>${String(h).padStart(2,'0')}h</option>`).join('')}
          </select>
          <select id="vi-h-min" style="${selStyle}">
            <option value="">Min</option>${['00','05','10','15','20','25','30','35','40','45','50','55'].map(m=>`<option value="${m}" ${m===curM?'selected':''}>${m}min</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;gap:8px">
          <button id="vi-h-confirm" style="flex:1;background:var(--primary);color:#fff;border:none;border-radius:8px;padding:10px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:700">Salvar</button>
          <button id="vi-h-cancel" style="flex:1;background:none;border:1px solid var(--border);border-radius:8px;padding:10px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:14px;color:var(--text-muted)">Cancelar</button>
        </div>
      </div>`;
      document.body.appendChild(pop);
      pop.querySelector('#vi-h-cancel').onclick = () => pop.remove();
      pop.querySelector('#vi-h-confirm').onclick = async () => {
        const h = pop.querySelector('#vi-h-hour').value;
        const m = pop.querySelector('#vi-h-min').value;
        const val = h && m ? `${h}:${m}` : '';
        pop.remove();
        inp.textContent = val || '—:——';
        inp.style.color = val ? 'var(--text-muted)' : 'var(--border)';
        await updateVaDetail(inp.dataset.date, inp.dataset.agent, parseInt(inp.dataset.idx), { horario: val });
      };
    });
  });

  wrap.querySelectorAll('.vi-realize-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center';
      overlay.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:24px;width:300px;display:flex;flex-direction:column;gap:14px">
        <div style="font-weight:700;font-size:15px">Marcar como realizada</div>
        <div><label style="font-size:11px;color:var(--text-muted)">Data de realização</label><input id="vi-real-date" type="date" value="${today()}" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:14px;padding:8px 10px;margin-top:4px;outline:none"></div>
        <div><label style="font-size:11px;color:var(--text-muted)">Horário de realização</label><div style="display:flex;gap:8px;margin-top:4px">
          <select id="vi-real-hour" style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:14px;padding:8px 10px;outline:none">
            <option value="">Hora</option>${Array.from({length:24},(_,h)=>`<option value="${String(h).padStart(2,'0')}">${String(h).padStart(2,'0')}h</option>`).join('')}
          </select>
          <select id="vi-real-min" style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:14px;padding:8px 10px;outline:none">
            <option value="">Min</option>${['00','05','10','15','20','25','30','35','40','45','50','55'].map(m=>`<option value="${m}">${m}min</option>`).join('')}
          </select>
        </div></div>
        <div style="display:flex;gap:8px">
          <button id="vi-real-confirm" class="btn" style="flex:1;padding:10px">Confirmar</button>
          <button id="vi-real-cancel" style="flex:1;padding:10px;background:none;border:1px solid var(--border);border-radius:8px;color:var(--text-muted);font-family:'DM Sans',sans-serif;font-size:14px;cursor:pointer">Cancelar</button>
        </div>
      </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#vi-real-cancel').onclick = () => overlay.remove();
      overlay.querySelector('#vi-real-confirm').onclick = async () => {
        const dataRealizacao = overlay.querySelector('#vi-real-date').value || today();
        const h = overlay.querySelector('#vi-real-hour').value;
        const m = overlay.querySelector('#vi-real-min').value;
        const horarioRealizacao = h && m ? `${h}:${m}` : '';
        overlay.remove();
        await updateVaRealized(btn.dataset.date, btn.dataset.agent, parseInt(btn.dataset.idx), dataRealizacao, horarioRealizacao);
        renderVisitList(filterEntries(activePeriod, activePeriod==='month' ? activeMonthRef : activePeriod==='week' ? activeWeekRef : undefined));
      };
    });
  });

  wrap.querySelectorAll('.vi-naorealize-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '...';
      await updateVaRealized(btn.dataset.date, btn.dataset.agent, parseInt(btn.dataset.idx), 'nao');
      renderVisitList(filterEntries(activePeriod, activePeriod==='month' ? activeMonthRef : activePeriod==='week' ? activeWeekRef : undefined));
    });
  });

  wrap.querySelectorAll('.vi-unrealize-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '...';
      const entries = getEntries();
      const entry = entries.find(e => e.date === btn.dataset.date && e.agent === btn.dataset.agent);
      if (entry?.vaDetails?.[parseInt(btn.dataset.idx)]) {
        const d = entry.vaDetails[parseInt(btn.dataset.idx)];
        d.realizada = null; d.dataRealizacao = ''; d.horarioRealizacao = '';
        localUpsert(entry);
        try { await fbUpsertEntry(entry); } catch(e) { alert('❌ Erro ao desfazer visita. Verifique sua conexão.'); btn.disabled=false; btn.textContent='Desfazer'; return; }
      }
      renderVisitList(filterEntries(activePeriod, activePeriod==='month' ? activeMonthRef : activePeriod==='week' ? activeWeekRef : undefined));
    });
  });

  wrap.querySelectorAll('.vi-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const entries = getEntries();
      const entry = entries.find(e => e.date === btn.dataset.date && e.agent === btn.dataset.agent);
      if (!entry?.vaDetails) return;
      const removed = entry.vaDetails.splice(parseInt(btn.dataset.idx), 1);
      entry.va = entry.vaDetails.length;
      localUpsert(entry);
      try { await fbUpsertEntry(entry); } catch(e) {
        entry.vaDetails.splice(parseInt(btn.dataset.idx), 0, removed[0]);
        entry.va = entry.vaDetails.length;
        localUpsert(entry);
        alert('❌ Erro ao excluir visita. Verifique sua conexão.'); return;
      }
      renderVisitList(filterEntries(activePeriod, activePeriod==='month' ? activeMonthRef : activePeriod==='week' ? activeWeekRef : undefined));
    });
  });
}

// ── OFERTA ATIVA SEMANAL ─────────────────────────────────
let ofertas = [];

async function initOfertaAtiva() {
  try { ofertas = await fbGetOfertas(); } catch(e) { ofertas = []; }
  renderOfertaAtiva();
}

function renderOfertaAtiva() {
  const wrap = document.getElementById('oferta-wrap');
  if (!wrap) return;

  const sorted = [...ofertas].sort((a,b) => b.data.localeCompare(a.data));

  const formHTML = `
    <form id="oferta-form" class="oferta-form">
      <div class="oferta-form-grid">
        <div class="form-group" style="margin:0">
          <label>Data de início</label>
          <input type="date" id="of-data" required max="${today()}">
        </div>
        <div class="form-group" style="margin:0">
          <label>Duração</label>
          <input type="text" id="of-duracao" placeholder="Ex: 1 semana" required>
        </div>
        <div class="form-group" style="margin:0">
          <label>Prospecções</label>
          <input type="number" id="of-prosp" min="0" value="0">
        </div>
        <div class="form-group" style="margin:0">
          <label>Conv. Qualificadas (CQ)</label>
          <input type="number" id="of-cq" min="0" value="0">
        </div>
        <div class="form-group" style="margin:0">
          <label>Status</label>
          <select id="of-status">
            <option value="">— Pendente —</option>
            <option value="cumprida">✅ Cumprida</option>
            <option value="nao_cumprida">❌ Não cumprida</option>
          </select>
        </div>
      </div>
      <button type="submit" class="btn" style="margin-top:12px">Registrar oferta</button>
    </form>`;

  const histHTML = sorted.length === 0 ? '<div class="empty-state" style="margin-top:16px">Nenhuma oferta registrada ainda</div>' : `
    <div style="margin-top:20px">
      <div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Histórico</div>
      <div class="oferta-list">
        ${sorted.map(o => {
          const statusLabel = o.status === 'cumprida' ? '✅ Cumprida' : o.status === 'nao_cumprida' ? '❌ Não cumprida' : '⏳ Pendente';
          const statusColor = o.status === 'cumprida' ? '#2ecc71' : o.status === 'nao_cumprida' ? '#e74c3c' : '#f0c040';
          return `<div class="oferta-item">
            <div class="oferta-item-top">
              <span class="oferta-date">${formatDate(o.data)}</span>
              <span class="oferta-duracao">${o.duracao}</span>
              <span class="oferta-status" style="color:${statusColor}">${statusLabel}</span>
              <button class="del-oferta-btn" data-id="${o.id}" style="margin-left:auto;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px">✕</button>
            </div>
            <div class="oferta-item-nums">
              <span>PROSP <strong>${o.prospeccoes}</strong></span>
              <span>CQ <strong>${o.cq}</strong></span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;

  wrap.innerHTML = formHTML + histHTML;

  document.getElementById('oferta-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const btn = ev.target.querySelector('[type="submit"]');
    btn.disabled = true; btn.textContent = 'Salvando...';
    const oferta = {
      id: 'oferta_' + Date.now(),
      data: document.getElementById('of-data').value,
      duracao: document.getElementById('of-duracao').value.trim(),
      prospeccoes: parseInt(document.getElementById('of-prosp').value) || 0,
      cq: parseInt(document.getElementById('of-cq').value) || 0,
      status: document.getElementById('of-status').value,
    };
    try {
      await fbSaveOferta(oferta);
      ofertas.push(oferta);
      renderOfertaAtiva();
    } catch(e) {
      btn.disabled = false; btn.textContent = 'Registrar oferta';
      alert('Erro ao salvar. Tente novamente.');
    }
  });

  wrap.querySelectorAll('.del-oferta-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remover esta oferta?')) return;
      await fbDeleteOferta(btn.dataset.id);
      ofertas = ofertas.filter(o => o.id !== btn.dataset.id);
      renderOfertaAtiva();
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
  const t = today();
  const ref = period==='month' ? activeMonthRef : period==='week' ? activeWeekRef : t;
  const team = getAgentNames();
  const allEntries = getEntries();
  const periodEntries = filterEntries(period, ref).filter(e => new Set(team).has(normalizeAgentName(e.agent)));
  const periodLabel = getPeriodLabel(period, ref);

  // Build date range for daily timeline
  let rangeStart, rangeEnd;
  if (period === 'today') {
    rangeStart = rangeEnd = t;
  } else if (period === 'week') {
    const r = weekRange(ref); rangeStart = r.start; rangeEnd = r.end;
  } else {
    const r = monthRange(ref); rangeStart = r.start; rangeEnd = r.end;
  }
  const days = [];
  let cur = new Date(rangeStart+'T12:00:00');
  const endD = new Date(rangeEnd+'T12:00:00');
  while (cur <= endD) { days.push(toDateStr(cur)); cur.setDate(cur.getDate()+1); }

  // Ranking geral
  const byAgent = sumByAgent(periodEntries);
  const ranked = [...byAgent].sort((a,b)=>b.doc!==a.doc?b.doc-a.doc:b.cpd!==a.cpd?b.cpd-a.cpd:b.prosp-a.prosp);

  function scoreHex(score) {
    if (score >= 8) return '#6495ed';
    if (score >= 6) return '#a8e63d';
    if (score >= 3) return '#f0c040';
    return '#e74c3c';
  }
  function textOnScore(score) {
    return score >= 3 && score < 8 ? '#111' : '#fff';
  }

  // Per-agent cards
  const agentCards = ranked.map((a, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}º`;
    const aUid = TEAM.find(t=>t.name===a.agent)?.username;
    const agentEntries = allEntries.filter(e => aUid ? (e.uid===aUid || normalizeAgentName(e.agent)===a.agent) : normalizeAgentName(e.agent)===a.agent || e.agent===a.agent);
    const entryMap = {};
    agentEntries.forEach(e => { entryMap[e.date] = e; });

    // Daily score timeline squares
    const squares = days.map(d => {
      const e = entryMap[d];
      if (!e) return `<div style="display:inline-block;width:26px;height:26px;border-radius:4px;background:#e8e8e8;margin:2px;vertical-align:middle;font-size:8px;line-height:26px;text-align:center;color:#aaa">${d.slice(8)}</div>`;
      const score = calcDailyScore(e);
      const bg = scoreHex(score);
      const tc = textOnScore(score);
      const label = score % 1 === 0 ? score.toFixed(0) : score.toFixed(1);
      return `<div style="display:inline-block;width:26px;height:26px;border-radius:4px;background:${bg};margin:2px;vertical-align:middle;font-size:7px;line-height:13px;text-align:center;color:${tc};font-weight:700">
        <div>${d.slice(8)}</div><div>${label}</div>
      </div>`;
    }).join('');

    // DOCs do período
    const docs = periodEntries
      .filter(e => aUid ? (e.uid===aUid || normalizeAgentName(e.agent)===a.agent) : normalizeAgentName(e.agent)===a.agent || e.agent===a.agent)
      .flatMap(e => (e.docDetails||[]).map(d => ({...d, date: e.date})))
      .filter(d => d.nome);

    const docRows = docs.length === 0
      ? '<tr><td colspan="5" style="color:#999;font-style:italic">Nenhum DOC no período</td></tr>'
      : docs.map(d => {
          const statusColors = {'FOTOS':'#e67e22','AVI':'#3498db','AV':'#9b59b6','SITE':'#a8e63d'};
          const statusLabels = {'FOTOS':'FOTOS','AVI':'AV ASSINADA','AV':'FALTA ASSINAR','SITE':'SITE'};
          const sColor = statusColors[d.nota] || '#999';
          const sLabel = statusLabels[d.nota] || '—';
          return `<tr>
            <td style="color:#555;font-size:11px">${formatDate(d.date)}</td>
            <td style="font-weight:600">${d.nome||'—'}</td>
            <td>${d.tipo||'—'} · ${d.bairro||'—'}</td>
            <td style="text-align:right;font-weight:600">${formatCurrency(d.valor)}</td>
            <td><span style="background:${sColor};color:#fff;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700">${sLabel}</span></td>
          </tr>`;
        }).join('');

    const monthEntries = filterEntries('month', ref);
    const notaMes = calcMonthlyScore(a.agent, monthEntries);
    const notaMesBg = scoreHex(notaMes);

    return `
    <div style="border:1px solid #e0e0e0;border-radius:12px;padding:20px 24px;margin-bottom:24px;page-break-inside:avoid">

      <!-- Cabeçalho do corretor -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;border-bottom:2px solid #f0f0f0;padding-bottom:12px">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:22px">${medal}</span>
          <span style="font-size:20px;font-weight:800;color:#111">${a.agent}</span>
        </div>
        <div style="display:flex;gap:20px;align-items:center">
          <div style="text-align:center">
            <div style="font-size:24px;font-weight:800;color:#a8e63d">${a.doc}</div>
            <div style="font-size:10px;color:#888;letter-spacing:1px;text-transform:uppercase">DOC</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:24px;font-weight:800;color:#6495ed">${a.cpd}</div>
            <div style="font-size:10px;color:#888;letter-spacing:1px;text-transform:uppercase">CQ</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:24px;font-weight:800;color:#f0c040">${a.prosp}</div>
            <div style="font-size:10px;color:#888;letter-spacing:1px;text-transform:uppercase">PROSP</div>
          </div>
          ${period !== 'today' ? `<div style="text-align:center;background:${notaMesBg};border-radius:10px;padding:8px 14px">
            <div style="font-size:22px;font-weight:800;color:${textOnScore(notaMes)}">${notaMes.toFixed(1)}</div>
            <div style="font-size:9px;color:${textOnScore(notaMes)};opacity:.85;letter-spacing:.5px">NOTA MÊS</div>
          </div>` : ''}
        </div>
      </div>

      <!-- Timeline de notas -->
      <div style="margin-bottom:14px">
        <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Notas diárias — ${periodLabel}</div>
        <div style="line-height:1">${squares}</div>
        <div style="display:flex;gap:12px;margin-top:8px;font-size:10px;color:#555">
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#6495ed;margin-right:3px"></span>Azul 8–10 (DOC)</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#a8e63d;margin-right:3px"></span>Verde 6–7.9</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#f0c040;margin-right:3px"></span>Amarelo 3–5.9</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#e74c3c;margin-right:3px"></span>Vermelho 0–2.9</span>
        </div>
      </div>

      <!-- DOCs captados -->
      <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">DOCs captados</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f8f8f8">
          <th style="text-align:left;padding:6px 8px;font-size:10px;color:#888;font-weight:600;letter-spacing:.5px">DATA</th>
          <th style="text-align:left;padding:6px 8px;font-size:10px;color:#888;font-weight:600;letter-spacing:.5px">PROPRIETÁRIO</th>
          <th style="text-align:left;padding:6px 8px;font-size:10px;color:#888;font-weight:600;letter-spacing:.5px">IMÓVEL</th>
          <th style="text-align:right;padding:6px 8px;font-size:10px;color:#888;font-weight:600;letter-spacing:.5px">VALOR</th>
          <th style="text-align:left;padding:6px 8px;font-size:10px;color:#888;font-weight:600;letter-spacing:.5px">STATUS</th>
        </tr></thead>
        <tbody>${docRows}</tbody>
      </table>
    </div>`;
  }).join('');

  // Totais gerais
  const totDoc = byAgent.reduce((s,a)=>s+a.doc,0);
  const totCpd = byAgent.reduce((s,a)=>s+a.cpd,0);
  const totProsp = byAgent.reduce((s,a)=>s+a.prosp,0);

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Nickel CRM — Relatório por Angariador</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111;background:#fff;padding:32px;max-width:960px;margin:0 auto}
    table td{padding:7px 8px;border-bottom:1px solid #f0f0f0}
    @media print{
      body{padding:16px}
      button{display:none!important}
      .page-break{page-break-before:always}
    }
  </style>
  </head><body>

  <button onclick="window.print()" style="background:#111;color:#fff;border:none;padding:11px 24px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;margin-bottom:28px;display:block">🖨 Imprimir / Salvar PDF</button>

  <!-- Cabeçalho -->
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px">
    <div>
      <div style="font-size:11px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">Nickel CRM</div>
      <div style="font-size:26px;font-weight:800;color:#111">Relatório de Desempenho</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:13px;color:#555">${periodLabel}</div>
      <div style="font-size:11px;color:#aaa;margin-top:2px">Gerado em ${formatDate(t)}</div>
    </div>
  </div>

  <!-- Totais gerais -->
  <div style="display:flex;gap:16px;margin:20px 0 32px;padding:20px 24px;background:#f8f8f8;border-radius:12px">
    <div style="flex:1;text-align:center">
      <div style="font-size:32px;font-weight:800;color:#a8e63d">${totDoc}</div>
      <div style="font-size:11px;color:#888;letter-spacing:1px;text-transform:uppercase;margin-top:2px">DOC total</div>
    </div>
    <div style="flex:1;text-align:center;border-left:1px solid #e0e0e0">
      <div style="font-size:32px;font-weight:800;color:#6495ed">${totCpd}</div>
      <div style="font-size:11px;color:#888;letter-spacing:1px;text-transform:uppercase;margin-top:2px">CQ total</div>
    </div>
    <div style="flex:1;text-align:center;border-left:1px solid #e0e0e0">
      <div style="font-size:32px;font-weight:800;color:#f0c040">${totProsp}</div>
      <div style="font-size:11px;color:#888;letter-spacing:1px;text-transform:uppercase;margin-top:2px">PROSP total</div>
    </div>
    <div style="flex:1;text-align:center;border-left:1px solid #e0e0e0">
      <div style="font-size:32px;font-weight:800;color:#111">${ranked.length}</div>
      <div style="font-size:11px;color:#888;letter-spacing:1px;text-transform:uppercase;margin-top:2px">Angariadores</div>
    </div>
  </div>

  <!-- Cards por angariador -->
  ${agentCards}

  </body></html>`;

  const w = window.open('','_blank');
  if (!w) { alert('Ative os pop-ups no navegador para exportar o relatório.'); return; }
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
      <div class="conv-detail">${isProspCpd?'CQ / PROSP':'DOC / CQ'}: ${den>0?`${num} de ${den}`:'—'}</div>
    </div>`;
  }).join('');
}

// ── ADMIN UTILS ─────────────────────────────────────────
window.adminClearVideoLink = async function(date, agent) {
  const entries = getEntries();
  const entry = entries.find(e => e.date === date && e.agent === agent);
  if (!entry) { console.warn('Entry not found'); return; }
  if (entry.vrDetails) entry.vrDetails = entry.vrDetails.map(v => { const c = {...v}; delete c.url; return c; });
  delete entry.videoUrl; delete entry.vidUrl; delete entry.videoLink;
  if (Array.isArray(entry.videoLinks)) entry.videoLinks = [];
  localUpsert(entry);
  await fbUpsertEntry(entry);
  console.log('Cleared video links for', agent, date);
};

// Uso: await adminRenameAgent('Alex', 'Aleksander Vaz')
window.adminRenameAgent = async function(oldName, newName) {
  console.log(`Renomeando "${oldName}" → "${newName}"...`);
  await fbRenameAgent(oldName, newName);
  // Atualiza TEAM no Firestore
  const updatedTeam = TEAM.map(a => a.name === oldName ? { ...a, name: newName } : a);
  await fbSaveTeam(updatedTeam);
  console.log('✅ TEAM atualizado. Recarregue a página.');
};

window.adminClearAgent = async function(name) {
  const uid = Object.keys(USERS).find(k=>USERS[k].name===name);
  const entries = getEntries().filter(e => uid ? (e.uid===uid || normalizeAgentName(e.agent)===name) : normalizeAgentName(e.agent)===name || e.agent===name);
  if (entries.length === 0) { console.log(`Nenhuma entrada encontrada para "${name}".`); return; }
  if (!confirm(`Apagar TODAS as ${entries.length} entradas de "${name}"? Isso não pode ser desfeito.`)) return;
  for (const e of entries) {
    await fbDeleteEntry(e);
    console.log(`Deletado: ${e.date}`);
  }
  saveEntries(getEntries().filter(e => !(uid ? (e.uid===uid || normalizeAgentName(e.agent)===name) : normalizeAgentName(e.agent)===name || e.agent===name)));
  console.log(`✅ Dados de "${name}" apagados. Recarregue a página.`);
};

// Renames conhecidos: nome antigo no Firestore → nome novo correto
const AGENT_RENAMES = [
  ['Deisy',       'Deyse Brito'],
  ['Bruna',       'Deyse Brito'],
  ['Luís',        'Luiz Davaro'],
  ['Luis',        'Luiz Davaro'],
  ['Jhonnathan',  'Jhonnathan Pinheiro'],
  ['João',        'João Andrade'],
  ['Joao',        'João Andrade'],
  ['Felipe',      'Felipe Moreira'],
  ['Karen',       'Karen Abreu'],
  ['Alex',        'Aleksander Vaz'],
  ['Aleksander',  'Aleksander Vaz'],
  ['Konrad',      'Konrad Horst'],
  ['Rian',        'Rian'],
  ['fernandaprochnw', 'Fernanda Prochnow'],
  ['Fernanda',    'Fernanda Prochnow'],
];
// Alias map: old name → canonical name (built from AGENT_RENAMES)
const _ALIAS_MAP = Object.fromEntries(AGENT_RENAMES.map(([o,n])=>[o,n]));
function normalizeAgentName(name) { return _ALIAS_MAP[name] || name; }

// Migração estrutural: adiciona uid em todos os lançamentos históricos e muda doc IDs para uid-based
window.adminMigrateToUid = async function() {
  const needsMigration = getEntries().filter(e => !e.uid);
  if (needsMigration.length === 0) { alert('✅ Todos os lançamentos já estão com UID. Nenhuma migração necessária.'); return; }

  if (!confirm(`Migrar ${needsMigration.length} lançamentos para usar UID permanente?\n\nUm backup será baixado automaticamente antes.`)) return;

  // Backup automático antes de migrar
  try { exportBackup(); } catch(e) { console.warn('Backup falhou:', e); }
  await new Promise(r => setTimeout(r, 800));

  // Mapa: nome canônico → uid (chave de login)
  const nameToUid = {};
  Object.entries(USERS).forEach(([uid, u]) => { if (u.role === 'agent') nameToUid[u.name] = uid; });
  AGENT_RENAMES.forEach(([oldName, newName]) => {
    const uid = nameToUid[newName];
    if (uid) nameToUid[oldName] = uid;
  });

  // Roda migração no Firestore (batch)
  const result = await fbMigrateToUid(nameToUid);

  // Atualiza cache local
  const updatedLocal = getEntries().map(e => {
    if (e.uid) return e;
    const uid = nameToUid[e.agent] || nameToUid[normalizeAgentName(e.agent)];
    return uid ? { ...e, uid, agent: USERS[uid].name } : e;
  });
  saveEntries(updatedLocal);

  // Atualiza TEAM no Firestore com formato correto
  const updatedTeam = Object.keys(USERS).filter(k=>USERS[k].role==='agent').map(k=>({username:k,name:USERS[k].name,password:USERS[k].password}));
  await fbSaveTeam(updatedTeam);

  const msg = result.ambiguous.length > 0
    ? `✅ Migração concluída!\n${result.migrated} migrados, ${result.skipped} já OK.\n\n⚠ Não identificados (veja console): ${result.ambiguous.join(', ')}`
    : `✅ Migração concluída!\n${result.migrated} lançamentos agora usam UID permanente.\nA partir de agora, trocar nomes não quebra mais nenhum dado.`;
  alert(msg);
  if (result.ambiguous.length > 0) console.warn('Entradas sem UID (nomes não mapeados):', result.ambiguous);
};

window.adminRenameAll = async function() {
  const allNames = [...new Set(getEntries().map(e => e.agent))];
  console.log('Nomes encontrados no Firestore:', allNames);
  for (const [oldName, newName] of AGENT_RENAMES) {
    if (oldName === newName) continue;
    const has = getEntries().some(e => e.agent === oldName);
    if (!has) { console.log(`⏭ "${oldName}" — sem entradas, pulando`); continue; }
    console.log(`🔄 Renomeando "${oldName}" → "${newName}"...`);
    await fbRenameAgent(oldName, newName);
    saveEntries(getEntries().map(e => e.agent === oldName ? {...e, agent: newName} : e));
    console.log(`✅ "${oldName}" → "${newName}" concluído`);
  }
  // Salva TEAM atualizado no Firestore
  const updatedTeam = Object.keys(USERS)
    .filter(k => USERS[k].role === 'agent')
    .map(k => ({ username: k, name: USERS[k].name, password: USERS[k].password }));
  await fbSaveTeam(updatedTeam);
  console.log('✅ TEAM atualizado. Recarregue a página.');
  alert('✅ Todos os nomes foram atualizados. Recarregue a página.');
};

// ── PAGE DETECTION ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', ()=>{
  if      (document.getElementById('login-form'))  initLogin();
  else if (document.getElementById('streak-wrap'))  initAgentDashboard();
  else if (document.getElementById('gestor-name')) initGestorDashboard();
});
