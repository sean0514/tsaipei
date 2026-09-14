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
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const base = collection(db, name);
    const q = order ? query(base, orderBy(...order)) : base;
    const unsub = onSnapshot(q, (snap) => {
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      // 沒有這個 callback 的話，讀取失敗（例如權限不足）會被 SDK 靜默吞掉，
      // 畫面卡在 loading 永遠不會顯示任何東西也不會報錯——這裡把錯誤攤出來，
      // 讓頁面可以顯示明確的失敗訊息，而不是看起來像「沒有資料」。
      console.error(`useCollection(${name}) failed:`, err);
      setError(err);
      setLoading(false);
    });
    return unsub;
  }, [name, order]);

  return {
    rows,
    loading,
    error,
    add: (data) => addDoc(collection(db, name), data),
    update: (id, data) => updateDoc(doc(db, name, id), data),
    remove: (id) => deleteDoc(doc(db, name, id)),
  };
}
