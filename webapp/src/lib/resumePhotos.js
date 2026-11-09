// 刺青照片可以上傳多張——公開填寫頁、內部編輯表單、履歷表連結預覽、
// 下載履歷表(.docx) 都要用同一套規則解析，不要各自維護一份。新資料
// 存進 tattooPhotoUrls（JSON 字串陣列）；舊資料只有單一的 tattooPhotoUrl
// 欄位時，當作只有一張，讀取時自動補成陣列（寫入時一律改存新欄位，
// 不用特別遷移 Firestore 既有紀錄也能正常顯示/編輯）。
export function tattooPhotoUrlsOf(record) {
  if (record?.tattooPhotoUrls) {
    try {
      const arr = JSON.parse(record.tattooPhotoUrls);
      if (Array.isArray(arr)) return arr.filter(Boolean);
    } catch { /* 不是 JSON，忽略 */ }
  }
  return record?.tattooPhotoUrl ? [record.tattooPhotoUrl] : [];
}
