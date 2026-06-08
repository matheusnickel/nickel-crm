import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs,
  deleteDoc, writeBatch, onSnapshot
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

// ── TEAM MANAGEMENT ─────────────────────────────────────
export async function fbGetTeam() {
  const snap = await getDoc(doc(db, '_meta', 'team'));
  return snap.exists() ? snap.data().agents : null;
}

export async function fbSaveTeam(agents) {
  await setDoc(doc(db, '_meta', 'team'), { agents });
}
