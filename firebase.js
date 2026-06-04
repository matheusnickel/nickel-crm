import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs,
  writeBatch, deleteDoc, onSnapshot
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

// doc ID normalised — "2026-06-04_Karen"
export function entryId(date, agent) {
  return `${date}_${agent.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'_')}`;
}

export async function fbUpsertEntry(entry) {
  await setDoc(doc(db, 'entries', entryId(entry.date, entry.agent)), entry);
}

// Full reset + reseed when SEED_VERSION changes
export async function fbReseedIfNeeded(seedData, version) {
  const verRef = doc(db, '_meta', 'seed_version');
  const verSnap = await getDoc(verRef);
  if (verSnap.exists() && verSnap.data().v === version) return;

  // Delete all existing entries
  const snap = await getDocs(collection(db, 'entries'));
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));

  // Write fresh seed
  seedData.forEach(e => batch.set(doc(db, 'entries', entryId(e.date, e.agent)), e));
  batch.set(verRef, { v: version, ts: new Date().toISOString() });
  await batch.commit();
}

export function fbListen(callback) {
  return onSnapshot(collection(db, 'entries'), snap => {
    callback(snap.docs.map(d => d.data()));
  });
}
