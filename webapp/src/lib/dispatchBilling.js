// 比照 lib/bonus.js 的月份比例試算模式，改以「在職/離職概況」的到職/離職日
// 取代學生的入境/離境日，用同一套 monthRange/dateOverlapDays 邏輯計算每個
// 客戶當月的在職人力天數，再依「客戶費用建檔」「內部費用建檔」的月費率換算。
import { monthRange, dateOverlapDays, currentMonthStr } from './bonus';

export { currentMonthStr };

export function employeeDaysInMonth(record, monthStr) {
  const range = monthRange(monthStr);
  if (!range || !record.startDate) return 0;
  return dateOverlapDays(range.start, range.end, record.startDate, record.endDate);
}

// 依客戶把所有在職紀錄當月天數加總。
export function buildMonthlyClientDayTotals(monthStr, employmentStatusRecords) {
  const groups = {};
  employmentStatusRecords.forEach((r) => {
    if (!r.client) return;
    const days = employeeDaysInMonth(r, monthStr);
    if (days <= 0) return;
    (groups[r.client] ||= { client: r.client, totalDays: 0, headcount: 0 }).totalDays += days;
    groups[r.client].headcount += 1;
  });
  return groups;
}

export function computeClientBillingForMonth(monthStr, { employmentStatusRecords, clientFeeSetupRecords }) {
  const range = monthRange(monthStr);
  if (!range) return [];
  const groups = buildMonthlyClientDayTotals(monthStr, employmentStatusRecords);
  return Object.values(groups).map((g) => {
    const rate = clientFeeSetupRecords.find((r) => r.client === g.client);
    let amount = 0;
    if (rate) {
      if (rate.billingType === '固定制') amount = Number(rate.fixedFee) || 0;
      else amount = Math.round(((Number(rate.monthlyServiceFee) || 0) / range.daysInMonth) * g.totalDays);
    }
    return { client: g.client, totalDays: g.totalDays, headcount: g.headcount, billingType: rate?.billingType || '', amount };
  }).sort((a, b) => (a.client || '').localeCompare(b.client || ''));
}

export function computeInternalBonusForMonth(monthStr, { employmentStatusRecords, internalFeeSetupRecords }) {
  const range = monthRange(monthStr);
  if (!range) return [];
  const groups = buildMonthlyClientDayTotals(monthStr, employmentStatusRecords);
  return Object.values(groups).map((g) => {
    const rate = internalFeeSetupRecords.find((r) => r.client === g.client);
    const monthlyRate = rate ? Number(rate.monthlyRate) || 0 : 0;
    const amount = monthlyRate ? Math.round((monthlyRate / range.daysInMonth) * g.totalDays) : 0;
    return { client: g.client, totalDays: g.totalDays, headcount: g.headcount, salesPerson: rate?.salesPerson || '', amount };
  }).sort((a, b) => (a.client || '').localeCompare(b.client || ''));
}

export function computeInternalBonusByPersonForMonth(monthStr, ctx) {
  const rows = computeInternalBonusForMonth(monthStr, ctx);
  const personTotals = {};
  rows.forEach((r) => {
    if (!r.salesPerson || !r.amount) return;
    const entry = (personTotals[r.salesPerson] ||= { name: r.salesPerson, total: 0, breakdown: [] });
    entry.total += r.amount;
    entry.breakdown.push({ client: r.client, amount: r.amount });
  });
  return Object.values(personTotals).sort((a, b) => b.total - a.total);
}
