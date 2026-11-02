// 元凱移工事業部：越南外勞仲介引進案件的共用常數，跟 yujian（看護/家事
// 人員）系統分開，工種涵蓋製造業/營造業/農漁業等產業類移工。
// 比照使用者提供的參考雛型（Firebase 版移工案件管理）設計：案件只用單一
// 「目前階段」欄位＋看板呈現進度，不另外拆成媒合/二面/錄取多張表。
export const STAGES = [
  { key: '面試甄選', tip: '越南當地招募、面試、體能與技能篩選' },
  { key: '雇主確認', tip: '雇主選工、簽訂契約' },
  { key: '申請許可', tip: '向勞動部申請聘僱許可' },
  { key: '簽證辦理', tip: '護照、駐外館處簽證申請' },
  { key: '行前訓練', tip: '出國前訓練與體檢' },
  { key: '入境接機', tip: '抵台接機、送往雇主或宿舍' },
  { key: '體檢居留', tip: '入國通報、健康檢查、申辦居留證' },
  { key: '在職追蹤', tip: '在職關懷、定期訪視、展延評估' },
];
export const STAGE_KEYS = STAGES.map((s) => s.key);
export const JOBS = ['製造業', '看護工', '家庭幫傭', '營造業', '農漁業'];
export const INDUSTRIES = ['製造業', '社福看護', '家庭類', '營造業', '農漁牧'];
export const GENDERS = ['男', '女'];
const DAY = 86400000;

export function stageIndex(stage) {
  return Math.max(0, STAGE_KEYS.indexOf(stage));
}

// 護照效期天數：辦簽證通常要求護照剩餘效期 6 個月（180 天）以上，還沒
// 入境（階段在「入境接機」之前）剩不到 180 天就要特別標示。
export function daysToExpiry(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${dateStr}T00:00:00`) - today) / DAY);
}

export function passportStatus(w) {
  const d = daysToExpiry(w.passportExpiry);
  if (d === null) return { label: '未填護照效期', cls: 'tag-grey' };
  if (d < 0) return { label: '護照已過期', cls: 'tag-red' };
  if (d <= 180 && stageIndex(w.stage) < 5) return { label: `護照剩 ${d} 天（不足 6 個月）`, cls: 'tag-red' };
  if (d <= 90) return { label: `護照剩 ${d} 天`, cls: 'tag-red' };
  if (d <= 180) return { label: `護照剩 ${d} 天`, cls: 'tag-amber' };
  return { label: `護照 ${w.passportExpiry}`, cls: 'tag-green' };
}

export function employerLabel(employers, employerId) {
  return employers.find((e) => e.id === employerId)?.name || '尚未配對';
}
