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

export function computeClientBillingForMonth(monthStr, ctx) {
  const range = monthRange(monthStr);
  if (!range) return [];
  const { clientFeeSetupRecords } = ctx;
  const groups = buildMonthlyProjectClientDayTotals(monthStr, ctx);
  return Object.values(groups).map((g) => {
    const rate = clientFeeSetupRecords.find((r) => (r.projectCode || '') === g.projectCode && r.client === g.client);
    const billDorm = !rate || rate.billDormFee !== '否';
    const amounts = {};
    let total = 0;
    CLIENT_FEE_KEYS.forEach((k) => {
      if (!billDorm && DORM_FEE_KEYS.includes(k)) { amounts[k] = 0; return; }
      const rateVal = rate ? (Number(rate[k]) || 0) : 0;
      const amt = rateVal ? Math.round((rateVal / range.daysInMonth) * g.totalDays) : 0;
      amounts[k] = amt;
      total += amt;
    });
    return { projectCode: g.projectCode, client: g.client, totalDays: g.totalDays, amounts, total };
  }).sort((a, b) => (a.client || '').localeCompare(b.client || ''));
}

export function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}
