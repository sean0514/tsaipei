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

  // 呼叫端常常直接寫 useCollection('x', { order: ['name', 'asc'] })，每次
  // render 都會產生新的物件/陣列參考。如果 effect 依賴陣列直接放 order，
  // React 會認定它「變了」而重跑 effect → 重新訂閱 onSnapshot → 觸發
  // setRows/setLoading → 這個元件重新 render → 又產生新的 order 參考 →
  // 無限迴圈，整頁甚至整個分頁都會卡死。改成依賴由 order 內容算出來的
  // 穩定字串，值沒變就不會重跑。
  const orderKey = order ? order.join('|') : '';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, orderKey]);

  return {
    rows,
    loading,
    error,
    add: (data) => addDoc(collection(db, name), data),
    update: (id, data) => updateDoc(doc(db, name, id), data),
    remove: (id) => deleteDoc(doc(db, name, id)),
  };
}
