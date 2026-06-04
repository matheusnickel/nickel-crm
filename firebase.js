import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, writeBatch, onSnapshot
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

// doc ID: "2026-06-04_Karen" — remove accents, replace spaces
function entryId(date, agent) {
  const clean = agent.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
  return `${date}_${clean}`;
}

// Write or overwrite one entry
export async function fbUpsertEntry(entry) {
  await setDoc(doc(db, 'entries', entryId(entry.date, entry.agent)), entry);
}

// Seed Firestore once (sentinel doc prevents re-seeding)
export async function fbSeedIfEmpty(seedData) {
  const sentinelRef = doc(db, '_meta', 'seeded');
  const snap = await getDoc(sentinelRef);
  if (snap.exists()) return;
  const batch = writeBatch(db);
  seedData.forEach(e => batch.set(doc(db, 'entries', entryId(e.date, e.agent)), e));
  batch.set(sentinelRef, { ts: new Date().toISOString() });
  await batch.commit();
}

// Real-time listener — calls callback(entries[]) on every Firestore change
export function fbListen(callback) {
  return onSnapshot(collection(db, 'entries'), snap => {
    callback(snap.docs.map(d => d.data()));
  });
}
