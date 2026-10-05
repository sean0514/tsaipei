// Ported from apps-script/Index.html's real-time calc functions
// (monthRange, dateOverlapDays, studentDaysInTaiwanForMonth,
// computeInternalBonusForMonth, computeClientBillingForMonth, …).
// Nothing here is stored — every page calls these fresh off live collections,
// same "never persisted, always recomputed on render" behavior as the original.

export const BONUS_ROLE_KEYS = [
  'bizDev', 'serviceSupervisor', 'serviceSpecialist', 'translationSupervisor', 'translationSpecialist',
  'adminSupervisor', 'adminSpecialist', 'accountant', 'accountantAssistant', 'dormManager1', 'dormManager2',
];
export const BONUS_ROLE_LABELS = ['開發業務', '服務主管', '服務專員', '翻譯主管', '翻譯專員', '行政主管', '行政專員', '會計人員', '會計助理', '宿管人員1', '宿管人員2'];

export function monthRange(monthStr) {
  const [y, m] = (monthStr || '').split('-').map(Number);
  if (!y || !m) return null;
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start, end, daysInMonth: end.getDate() };
}

export function dateOverlapDays(rangeStart, rangeEnd, entryStr, exitStr) {
  if (!entryStr) return 0;
  const entry = new Date(entryStr + 'T00:00:00');
  if (Number.isNaN(entry.getTime())) return 0;
  const exit = exitStr ? new Date(exitStr + 'T00:00:00') : rangeEnd;
  const s = entry < rangeStart ? rangeStart : entry;
  const e = exit > rangeEnd ? rangeEnd : exit;
  if (e < s) return 0;
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

export function studentDaysInTaiwanForMonth(studentId, monthStr, inTaiwanVisaRecords) {
  const range = monthRange(monthStr);
  if (!range) return 0;
  const v = inTaiwanVisaRecords.find((x) => x.studentId === studentId);
  if (!v) return 0;
  return dateOverlapDays(range.start, range.end, v.firstEntryDate, v.firstExitDate)
    + dateOverlapDays(range.start, range.end, v.secondEntryDate, v.secondExitDate);
}

export function studentProjectClientPair(studentId, { admittedList, matches, positions }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((x) => x.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((x) => x.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  if (!m) return null;
  const p = positions.find((x) => x.id === m.positionId);
  if (!p || !p.company) return null;
  return { projectCode: p.projectCode || '', client: p.company };
}

export function studentAdmitDate(studentId, { admittedList, matches }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((x) => x.id === a.matchId);
    return m && m.studentId === studentId;
  });
  return admitted?.admitDate || '';
}

function addMonthsToYearMonth(dateStr, months) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
}

const CHARGE_TIMING_SHIFT_MONTHS = { '入境3個月收取': 3, '入境6個月收取': 6, '入境9個月收取': 9, '入境12個月收取': 12 };

// 固定制的辦件費分兩筆一次性款項，各自有收費時間規則（相對學生入境或錄取
// 時間點），不是按月比例分攤；回傳該規則落在哪個月份（YYYY-MM），沒有對應
// 日期或規則就回傳 null（該月不收取）。
export function resolveFixedChargeMonth(timing, { firstEntryDate, secondEntryDate, admitDate } = {}) {
  if (!timing) return null;
  if (timing === '第一次入境當月收取') return firstEntryDate ? firstEntryDate.slice(0, 7) : null;
  if (timing === '第二次入境當月收取') return secondEntryDate ? secondEntryDate.slice(0, 7) : null;
  if (timing === '確認錄取即收取') return admitDate ? admitDate.slice(0, 7) : null;
  if (CHARGE_TIMING_SHIFT_MONTHS[timing]) return addMonthsToYearMonth(firstEntryDate, CHARGE_TIMING_SHIFT_MONTHS[timing]);
  return null;
}

export function rolesForProjectClient(projectCode, client, positions) {
  const matching = positions.filter((p) => (p.projectCode || '') === projectCode && p.company === client);
  const roles = {};
  BONUS_ROLE_KEYS.forEach((k) => {
    roles[k] = [...new Set(matching.map((p) => p[k]).filter(Boolean))].join('、');
  });
  return roles;
}

export function buildMonthlyProjectClientDayTotals(monthStr, ctx) {
  const { students, inTaiwanVisaRecords } = ctx;
  const groups = {};
  students.forEach((s) => {
    const pair = studentProjectClientPair(s.id, ctx);
    if (!pair) return;
    const days = studentDaysInTaiwanForMonth(s.id, monthStr, inTaiwanVisaRecords);
    if (days <= 0) return;
    const key = `${pair.projectCode}||${pair.client}`;
    (groups[key] ||= { projectCode: pair.projectCode, client: pair.client, totalDays: 0 }).totalDays += days;
  });
  return groups;
}

export function computeInternalBonusForMonth(monthStr, ctx) {
  const range = monthRange(monthStr);
  if (!range) return [];
  const { positions, internalFeeSetupRecords } = ctx;
  const groups = buildMonthlyProjectClientDayTotals(monthStr, ctx);
  return Object.values(groups).map((g) => {
    const rate = internalFeeSetupRecords.find((r) => (r.projectCode || '') === g.projectCode && r.client === g.client);
    const roles = rolesForProjectClient(g.projectCode, g.client, positions);
    const amounts = {};
    BONUS_ROLE_KEYS.forEach((k) => {
      const rateVal = rate ? (Number(rate[k]) || 0) : 0;
      amounts[k] = rateVal ? Math.round((rateVal / range.daysInMonth) * g.totalDays) : 0;
    });
    return { projectCode: g.projectCode, client: g.client, totalDays: g.totalDays, roles, amounts };
  }).sort((a, b) => (a.client || '').localeCompare(b.client || ''));
}

export function computeInternalBonusByPersonForMonth(monthStr, ctx) {
  const rows = computeInternalBonusForMonth(monthStr, ctx);
  const personTotals = {};
  rows.forEach((r) => {
    BONUS_ROLE_KEYS.forEach((k, i) => {
      const name = r.roles[k];
      const amt = r.amounts[k];
      if (!name || !amt) return;
      const entry = (personTotals[name] ||= { name, total: 0, breakdown: [] });
      entry.total += amt;
      entry.breakdown.push({ client: r.client, projectCode: r.projectCode, role: BONUS_ROLE_LABELS[i], amount: amt });
    });
  });
  return Object.values(personTotals).sort((a, b) => b.total - a.total);
}

const CLIENT_FEE_KEYS = ['monthlyProcessingFee', 'monthlyServiceFee', 'monthlyDormFee', 'monthlyDormManageFee'];
const DORM_FEE_KEYS = ['monthlyDormFee', 'monthlyDormManageFee'];

// 固定制的辦件費不是按月比例分攤，是依「第一次收費時間／第二次收費時間」
// 規則各自落在某一個月整筆收取（預設是第一次入境當月、第二次入境當月，
// 也可以設定成入境滿 3/6/9/12 個月或確認錄取即收取）；這裡把每個學生自己
// 符合這個月份的那一筆（或兩筆）固定收費加總進對應的實習單位群組，跟服務
// 費/宿舍費/宿管費那種每月比例分攤的費用分開算，最後合併顯示在同一個
// 「辦件費」欄位（amounts.monthlyProcessingFee）。
function buildFixedChargeTotals(monthStr, ctx) {
  const { students, inTaiwanVisaRecords, clientFeeSetupRecords } = ctx;
  const totals = {};
  students.forEach((s) => {
    const pair = studentProjectClientPair(s.id, ctx);
    if (!pair) return;
    const rate = clientFeeSetupRecords.find((r) => (r.projectCode || '') === pair.projectCode && r.client === pair.client);
    if (!rate || rate.billingType !== '固定制') return;
    const visa = inTaiwanVisaRecords.find((v) => v.studentId === s.id) || {};
    const admitDate = studentAdmitDate(s.id, ctx);
    let charge = 0;
    if (resolveFixedChargeMonth(rate.firstChargeDate, { ...visa, admitDate }) === monthStr) charge += Number(rate.firstChargeAmount) || 0;
    if (resolveFixedChargeMonth(rate.secondChargeDate, { ...visa, admitDate }) === monthStr) charge += Number(rate.secondChargeAmount) || 0;
    if (!charge) return;
    const key = `${pair.projectCode}||${pair.client}`;
    totals[key] = (totals[key] || 0) + charge;
  });
  return totals;
}

export function computeClientBillingForMonth(monthStr, ctx) {
  const range = monthRange(monthStr);
  if (!range) return [];
  const { clientFeeSetupRecords } = ctx;
  const groups = buildMonthlyProjectClientDayTotals(monthStr, ctx);
  const fixedCharges = buildFixedChargeTotals(monthStr, ctx);
  // 固定制學生的固定收費可能落在沒有當月在台天數的月份（例如確認錄取就先
  // 收第一筆款項），這種情況也要補一個群組才能顯示這筆費用。
  Object.keys(fixedCharges).forEach((key) => {
    if (groups[key]) return;
    const [projectCode, client] = key.split('||');
    groups[key] = { projectCode, client, totalDays: 0 };
  });
  return Object.values(groups).map((g) => {
    const key = `${g.projectCode}||${g.client}`;
    const rate = clientFeeSetupRecords.find((r) => (r.projectCode || '') === g.projectCode && r.client === g.client);
    const isFixed = rate?.billingType === '固定制';
    const billDorm = !rate || rate.billDormFee !== '否';
    const amounts = {};
    CLIENT_FEE_KEYS.forEach((k) => {
      if (!billDorm && DORM_FEE_KEYS.includes(k)) { amounts[k] = 0; return; }
      if (k === 'monthlyProcessingFee' && isFixed) { amounts[k] = fixedCharges[key] || 0; return; }
      const rateVal = rate ? (Number(rate[k]) || 0) : 0;
      amounts[k] = rateVal ? Math.round((rateVal / range.daysInMonth) * g.totalDays) : 0;
    });
    // 辦件費是含稅金額，不用再加稅；服務費/宿舍費/宿管費是未稅金額，稅金只
    // 算這三項的 5%。合計＝辦件費(含稅) + 服務費/宿舍費/宿管費(未稅) + 稅金。
    const taxableAmount = amounts.monthlyServiceFee + amounts.monthlyDormFee + amounts.monthlyDormManageFee;
    const tax = Math.round(taxableAmount * 0.05);
    const total = amounts.monthlyProcessingFee + taxableAmount + tax;
    return { projectCode: g.projectCode, client: g.client, totalDays: g.totalDays, amounts, tax, total };
  }).sort((a, b) => (a.client || '').localeCompare(b.client || ''));
}

export function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}
