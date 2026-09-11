import { useEffect, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

// Live-subscribes to a Firestore collection and returns { rows, loading, add, update, remove }.
// `name` should already include the system prefix, e.g. 'tsaipei_students'.
export function useCollection(name, { order = null } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = collection(db, name);
    const q = order ? query(base, orderBy(...order)) : base;
    const unsub = onSnapshot(q, (snap) => {
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [name, order]);

  return {
    rows,
    loading,
    add: (data) => addDoc(collection(db, name), data),
    update: (id, data) => updateDoc(doc(db, name, id), data),
    remove: (id) => deleteDoc(doc(db, name, id)),
  };
}
