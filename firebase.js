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

// Seed only if Firestore is completely empty — NEVER deletes existing data
export async function fbSeedIfFirstTime(seedData) {
  const snap = await getDocs(collection(db, 'entries'));
  if (!snap.empty) return; // data exists, do nothing
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
