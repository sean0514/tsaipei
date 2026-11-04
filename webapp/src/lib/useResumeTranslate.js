import { useRef, useState } from 'react';
import { translateViToZh } from './translate';

// 履歷表欄位的越南文→中文自動翻譯共用邏輯：公開填寫頁(pages/
// LaborAgencyResumeApplyPage.jsx)跟內部表單(components/ResumeInternalFields.jsx)
// 都用這套——欄位失焦時，把填寫內容的翻譯結果存進對應的「中文翻譯」欄位
// （key 後面加 Zh，跟 vietnam 系統 StudentsPage.jsx 的 schoolZh/departmentZh
// 同一套模式），原文保留不覆蓋，這樣中文人員看得懂，又不會弄丟越南文
// 原始資料（萬一機器翻譯不準，原文還在）。同一段文字已經翻譯過就不重複
// 呼叫 API。越文姓名→中文姓名不是用這套：姓名不是「詞義翻譯」，改用
// lib/vietnameseNameToChinese.js 的漢越音字典逐字查表轉換（見
// ResumeInternalFields.jsx／LaborAgencyResumeApplyPage.jsx 越文姓名欄位的
// onBlur），比丟給這裡的一般文字翻譯 API 準確。
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
