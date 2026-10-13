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

// Ported from studentCompanyLabel in systems/tsaipei/ApplicationProgressPage.jsx
// 等多個檔案（同一套邏輯各自複製一份）。
export function studentCompanyLabel(studentId, { matches, admittedList, positions }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  if (!m) return '未指定客戶';
  const p = positions.find((pp) => pp.id === m.positionId);
  if (!p) return '未指定客戶';
  const parts = [p.projectCode, p.company, m.venue].filter(Boolean);
  return parts.join(' ') || '未指定客戶';
}
