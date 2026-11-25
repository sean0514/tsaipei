// 印尼實習生系統專用的內部獎金計算邏輯，跟 lib/bonus.js（境外生實習系統
// 也在用，角色清單是舊的 12 個角色）分開，避免改了角色清單影響到境外生
// 實習系統。純計算工具（monthRange/dateOverlapDays/studentDaysInTaiwanForMonth/
// studentProjectClientPair/computeDormManagerBonusForMonth）跟角色清單無關，
// 直接沿用 lib/bonus.js 的版本。
import { monthRange, dateOverlapDays, studentDaysInTaiwanForMonth, studentProjectClientPair, computeDormManagerBonusForMonth } from './bonus';
import { tsaipeiIdOf } from './indonesiaTsaipeiStudentSync';

export { monthRange, dateOverlapDays, studentDaysInTaiwanForMonth, studentProjectClientPair, computeDormManagerBonusForMonth };

// 依學校分類設定月費率的角色（跟 InternalBonusRateSetupPage.jsx 的
// RATE_FIELDS 保持一致，不含宿管人員1/2——那兩個走舊的
// computeDormManagerBonusForMonth，不受這裡的角色清單影響，費率來源
// (內部費用建檔) 已移除，固定算 0）。
export const VN_RATE_ROLE_KEYS = ['bizDev', 'adminSupervisor', 'adminRecruit', 'adminVisa', 'fieldStaff'];
export const VN_RATE_ROLE_LABELS = ['開發業務', '行政主管', '行政招募', '行政簽證', '外務人員'];
export const VN_CURRENCIES = ['新台幣', '美金', '越盾'];
export const VN_DEFAULT_CURRENCY = '新台幣';

// 學校名稱常常帶一個分隔用的破折號（例如「印尼－工貿學院」），但全形
// 破折號／連接號／em dash 長得很像，打字時很容易不小心混用（學生資料跟
// 學校費用設定/內部獎金設定分別由不同人建檔，更容易兩邊不一致），導致
// 看起來「一樣」的學校名稱其實是不同字元、完全比對不到，讓這裡的獎金
// 算成 0 或查無資料（跟 ScholarshipsPage.jsx 同一套正規化邏輯，問題
// 性質一樣：比對學校名稱時都要先正規化再比，不能直接用 ===）。
export function normalizeSchoolName(name) {
  return (name || '')
    .trim()
    .replace(/[－–—]/g, '-') // 統一各種長得很像的破折號字元
    .replace(/\s*-\s*/g, '-') // 破折號前後常見的全形/半形空格不一致
    .replace(/\s+/g, ' ');
}

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
// indonesia_internalBonusRateSetup 的所有紀錄，每筆一個學校；依學生自己
// 就讀的學校找對應那筆費率，找不到就當沒設定（金額算 0）。
function rateForSchool(bonusRateSetup, school) {
  const normalized = normalizeSchoolName(school);
  if (!normalized) return undefined;
  return (bonusRateSetup || []).find((r) => normalizeSchoolName(r.school) === normalized);
}

function findSchool(schools, name) {
  const normalized = normalizeSchoolName(name);
  if (!normalized) return undefined;
  return (schools || []).find((sc) => normalizeSchoolName(sc.name) === normalized);
}

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// 一次性內部獎金：以「印尼送機行程」(indonesia_departureTransport) 真的填了
// 送機日期的學生名單為準——光是有這筆紀錄還不夠（學生建檔/同步時系統會
// 自動建立一筆只有 studentId、日期還是空的空白紀錄，不代表案件已經完成），
// 一定要送機日期實際填上去，才算這個學生的案件完成、才列入計算。依這個
// 送機日期所在的月份分組（同一個學生只會有一個送機日期，不會同時出現在
// 兩個月份），月份底下再依人員加總：該學生自己就讀的學校在「內部獎金
// 設定」查對應費率，5 個角色都看學生自己指派的負責人（StudentsPage.jsx
// 的 assignedBizDev/assignedAdminSupervisor/assignedAdminRecruit/
// assignedAdminVisa/assignedFieldStaff）；另外再加上「學校費用設定」
// 設定的「學校代表獎金（一次性）」，加到該校的學校代表身上。5 個角色＋
// 學校代表都各自可能用不同幣別（InternalBonusRateSetupPage.jsx/
// SchoolSetupPage.jsx 各自設定），同一個人底下可能同時有不同幣別的金額，
// 不能直接加總成一個數字，改成依幣別分開加總（totalsByCurrency），頁面
// 顯示時再依幣別分行列出。
export function computeIndonesiaInternalBonusByPerson(ctx) {
  const { students, bonusRateSetup, departureTransport, schools } = ctx;
  const departureDateByStudent = {};
  (departureTransport || []).forEach((d) => {
    if (d.studentId && d.date) departureDateByStudent[d.studentId] = d.date;
  });

  const monthGroups = {};
  function groupFor(month) {
    return (monthGroups[month] ||= {});
  }
  function addAmount(personTotals, name, amount, currency, detail) {
    if (!name || !amount) return;
    const entry = (personTotals[name] ||= { name, totalsByCurrency: {}, breakdown: [] });
    entry.totalsByCurrency[currency] = (entry.totalsByCurrency[currency] || 0) + amount;
    entry.breakdown.push(detail);
  }

  (students || []).filter((s) => departureDateByStudent[s.id]).forEach((s) => {
    const month = departureDateByStudent[s.id].slice(0, 7);
    const personTotals = groupFor(month);
    const pair = studentProjectClientPair(s.id, ctx);
    const rate = rateForSchool(bonusRateSetup, s.school);
    const studentName = studentFullLabel(s);

    VN_STUDENT_ASSIGNED_ROLE_KEYS.forEach((k) => {
      const name = s[VN_STUDENT_FIELD_BY_ROLE_KEY[k]];
      const rateVal = rate ? (Number(rate[k]) || 0) : 0;
      if (!name || !rateVal) return;
      const currency = (rate && rate[`${k}Currency`]) || VN_DEFAULT_CURRENCY;
      addAmount(personTotals, name, rateVal, currency, { student: studentName, client: pair?.client || '', role: roleLabel(k), amount: rateVal, currency });
    });

    const sc = findSchool(schools, s.school);
    const oneTimeVal = Number(sc?.oneTimeBonus) || 0;
    if (sc?.schoolRep && oneTimeVal) {
      const currency = sc.oneTimeBonusCurrency || VN_DEFAULT_CURRENCY;
      addAmount(personTotals, sc.schoolRep, oneTimeVal, currency, { student: studentName, client: pair?.client || '', role: '學校代表', amount: oneTimeVal, currency });
    }
  });

  function sortByTotal(personTotals) {
    const sum = (totals) => Object.values(totals).reduce((acc, v) => acc + v, 0);
    return Object.values(personTotals).sort((a, b) => sum(b.totalsByCurrency) - sum(a.totalsByCurrency));
  }

  return Object.keys(monthGroups).sort().map((month) => ({ month, byPerson: sortByTotal(monthGroups[month]) }));
}

// 學校代表獎金：依學校費用設定(indonesia_schoolSetup)設定的學校代表＋月費率，
// 乘以該校每位學生這個月在台天數比例，依學校分組顯示；幣別就是那所學校
// 設定的月費率幣別（跟上面一次性獎金的幣別是分開的兩個欄位，可以不同）。
// 在台天數要看境外生系統「在台簽證追蹤」(tsaipei_inTaiwanVisa) 的入境/
// 離境日期——印尼系統自己的 indonesia_inTaiwanVisa 目前整個系統沒有任何
// 地方會真的寫入入境/離境日期，一直是空的，實際日期都記在境外生系統
// 那邊，要先用 tsaipeiIdOf() 把學生換成對應的境外生 id 才查得到。
export function computeIndonesiaSchoolRepBonusForMonth(monthStr, ctx) {
  const range = monthRange(monthStr);
  if (!range) return [];
  const { students, inTaiwanVisaRecords, schools } = ctx;
  const rows = {};
  (schools || []).forEach((sc) => {
    if (!sc.schoolRep || !Number(sc.monthlyFee)) return;
    const key = normalizeSchoolName(sc.name);
    if (!key) return;
    rows[key] = { schoolName: sc.name, schoolRep: sc.schoolRep, amount: 0, currency: sc.monthlyFeeCurrency || VN_DEFAULT_CURRENCY, totalDays: 0, breakdown: [] };
  });
  (students || []).forEach((s) => {
    const row = rows[normalizeSchoolName(s.school)];
    if (!row) return;
    const tsaipeiId = tsaipeiIdOf(s);
    if (!tsaipeiId) return;
    const days = studentDaysInTaiwanForMonth(tsaipeiId, monthStr, inTaiwanVisaRecords);
    if (days <= 0) return;
    const sc = findSchool(schools, s.school);
    const rateVal = Number(sc?.monthlyFee) || 0;
    if (!rateVal) return;
    const amount = Math.round((rateVal / range.daysInMonth) * days);
    row.totalDays += days;
    row.amount += amount;
    row.breakdown.push({ student: studentFullLabel(s), days, amount });
  });
  Object.values(rows).forEach((r) => r.breakdown.sort((a, b) => b.amount - a.amount));
  return Object.values(rows).filter((r) => r.totalDays > 0).sort((a, b) => a.schoolName.localeCompare(b.schoolName));
}

