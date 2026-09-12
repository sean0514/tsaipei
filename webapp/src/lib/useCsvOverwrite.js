import { collection, deleteDoc, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { exportEntityCSV, parseImportRows } from './csv';

// Ported from importSheetOverwrite_ in apps-script/Code.gs: clears every
// existing row in the sheet, then re-appends the imported rows (keeping a
// row's own `id` if the CSV had one, otherwise generating a fresh one) —
// same "完全覆蓋" (full overwrite) semantics here, just against a Firestore
// collection instead of a spreadsheet tab.
async function overwriteCollection(collectionName, importedRows) {
  const existing = await getDocs(collection(db, collectionName));
  const deletes = existing.docs.map((d) => d.ref);
  for (let i = 0; i < deletes.length; i += 450) {
    const batch = writeBatch(db);
    deletes.slice(i, i + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  await Promise.all(importedRows.map((row) => {
    const { id, ...data } = row;
    return id ? setDoc(doc(db, collectionName, id), data) : setDoc(doc(collection(db, collectionName)), data);
  }));
}

export function useCsvOverwrite(collectionName, fields, { entityLabel, requiredKeys, canEdit } = {}) {
  function handleExport(rows) {
    exportEntityCSV(rows, fields, entityLabel || collectionName);
  }

  async function handleImport(file, currentCount) {
    if (!canEdit) return;
    let text;
    try { text = await file.text(); } catch { alert('無法讀取檔案。'); return; }
    const result = parseImportRows(text, fields, requiredKeys);
    if (result.error) { alert(result.error); return; }
    if (!result.imported.length) {
      alert('沒有任何一列可以匯入，請確認欄位格式與必填的關聯 ID 是否正確。請使用「下載完整資料」產生的檔案來編輯，不要自己重新排欄位。');
      return;
    }
    const ok = window.confirm(
      `即將以檔案中的 ${result.imported.length} 筆資料，完全覆蓋目前系統中的 ${currentCount} 筆${entityLabel || ''}。\n\n此動作無法復原，確定要繼續嗎？`
    );
    if (!ok) return;
    try {
      await overwriteCollection(collectionName, result.imported);
      alert(`匯入完成，${entityLabel || ''}已覆蓋為 ${result.imported.length} 筆${result.skipped ? `（另有 ${result.skipped} 筆因欄位或關聯 ID 不符被略過）` : ''}。`);
    } catch (err) {
      alert(`匯入失敗：${err.message || err}`);
    }
  }

  return { handleExport, handleImport };
}
