// 越南實習生系統專用的內部獎金計算邏輯，跟 lib/bonus.js（境外生實習系統
// 也在用，角色清單是舊的 12 個角色）分開，避免改了角色清單影響到境外生
// 實習系統。純計算工具（monthRange/dateOverlapDays/studentDaysInTaiwanForMonth/
// studentProjectClientPair/computeDormManagerBonusForMonth）跟角色清單無關，
// 直接沿用 lib/bonus.js 的版本。
import { monthRange, dateOverlapDays, studentDaysInTaiwanForMonth, studentProjectClientPair, computeDormManagerBonusForMonth } from './bonus';

export { monthRange, dateOverlapDays, studentDaysInTaiwanForMonth, studentProjectClientPair, computeDormManagerBonusForMonth };

// 依學校分類設定月費率的角色（跟 InternalBonusRateSetupPage.jsx 的
// RATE_FIELDS 保持一致，不含宿管人員1/2——那兩個走舊的
// computeDormManagerBonusForMonth，不受這裡的角色清單影響，費率來源
// (內部費用建檔) 已移除，固定算 0）。
export const VN_RATE_ROLE_KEYS = ['bizDev', 'adminSupervisor', 'adminRecruit', 'adminVisa', 'fieldStaff'];
export const VN_RATE_ROLE_LABELS = ['開發業務', '行政主管', '行政招募', '行政簽證', '外務人員'];

// 這 5 個角色的負責人都指派在「學生資料」（StudentsPage.jsx 的
// assignedBizDev/assignedAdminSupervisor/assignedAdminRecruit/assignedAdminVisa/
// assignedFieldStaff）。
const VN_STUDENT_ASSIGNED_ROLE_KEYS = ['bizDev', 'adminSupervisor', 'adminRecruit', 'adminVisa', 'fieldStaff'];
const VN_STUDENT_FIELD_BY_ROLE_KEY = {
  bizDev: 'assignedBizDev',
  adminSupervisor: 'assignedAdminSupervisor',
  adminRecruit: 'assignedAdminRecruit',
  adminVisa: 'assignedAdminVisa',
  fieldStaff: 'assignedFieldStaff',
};

function roleLabel(key) {
  return VN_RATE_ROLE_LABELS[VN_RATE_ROLE_KEYS.indexOf(key)];
}

// 費率依學校分類（見 InternalBonusRateSetupPage.jsx），bonusRateSetup 是
// vietnam_internalBonusRateSetup 的所有紀錄，每筆一個學校；依學生自己
// 就讀的學校找對應那筆費率，找不到就當沒設定（金額算 0）。
function rateForSchool(bonusRateSetup, school) {
  return (bonusRateSetup || []).find((r) => r.school === school);
}

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// 一次性內部獎金：以「越南送機行程」(vietnam_departureTransport) 出現過的
// 學生名單為準——學生安排送機才算案件完成，這幾個角色的獎金才算一次
// （不分月、不按天數比例分攤）。依該學生自己就讀的學校在「內部獎金設定」
// 查對應費率，5 個角色都看學生自己指派的負責人（StudentsPage.jsx 的
// assignedBizDev/assignedAdminSupervisor/assignedAdminRecruit/assignedAdminVisa/
// assignedFieldStaff），依人員加總。
export function computeVietnamInternalBonusByPerson(ctx) {
  const { students, bonusRateSetup, departureTransport } = ctx;
  const departedStudentIds = new Set((departureTransport || []).map((d) => d.studentId).filter(Boolean));
  const personTotals = {};

  function addAmount(name, amount, detail) {
    if (!name || !amount) return;
    const entry = (personTotals[name] ||= { name, total: 0, breakdown: [] });
    entry.total += amount;
    entry.breakdown.push(detail);
  }

  (students || []).filter((s) => departedStudentIds.has(s.id)).forEach((s) => {
    const pair = studentProjectClientPair(s.id, ctx);
    const rate = rateForSchool(bonusRateSetup, s.school);
    const studentName = studentFullLabel(s);

    VN_STUDENT_ASSIGNED_ROLE_KEYS.forEach((k) => {
      const name = s[VN_STUDENT_FIELD_BY_ROLE_KEY[k]];
      const rateVal = rate ? (Number(rate[k]) || 0) : 0;
      if (!name || !rateVal) return;
      addAmount(name, rateVal, { student: studentName, client: pair?.client || '', role: roleLabel(k), amount: rateVal });
    });
  });

  return Object.values(personTotals).sort((a, b) => b.total - a.total);
}

// 學校代表獎金：依學校費用設定(vietnam_schoolSetup)設定的學校代表＋月費率，
// 乘以該校每位學生這個月在台天數比例，依學校分組顯示。
export function computeVietnamSchoolRepBonusForMonth(monthStr, ctx) {
  const range = monthRange(monthStr);
  if (!range) return [];
  const { students, inTaiwanVisaRecords, schools } = ctx;
  const rows = {};
  (schools || []).forEach((sc) => {
    if (!sc.schoolRep || !Number(sc.monthlyFee)) return;
    rows[sc.name] = { schoolName: sc.name, schoolRep: sc.schoolRep, amount: 0, totalDays: 0 };
  });
  (students || []).forEach((s) => {
    const row = rows[s.school];
    if (!row) return;
    const days = studentDaysInTaiwanForMonth(s.id, monthStr, inTaiwanVisaRecords);
    if (days <= 0) return;
    const sc = (schools || []).find((x) => x.name === s.school);
    const rateVal = Number(sc?.monthlyFee) || 0;
    if (!rateVal) return;
    row.totalDays += days;
    row.amount += Math.round((rateVal / range.daysInMonth) * days);
  });
  return Object.values(rows).filter((r) => r.totalDays > 0).sort((a, b) => a.schoolName.localeCompare(b.schoolName));
}

