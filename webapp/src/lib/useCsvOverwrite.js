import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { decodeCsvFile, exportEntityCSV, parseImportRows } from './csv';

// Ported from importSheetOverwrite_ in apps-script/Code.gs: clears every
// existing row in the sheet, then re-appends the imported rows (keeping a
// row's own `id` if the CSV had one, otherwise generating a fresh one) —
// same "完全覆蓋" (full overwrite) semantics here, just against a Firestore
// collection instead of a spreadsheet tab.
//
// 跟原本逐筆 deleteDoc/setDoc 的做法不同，這裡故意先寫入新資料、確認全部
// 寫入成功後才刪除沒有被保留下來的舊文件：如果先把所有舊文件刪光，寫入
// 新資料途中才失敗（例如中途斷線），集合就會變成整個清空、卻只匯入了一半，
// 而且已經沒有辦法復原。改成先寫後刪，就算寫入途中失敗，舊資料仍完整保留，
// 最多是多了幾筆已經寫入的新資料（可以再匯入一次覆蓋掉）。
//
// 另外，對有既有 id 的列，寫入時用「既有文件內容 + CSV 這幾欄」合併，不是
// 整份覆蓋：CSV 格式只能帶得動單純文字/數字欄位，帶不動備註清單、轉出/
// 離境紀錄、附件上傳連結這類巢狀資料；如果直接整份覆蓋，CSV 沒有的欄位
// 匯入後就會憑空消失（而且附件實體檔案還留在 Storage 裡變成孤兒檔案，
// 因為路徑已經不在文件裡，之後也刪不掉）。合併寫入可以讓這些欄位在重新
// 匯入後仍然保留；CSV 裡確實有出現的欄位還是會照匯入的值覆蓋過去。
async function overwriteCollection(collectionName, importedRows) {
  const existing = await getDocs(collection(db, collectionName));
  const existingById = new Map(existing.docs.map((d) => [d.id, d.data()]));

  const keptIds = new Set();
  for (let i = 0; i < importedRows.length; i += 450) {
    const batch = writeBatch(db);
    importedRows.slice(i, i + 450).forEach((row) => {
      const { id, ...data } = row;
      const ref = id ? doc(db, collectionName, id) : doc(collection(db, collectionName));
      const prev = id ? existingById.get(id) : undefined;
      batch.set(ref, prev ? { ...prev, ...data } : data);
      keptIds.add(ref.id);
    });
    await batch.commit();
  }

  const toDelete = existing.docs.filter((d) => !keptIds.has(d.id)).map((d) => d.ref);
  for (let i = 0; i < toDelete.length; i += 450) {
    const batch = writeBatch(db);
    toDelete.slice(i, i + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export function useCsvOverwrite(collectionName, fields, { entityLabel, requiredKeys, canEdit } = {}) {
  function handleExport(rows) {
    exportEntityCSV(rows, fields, entityLabel || collectionName);
  }

  async function handleImport(file, currentCount) {
    if (!canEdit) return;
    let text;
    try { text = await decodeCsvFile(file, fields); } catch { alert('無法讀取檔案。'); return; }
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
