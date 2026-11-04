import { useRef, useState } from 'react';
import { translateViToZh } from './translate';

// 履歷表欄位的越南文→中文自動翻譯共用邏輯：公開填寫頁(pages/
// LaborAgencyResumeApplyPage.jsx)跟內部表單(components/ResumeInternalFields.jsx)
// 都用這套——欄位失焦時，把填寫內容的翻譯結果存進對應的「中文翻譯」欄位
// （key 後面加 Zh，跟 vietnam 系統 StudentsPage.jsx 的 schoolZh/departmentZh
// 同一套模式），原文保留不覆蓋，這樣中文人員看得懂，又不會弄丟越南文
// 原始資料（萬一機器翻譯不準，原文還在）。同一段文字已經翻譯過就不重複
// 呼叫 API。越文姓名→中文姓名是例外：目標欄位是 chineseName（沒有 Zh
// 後綴，跟越文姓名 vietnameseName 不是同一組 原文/翻譯 欄位命名），但做法
// 相同——越文姓名失焦時自動翻譯填入中文姓名，方便行政人員建檔時不用
// 每筆都手動翻，仍可自行修改。
export function useResumeTranslate(setField) {
  const lastSource = useRef({});
  const [translatingKeys, setTranslatingKeys] = useState(() => new Set());

  async function translateOnBlur(zhKey, value) {
    const source = (value || '').trim();
    if (!source || lastSource.current[zhKey] === source) return;
    lastSource.current[zhKey] = source;
    setTranslatingKeys((s) => new Set(s).add(zhKey));
    try {
      const result = await translateViToZh(source);
      setField(zhKey, result);
    } catch {
      // 翻譯失敗就留空，不擋住繼續填寫；中文翻譯欄位本來就是輔助用。
    } finally {
      setTranslatingKeys((s) => { const next = new Set(s); next.delete(zhKey); return next; });
    }
  }

  return { translateOnBlur, translatingKeys };
}
