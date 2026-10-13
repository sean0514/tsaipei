// 元凱（越南系統）的媒合紀錄/二面進度/錄取名單/辦理簽證提醒/實習文件追蹤/
// 申辦進度追蹤/在台簽證追蹤這幾個模組改成唯讀顯示境外生實習系統
// （tsaipei）的資料，只篩選學生來源(國外供應商)是這三個的紀錄。
export const ALLOWED_SOURCE_SUPPLIERS = ['阮氏芳草', '阿草', '阿草（鳳仙）'];

export function isAllowedSourceStudent(student) {
  return !!student && ALLOWED_SOURCE_SUPPLIERS.includes(student.sourceSupplier);
}

// Ported from studentFullLabel in systems/tsaipei/*.jsx (duplicated across
// many of those files) — kept as one shared copy here since these唯讀頁面
// 全部都要用到同一套。
export function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// 客戶名稱越南文對照表（vietnam_companyNameTranslations，由管理者在
// 「客戶名稱翻譯」頁面手動維護）：company 是境外生實習系統原始填的公司
// 名稱（專有名詞，機器翻譯不可靠，所以只在有人工對照時才替換顯示），查
// 不到對照就照樣顯示中文原文。
export function buildTranslationMap(rows) {
  const map = {};
  rows.forEach((r) => { if (r.company) map[r.company] = r.viName || ''; });
  return map;
}

export function translateCompanyName(company, translations, lang) {
  if (lang === 'vi' && translations?.[company]) return translations[company];
  return company;
}

// Ported from studentCompanyLabel in systems/tsaipei/ApplicationProgressPage.jsx
// 等多個檔案（同一套邏輯各自複製一份）。translations/lang 有帶的話，公司
// 名稱部分會套用越南文對照（查不到對照則維持中文原文）。
export function studentCompanyLabel(studentId, { matches, admittedList, positions }, translations, lang) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  if (!m) return '未指定客戶';
  const p = positions.find((pp) => pp.id === m.positionId);
  if (!p) return '未指定客戶';
  const companyName = translateCompanyName(p.company, translations, lang);
  const parts = [p.projectCode, companyName, m.venue].filter(Boolean);
  return parts.join(' ') || '未指定客戶';
}

// 這 7 個唯讀分頁都要「用客戶分類」：把 rows 依 labelFn(row) 算出的客戶
// 標籤分組，組內維持原本的排序，組與組之間依標籤文字排序。
export function groupByLabel(rows, labelFn) {
  const groups = {};
  rows.forEach((r) => {
    const key = labelFn(r) || '未指定客戶';
    (groups[key] ||= []).push(r);
  });
  return Object.keys(groups)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({ label: key, rows: groups[key] }));
}
