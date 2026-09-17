import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';

// Shared audit trail for every add/edit/delete across the foodfactory
// system's editable entities — one collection, distinguished by `entity`,
// so each page doesn't need its own Firestore rule block. Immutable:
// only created, never updated or deleted (see firestore.rules).
export function nowIso() {
  return new Date().toISOString();
}

export async function logChange(entity, action, label, operatorEmail) {
  await addDoc(collection(db, 'foodfactory_changeLogs'), {
    date: nowIso(), entity, action, label, operator: operatorEmail || '(未知)',
  });
}
