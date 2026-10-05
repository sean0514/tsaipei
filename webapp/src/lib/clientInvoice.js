// Ported from generateClientInvoice/buildInvoiceSummarySheet_/
// buildInvoiceDetailSheet_ in apps-script/Code.gs.

import { resolveFixedChargeMonth, studentAdmitDate } from './bonus';

export const COMPANY_INFO = {
  name: '鈞羽有限公司',
  addressZh: '新北市板橋區文化路2段90號5樓',
  addressEn: '5F., No.90, Sec. 2, Wenhua Rd., Banqiao Dist., New Taipei City 220, Taiwan (R.O.C.)',
  bank: '玉山銀行 板橋分行 808-1171',
  account: '鈞羽有限公司',
  accountNumber: '1171-940-046586',
  contactName: '陳韋廷',
  tel: '0937460893 ; 02-6637-3899 # 79',
  email: 'wtaman1001@gmail.com、manatee@tsaipei.com',
};

function monthRangeYMD(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start, end, daysInMonth: end.getDate(), year: y, month: m };
}

function dateOverlapDays(rangeStart, rangeEnd, entryStr, exitStr) {
  if (!entryStr) return 0;
  const entry = new Date(`${entryStr}T00:00:00`);
  if (Number.isNaN(entry.getTime())) return 0;
  const exit = exitStr ? new Date(`${exitStr}T00:00:00`) : rangeEnd;
  const s = entry < rangeStart ? rangeStart : entry;
  const e = exit > rangeEnd ? rangeEnd : exit;
  if (e < s) return 0;
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

function studentDaysInTaiwan(visaRecords, studentId, range) {
  const v = visaRecords.find((x) => x.studentId === studentId);
  if (!v) return 0;
  return dateOverlapDays(range.start, range.end, v.firstEntryDate, v.firstExitDate)
    + dateOverlapDays(range.start, range.end, v.secondEntryDate, v.secondExitDate);
}

function studentStintDates(visaRecords, studentId, range) {
  const v = visaRecords.find((x) => x.studentId === studentId);
  if (!v) return { start: '', end: '' };
  if (dateOverlapDays(range.start, range.end, v.firstEntryDate, v.firstExitDate) > 0) {
    return { start: v.firstEntryDate || '', end: v.firstExitDate || '' };
  }
  if (dateOverlapDays(range.start, range.end, v.secondEntryDate, v.secondExitDate) > 0) {
    return { start: v.secondEntryDate || '', end: v.secondExitDate || '' };
  }
  return { start: v.firstEntryDate || '', end: v.firstExitDate || '' };
}

function studentPositionFor(studentId, { matches, admittedList, positions }) {
  const a = admittedList.find((x) => {
    const m = matches.find((mm) => mm.id === x.matchId);
    return m && m.studentId === studentId;
  });
  let m = a ? matches.find((mm) => mm.id === a.matchId) : null;
  if (!m) m = matches.find((mm) => mm.studentId === studentId);
  if (!m) return null;
  return positions.find((pp) => pp.id === m.positionId) || null;
}

export function computeClientInvoice(projectCode, client, monthStr, ctx) {
  const { students, clientFeeSetupRecords, inTaiwanVisaRecords } = ctx;
  const range = monthRangeYMD(monthStr);
  const feeSetup = clientFeeSetupRecords.find((r) => (r.projectCode || '') === (projectCode || '') && r.client === client);

  const rows = [];
  let no = 1;
  let earliestDate = null;
  students.forEach((s) => {
    const p = studentPositionFor(s.id, ctx);
    if (!p || (p.projectCode || '') !== (projectCode || '') || p.company !== client) return;

    const v = inTaiwanVisaRecords.find((x) => x.studentId === s.id);
    if (v?.firstEntryDate) {
      const d = new Date(`${v.firstEntryDate}T00:00:00`);
      if (!Number.isNaN(d.getTime()) && (!earliestDate || d < earliestDate)) earliestDate = d;
    }

    const days = studentDaysInTaiwan(inTaiwanVisaRecords, s.id, range);

    // 固定制的辦件費是一次性款項，依第一次/第二次收費時間規則各自落在某一
    // 個月整筆收取，不是按月比例分攤；這筆費用可能落在學生當月在台天數為
    // 0 的月份（例如確認錄取當月就先收第一筆款項），所以要獨立判斷是否要
    // 把這個學生留在這份請款明細裡。
    const isFixed = feeSetup?.billingType === '固定制';
    let fixedCharge = 0;
    if (isFixed) {
      const chargeCtx = { firstEntryDate: v?.firstEntryDate, secondEntryDate: v?.secondEntryDate, admitDate: studentAdmitDate(s.id, ctx) };
      if (resolveFixedChargeMonth(feeSetup.firstChargeDate, chargeCtx) === monthStr) fixedCharge += Number(feeSetup.firstChargeAmount) || 0;
      if (resolveFixedChargeMonth(feeSetup.secondChargeDate, chargeCtx) === monthStr) fixedCharge += Number(feeSetup.secondChargeAmount) || 0;
    }
    if (days <= 0 && !fixedCharge) return;
    const stint = days > 0 ? studentStintDates(inTaiwanVisaRecords, s.id, range) : { start: v?.firstEntryDate || '', end: v?.firstExitDate || '' };

    const serviceFee = feeSetup?.monthlyServiceFee ? Math.round((Number(feeSetup.monthlyServiceFee) / range.daysInMonth) * days) : 0;
    const dormManageFee = feeSetup?.monthlyDormManageFee ? Math.round((Number(feeSetup.monthlyDormManageFee) / range.daysInMonth) * days) : 0;
    const dormFee = feeSetup?.monthlyDormFee ? Math.round((Number(feeSetup.monthlyDormFee) / range.daysInMonth) * days) : 0;
    const processingFee = isFixed ? fixedCharge : (feeSetup?.monthlyProcessingFee ? Math.round((Number(feeSetup.monthlyProcessingFee) / range.daysInMonth) * days) : 0);

    rows.push({
      no: no++, name: s.originalName || s.chineseName || '', passport: s.passportNumber || '',
      startDate: stint.start, endDate: stint.end, days, serviceFee, dormManageFee, dormFee, processingFee,
      total: serviceFee + dormManageFee + dormFee + processingFee,
    });
  });

  if (!rows.length) return null;

  let periodNumber = 1;
  if (earliestDate) {
    periodNumber = (range.year - earliestDate.getFullYear()) * 12 + (range.month - (earliestDate.getMonth() + 1)) + 1;
    if (periodNumber < 1) periodNumber = 1;
  }
  const periodLabel = `第${periodNumber}期`;

  // 辦件費是含稅金額，不再加稅；服務費/宿管費/宿舍費是未稅金額，稅金只算
  // 這三項的 5%。小計(subtotal)維持含辦件費的總額，請款總額＝小計＋稅金。
  const subtotal = rows.reduce((sum, r) => sum + r.total, 0);
  const taxableSubtotal = rows.reduce((sum, r) => sum + r.serviceFee + r.dormManageFee + r.dormFee, 0);
  const tax = Math.round(taxableSubtotal * 0.05);
  const grandTotal = subtotal + tax;

  return { rows, range, periodLabel, subtotal, tax, grandTotal, taxId: feeSetup?.taxId || '' };
}
