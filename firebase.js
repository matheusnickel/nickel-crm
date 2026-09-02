import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs,
  deleteDoc, writeBatch, onSnapshot, addDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAV1IBBj0usYroywP0i-SLFSHVJh8_S2-g",
  authDomain: "nickel-crm.firebaseapp.com",
  projectId: "nickel-crm",
  storageBucket: "nickel-crm.firebasestorage.app",
  messagingSenderId: "1018417148561",
  appId: "1:1018417148561:web:78ad464074e560fc140530",
};

const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

// doc ID: uid-based when entry has uid field (stable), name-based for legacy entries
export function entryId(dateOrEntry, agentName) {
  if (typeof dateOrEntry === 'object') {
    const e = dateOrEntry;
    if (e.uid) return `${e.date}_${e.uid}`;
    return `${e.date}_${e.agent.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'_')}`;
  }
  return `${dateOrEntry}_${agentName.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'_')}`;
}

export async function fbUpsertEntry(entry) {
  await setDoc(doc(db, 'entries', entryId(entry)), entry);
}

// Accepts entry object (preferred) or legacy (date, agentName) signature
export async function fbDeleteEntry(entryOrDate, agentName) {
  const id = typeof entryOrDate === 'object'
    ? entryId(entryOrDate)
    : entryId(entryOrDate, agentName);
  await deleteDoc(doc(db, 'entries', id));
}

// Migrate all entries: add uid field + new uid-based doc ID; returns { migrated, skipped, ambiguous }
export async function fbMigrateToUid(nameToUid) {
  const snap = await getDocs(collection(db, 'entries'));
  let migrated = 0, skipped = 0;
  const ambiguous = [];
  const chunkSize = 200;
  const docs = snap.docs;

  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + chunkSize)) {
      const e = d.data();
      if (e.uid) { skipped++; continue; }
      const uid = nameToUid[e.agent];
      if (!uid) { ambiguous.push(e.agent); continue; }
      const newEntry = { ...e, uid };
      const newId = `${e.date}_${uid}`;
      batch.set(doc(db, 'entries', newId), newEntry);
      if (d.id !== newId) batch.delete(d.ref);
      migrated++;
    }
    await batch.commit();
  }
  return { migrated, skipped, ambiguous: [...new Set(ambiguous)] };
}

// Update display name on all entries for a uid (without changing doc IDs)
export async function fbUpdateAgentDisplayName(uid, newName) {
  const snap = await getDocs(collection(db, 'entries'));
  const toUpdate = snap.docs.filter(d => d.data().uid === uid);
  const chunkSize = 400;
  for (let i = 0; i < toUpdate.length; i += chunkSize) {
    const batch = writeBatch(db);
    toUpdate.slice(i, i + chunkSize).forEach(d => batch.update(d.ref, { agent: newName }));
    await batch.commit();
  }
  return toUpdate.length;
}

export async function fbSeedIfFirstTime(seedData) {
  const snap = await getDocs(collection(db, 'entries'));
  if (!snap.empty) return;
  if (seedData.length === 0) return;
  const batch = writeBatch(db);
  seedData.forEach(e => batch.set(doc(db, 'entries', entryId(e.date, e.agent)), e));
  await batch.commit();
}

export function fbListen(callback) {
  return onSnapshot(collection(db, 'entries'), snap => {
    callback(snap.docs.map(d => d.data()));
  });
}

// ── VIDEO AUTH ──────────────────────────────────────────
export async function fbGetVideoAuth() {
  const snap = await getDoc(doc(db, '_meta', 'videoAuth'));
  return snap.exists() ? snap.data() : {};
}

export async function fbSaveVideoAuth(data) {
  await setDoc(doc(db, '_meta', 'videoAuth'), data);
}

// ── OFERTAS ATIVAS ──────────────────────────────────────
export async function fbGetOfertas() {
  const snap = await getDocs(collection(db, 'ofertas'));
  return snap.docs.map(d => d.data());
}

export async function fbSaveOferta(oferta) {
  await setDoc(doc(db, 'ofertas', oferta.id), oferta);
}

export async function fbDeleteOferta(id) {
  await deleteDoc(doc(db, 'ofertas', id));
}

// ── TEAM MANAGEMENT ─────────────────────────────────────
export async function fbGetTeam() {
  const snap = await getDoc(doc(db, '_meta', 'team'));
  return snap.exists() ? snap.data().agents : null;
}

export async function fbSaveTeam(agents) {
  await setDoc(doc(db, '_meta', 'team'), { agents });
}

// Renomeia um angariador: atualiza todas as entradas e o videoAuth
export async function fbRenameAgent(oldName, newName) {
  const snap = await getDocs(collection(db, 'entries'));
  const toRename = snap.docs.filter(d => d.data().agent === oldName);
  if (toRename.length === 0) { console.log(`Nenhuma entrada encontrada para "${oldName}"`); }

  // Cada entrada gera 2 ops (set + delete) → max 200 por batch (limite é 500 ops)
  const chunkSize = 200;
  for (let i = 0; i < toRename.length; i += chunkSize) {
    const batch = writeBatch(db);
    toRename.slice(i, i + chunkSize).forEach(d => {
      const entry = { ...d.data(), agent: newName };
      batch.set(doc(db, 'entries', entryId(entry.date, newName)), entry);
      batch.delete(d.ref);
    });
    await batch.commit();
  }

  // Atualiza chaves no videoAuth
  const authSnap = await getDoc(doc(db, '_meta', 'videoAuth'));
  if (authSnap.exists()) {
    const data = authSnap.data();
    const updated = {};
    Object.entries(data).forEach(([k, v]) => {
      updated[k.startsWith(oldName + '_') ? k.replace(oldName + '_', newName + '_') : k] = v;
    });
    await setDoc(doc(db, '_meta', 'videoAuth'), updated);
  }

  console.log(`✅ "${oldName}" renomeado para "${newName}" (${toRename.length} entradas)`);
}

// ── LEADS / DISTRIBUIÇÃO ────────────────────────────────
export function fbListenLeads(callback) {
  return onSnapshot(collection(db, 'leads'), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
export async function fbSaveLead(lead) {
  const ref = doc(collection(db, 'leads'));
  await setDoc(ref, { ...lead, id: ref.id });
  return ref.id;
}
export async function fbUpdateLead(id, fields) {
  const { updateDoc: upd } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
  await upd(doc(db, 'leads', id), fields);
}
export async function fbGetLeadQueue() {
  const snap = await getDoc(doc(db, '_meta', 'leadQueue'));
  return snap.exists() ? snap.data() : { counts: {}, lastAssignedAt: {} };
}
export async function fbSaveLeadQueue(data) {
  await setDoc(doc(db, '_meta', 'leadQueue'), data, { merge: true });
}

// ── FORCE LOGOUT ────────────────────────────────────────
export async function fbCheckForceLogout() {
  try {
    const snap = await getDoc(doc(db, '_meta', 'forceLogout'));
    return snap.exists() ? snap.data().active === true : false;
  } catch { return false; }
}

export async function fbClearForceLogout() {
  await setDoc(doc(db, '_meta', 'forceLogout'), { active: false });
}

// ── FOTOS (agendamentos de fotos) ───────────────────────
export async function fbSaveFoto(foto) {
  const ref = doc(collection(db, 'fotos'));
  await setDoc(ref, { ...foto, id: ref.id });
  return ref.id;
}
export async function fbUpdateFoto(id, fields) {
  const { updateDoc: upd } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
  await upd(doc(db, 'fotos', id), fields);
}
export async function fbDeleteFoto(id) {
  await deleteDoc(doc(db, 'fotos', id));
}
export function fbListenFotos(callback) {
  return onSnapshot(collection(db, 'fotos'), snap => {
    callback(snap.docs.map(d => d.data()));
  });
}

// ── VENDAS ──────────────────────────────────────────────
export async function fbSaveSale(sale) {
  await addDoc(collection(db, 'sales'), sale);
}

export async function fbDeleteSale(id) {
  await deleteDoc(doc(db, 'sales', id));
}

export function fbListenSales(callback) {
  return onSnapshot(collection(db, 'sales'), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
