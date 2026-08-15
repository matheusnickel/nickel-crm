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

export function entryId(date, agent) {
  return `${date}_${agent.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'_')}`;
}

export async function fbUpsertEntry(entry) {
  await setDoc(doc(db, 'entries', entryId(entry.date, entry.agent)), entry);
}

export async function fbDeleteEntry(date, agent) {
  await deleteDoc(doc(db, 'entries', entryId(date, agent)));
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

  // Processa em lotes de 500 (limite do Firestore)
  const chunkSize = 400;
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
