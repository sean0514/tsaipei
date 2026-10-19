// Ported from apps-script/Index.html's real-time calc functions
// (monthRange, dateOverlapDays, studentDaysInTaiwanForMonth,
// computeInternalBonusForMonth, computeClientBillingForMonth, …).
// Nothing here is stored — every page calls these fresh off live collections,
// same "never persisted, always recomputed on render" behavior as the original.

export const BONUS_ROLE_KEYS = [
  'bizDev', 'overseasRep', 'serviceSupervisor', 'serviceSpecialist', 'translationSupervisor', 'translationSpecialist',
  'adminSupervisor', 'adminSpecialist', 'accountant', 'accountantAssistant', 'dormManager1', 'dormManager2',
];
export const BONUS_ROLE_LABELS = ['開發業務', '國外代表', '服務主管', '服務專員', '翻譯主管', '翻譯專員', '行政主管', '行政專員', '會計人員', '會計助理', '宿管人員1', '宿管人員2'];

// 宿管人員1/2 改成依「宿舍管理」設定的宿管1/宿管2計算（見
// computeDormManagerBonusForMonth），不再跟著學生的實習單位(專案+客戶)走，
// 這裡的主表（依實習單位分列）只保留其餘角色。
export const PROJECT_CLIENT_BONUS_ROLE_KEYS = BONUS_ROLE_KEYS.filter((k) => k !== 'dormManager1' && k !== 'dormManager2');
export const PROJECT_CLIENT_BONUS_ROLE_LABELS = PROJECT_CLIENT_BONUS_ROLE_KEYS.map((k) => BONUS_ROLE_LABELS[BONUS_ROLE_KEYS.indexOf(k)]);

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

// 學生這個月「廠商代付」住宿紀錄的天數——客戶請款計算的宿舍費/宿管費只能
// 跟學生實際住「廠商代付」宿舍的天數掛鉤。學生自己付宿舍費（payer 是
// 「學生自付」）的期間，公司沒有實際付出宿舍成本，不應該再跟客戶收這筆
// 錢，所以宿舍費/宿管費不能像辦件費/服務費一樣直接用在台天數算。同一個
// 學生這個月如果有多筆廠商代付住宿紀錄（例如搬宿舍）天數直接加總。
export function studentForeignPaidDormDaysForMonth(studentId, monthStr, housingRecords) {
  const range = monthRange(monthStr);
  if (!range) return 0;
  return (housingRecords || [])
    .filter((h) => h.studentId === studentId && h.payer === '廠商代付')
    .reduce((sum, h) => sum + dateOverlapDays(range.start, range.end, h.checkIn, h.checkOut), 0);
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
    PROJECT_CLIENT_BONUS_ROLE_KEYS.forEach((k) => {
      const rateVal = rate ? (Number(rate[k]) || 0) : 0;
      amounts[k] = rateVal ? Math.round((rateVal / range.daysInMonth) * g.totalDays) : 0;
    });
    return { projectCode: g.projectCode, client: g.client, totalDays: g.totalDays, roles, amounts };
  }).sort((a, b) => (a.client || '').localeCompare(b.client || ''));
}

// 宿管人員1/2 改成依「宿舍管理」設定的宿管1/宿管2計算：看這個月誰實際住在
// 哪間宿舍、住了幾天（跟住宿安排/學生請款計算同一套天數判斷，但宿管獎金
// 固定除以 30 天，不是當月實際天數），乘以該學生自己實習單位(專案+客戶)
// 內部費用建檔的「宿管人員1/宿管人員2」月費率 ÷ 30，加總到宿舍設定的宿管
// 1/宿管2身上。
export function computeDormManagerBonusForMonth(monthStr, ctx) {
  const range = monthRange(monthStr);
  if (!range) return [];
  const { dormitories, housingRecords, internalFeeSetupRecords } = ctx;
  return (dormitories || [])
    .filter((d) => !d.confirmedClosed && (d.manager1 || d.manager2))
    .map((d) => {
      let manager1Amount = 0;
      let manager2Amount = 0;
      let totalResidentDays = 0;
      (housingRecords || []).forEach((h) => {
        // h.completed 只是「住宿安排」頁面把已離宿的紀錄從作業清單隱藏掉的
        // 歸檔標記，不代表這筆住宿財務上沒發生過，不能排除，否則舊紀錄一被
        // 標記完成，宿管獎金就會從已經發生過的月份裡憑空消失。
        if (h.type !== d.name) return;
        const days = dateOverlapDays(range.start, range.end, h.checkIn, h.checkOut);
        if (days <= 0) return;
        totalResidentDays += days;
        const pair = studentProjectClientPair(h.studentId, ctx);
        if (!pair) return;
        const rate = internalFeeSetupRecords.find((r) => (r.projectCode || '') === pair.projectCode && r.client === pair.client);
        if (!rate) return;
        if (d.manager1) manager1Amount += Math.round(((Number(rate.dormManager1) || 0) / 30) * days);
        if (d.manager2) manager2Amount += Math.round(((Number(rate.dormManager2) || 0) / 30) * days);
      });
      return { dormId: d.id, dormName: d.name, manager1: d.manager1 || '', manager2: d.manager2 || '', manager1Amount, manager2Amount, totalResidentDays };
    })
    .filter((r) => r.totalResidentDays > 0)
    .sort((a, b) => a.dormName.localeCompare(b.dormName));
}

export function computeInternalBonusByPersonForMonth(monthStr, ctx) {
  const rows = computeInternalBonusForMonth(monthStr, ctx);
  const personTotals = {};
  rows.forEach((r) => {
    PROJECT_CLIENT_BONUS_ROLE_KEYS.forEach((k) => {
      const name = r.roles[k];
      const amt = r.amounts[k];
      if (!name || !amt) return;
      const entry = (personTotals[name] ||= { name, total: 0, breakdown: [] });
      entry.total += amt;
      entry.breakdown.push({ client: r.client, projectCode: r.projectCode, role: BONUS_ROLE_LABELS[BONUS_ROLE_KEYS.indexOf(k)], amount: amt });
    });
  });
  const dormRows = computeDormManagerBonusForMonth(monthStr, ctx);
  dormRows.forEach((d) => {
    [['manager1', d.manager1, d.manager1Amount, '宿管人員1'], ['manager2', d.manager2, d.manager2Amount, '宿管人員2']].forEach(([, name, amt, roleLabel]) => {
      if (!name || !amt) return;
      const entry = (personTotals[name] ||= { name, total: 0, breakdown: [] });
      entry.total += amt;
      entry.breakdown.push({ client: d.dormName, projectCode: '', role: roleLabel, amount: amt });
    });
  });
  return Object.values(personTotals).sort((a, b) => b.total - a.total);
}

const CLIENT_FEE_KEYS = ['monthlyProcessingFee', 'monthlyServiceFee', 'monthlyDormFee', 'monthlyDormManageFee'];
const DORM_FEE_KEYS = ['monthlyDormFee', 'monthlyDormManageFee'];

// 日常支出申請選了「須請款(實習單位)」且已核准/已匯款的「支出」類型紀錄，
// 併入該實習單位當月的客戶請款裡：開「鈞羽發票」的要算稅(跟服務費/宿舍費/
// 宿管費一起算5%)，開「供應商發票」或「無須發票」的不計稅，直接加進合計
// 總額；「收入」類型的紀錄是向學生收的錢，不是代墊給客戶的費用，不計入。
export const NOT_BILLABLE = '不須請款';
const DAILY_EXPENSE_BILLABLE_STATUSES = ['已核准', '已匯款'];
const JUNYU_INVOICE_TYPE = '鈞羽發票';

export function buildDailyExpenseChargeTotals(monthStr, ctx) {
  const { dailyExpenseApplications, positions } = ctx;
  const totals = {};
  (dailyExpenseApplications || []).forEach((app) => {
    if ((app.type || '支出') === '收入') return;
    if (!app.billToCompany || app.billToCompany === NOT_BILLABLE) return;
    if (!DAILY_EXPENSE_BILLABLE_STATUSES.includes(app.status)) return;
    if ((app.date || '').slice(0, 7) !== monthStr) return;
    const amount = Number(app.amount) || 0;
    if (!amount) return;
    let projectCode = '';
    if (app.studentId) {
      const pair = studentProjectClientPair(app.studentId, ctx);
      if (pair && pair.client === app.billToCompany) projectCode = pair.projectCode;
    }
    if (!projectCode) {
      const p = (positions || []).find((pp) => pp.company === app.billToCompany);
      projectCode = p?.projectCode || '';
    }
    const key = `${projectCode}||${app.billToCompany}`;
    const entry = (totals[key] ||= { junyuTotal: 0, supplierTotal: 0, items: [] });
    const taxable = app.invoiceType === JUNYU_INVOICE_TYPE;
    if (taxable) entry.junyuTotal += amount; else entry.supplierTotal += amount;
    entry.items.push({ studentId: app.studentId || '', item: app.item || '', amount, date: app.date || '', currency: app.currency || '台幣', invoiceType: app.invoiceType || '', taxable });
  });
  return totals;
}

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

function parseOtherFeesJson(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// 宿舍管理「填寫其他費用」自訂項目可以各自標「廠商代付」或「學生自付」：
// 廠商代付的項目公司要跟客戶收回來，併入客戶請款計算，不能再跟學生收
// (見 StudentBillingPage 的 otherFeesTotal 排除同一批項目)；學生自付的
// 項目維持原本行為，只從學生請款計算收取，不跟客戶收。這裡平分到這個月
// 該宿舍所有「廠商代付」住戶身上(依人頭，跟學生請款計算水電瓦斯的分攤
// 方式一致)，再依各自的實習單位(專案+客戶)加總。
export function buildMonthlyProjectClientVendorOtherFeeTotals(monthStr, ctx) {
  const { dormitories, housingRecords, dormitoryUtilities } = ctx;
  const range = monthRange(monthStr);
  if (!range) return {};
  const totals = {};
  (dormitories || []).forEach((d) => {
    const u = (dormitoryUtilities || []).find((x) => x.dormitoryId === d.id && x.month === monthStr);
    if (!u) return;
    const vendorPaidTotal = parseOtherFeesJson(u.otherFees)
      .filter((f) => f.payer === '廠商代付')
      .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
    if (!vendorPaidTotal) return;
    const residents = (housingRecords || []).filter((h) =>
      h.type === d.name && h.payer === '廠商代付' && dateOverlapDays(range.start, range.end, h.checkIn, h.checkOut) > 0);
    if (!residents.length) return;
    const perHead = Math.round(vendorPaidTotal / residents.length);
    residents.forEach((h) => {
      const pair = studentProjectClientPair(h.studentId, ctx);
      if (!pair) return;
      const key = `${pair.projectCode}||${pair.client}`;
      totals[key] = (totals[key] || 0) + perHead;
    });
  });
  return totals;
}

// 水電瓦斯費是整間宿舍共用的費用，用「這個月住過這間宿舍的所有人數」當
// 分母算出每人每月應攤的金額(跟 StudentBillingPage 的 perHead 同一套算
// 法)，再依每筆住宿紀錄自己的「水電瓦斯付款方式」分流(沒填的話退回跟
// 「付款方式」(租金/宿舍費)同一個欄位，兩者可以獨立設定不同)：標「學生
// 自付」的份額維持跟學生收(學生請款計算)；標「廠商代付」的份額不跟學生
// 收(見 StudentBillingPage 排除)，改跟這個學生的實習單位(專案+客戶)請款，
// 當「代收代付」——純代墊、不加公司服務的費用，不計稅，比照代墊費用
// (供應商)直接加進合計總額、不計入未稅金額(小計)。
export function buildMonthlyProjectClientVendorUtilityTotals(monthStr, ctx) {
  const { dormitories, housingRecords, dormitoryUtilities } = ctx;
  const range = monthRange(monthStr);
  if (!range) return {};
  const totals = {};
  (dormitories || []).forEach((d) => {
    const u = (dormitoryUtilities || []).find((x) => x.dormitoryId === d.id && x.month === monthStr);
    if (!u) return;
    const utilityTotal = (Number(u.waterFee) || 0) + (Number(u.electricityFee) || 0) + (Number(u.gasFee) || 0);
    if (!utilityTotal) return;
    const allResidents = (housingRecords || []).filter((h) =>
      h.type === d.name && dateOverlapDays(range.start, range.end, h.checkIn, h.checkOut) > 0);
    if (!allResidents.length) return;
    const perHead = Math.round(utilityTotal / allResidents.length);
    allResidents.filter((h) => (h.utilityPayer || h.payer) === '廠商代付').forEach((h) => {
      const pair = studentProjectClientPair(h.studentId, ctx);
      if (!pair) return;
      const key = `${pair.projectCode}||${pair.client}`;
      totals[key] = (totals[key] || 0) + perHead;
    });
  });
  return totals;
}

// 宿舍費/宿管費的請款天數跟辦件費/服務費的「在台天數」脫鉤——只計算學生
// 這個月「廠商代付」住宿紀錄的天數（見 studentForeignPaidDormDaysForMonth），
// 學生自己付宿舍費的期間不跟客戶收這筆錢。
function buildMonthlyProjectClientDormDayTotals(monthStr, ctx) {
  const { students, housingRecords } = ctx;
  const groups = {};
  (students || []).forEach((s) => {
    const pair = studentProjectClientPair(s.id, ctx);
    if (!pair) return;
    const days = studentForeignPaidDormDaysForMonth(s.id, monthStr, housingRecords);
    if (days <= 0) return;
    const key = `${pair.projectCode}||${pair.client}`;
    (groups[key] ||= { totalDays: 0 }).totalDays += days;
  });
  return groups;
}

export function computeClientBillingForMonth(monthStr, ctx) {
  const range = monthRange(monthStr);
  if (!range) return [];
  const { clientFeeSetupRecords } = ctx;
  const groups = buildMonthlyProjectClientDayTotals(monthStr, ctx);
  const dormDayGroups = buildMonthlyProjectClientDormDayTotals(monthStr, ctx);
  const fixedCharges = buildFixedChargeTotals(monthStr, ctx);
  const dailyExpenseCharges = buildDailyExpenseChargeTotals(monthStr, ctx);
  const vendorOtherFeeCharges = buildMonthlyProjectClientVendorOtherFeeTotals(monthStr, ctx);
  const vendorUtilityCharges = buildMonthlyProjectClientVendorUtilityTotals(monthStr, ctx);
  // 固定制學生的固定收費、須請款的日常支出申請、廠商代付住宿天數、宿舍
  // 其他費用/水電瓦斯費(廠商代付)都可能落在沒有當月在台天數的月份，這種
  // 情況也要補一個群組才能顯示這筆費用。
  [fixedCharges, dailyExpenseCharges, dormDayGroups, vendorOtherFeeCharges, vendorUtilityCharges].forEach((charges) => {
    Object.keys(charges).forEach((key) => {
      if (groups[key]) return;
      const [projectCode, client] = key.split('||');
      groups[key] = { projectCode, client, totalDays: 0 };
    });
  });
  return Object.values(groups).map((g) => {
    const key = `${g.projectCode}||${g.client}`;
    const rate = clientFeeSetupRecords.find((r) => (r.projectCode || '') === g.projectCode && r.client === g.client);
    const isFixed = rate?.billingType === '固定制';
    const billDorm = !rate || rate.billDormFee !== '否';
    const dormDays = dormDayGroups[key]?.totalDays || 0;
    const amounts = {};
    CLIENT_FEE_KEYS.forEach((k) => {
      if (!billDorm && DORM_FEE_KEYS.includes(k)) { amounts[k] = 0; return; }
      if (k === 'monthlyProcessingFee' && isFixed) { amounts[k] = fixedCharges[key] || 0; return; }
      const rateVal = rate ? (Number(rate[k]) || 0) : 0;
      const days = DORM_FEE_KEYS.includes(k) ? dormDays : g.totalDays;
      amounts[k] = rateVal ? Math.round((rateVal / range.daysInMonth) * days) : 0;
    });
    const dailyExpenseJunyu = dailyExpenseCharges[key]?.junyuTotal || 0;
    const dailyExpenseSupplier = dailyExpenseCharges[key]?.supplierTotal || 0;
    amounts.dailyExpenseChargeJunyu = dailyExpenseJunyu;
    amounts.dailyExpenseChargeSupplier = dailyExpenseSupplier;
    // 宿舍其他費用(廠商代付)：跟宿舍費/宿管費一樣未稅、要計稅，不受
    // billDorm='否' 影響(那個設定只管「不跟這個客戶收宿舍費/宿管費月費
    // 率」，不影響實際發生的廠商代付雜支代墊)。
    const dormOtherFeeCharge = vendorOtherFeeCharges[key] || 0;
    amounts.dormOtherFeeCharge = dormOtherFeeCharge;
    // 代收代付(廠商代付的水電瓦斯費)：純粹代墊，沒有公司服務在裡面，
    // 比照代墊費用(供應商)不計稅，直接算進合計總額。
    const dormUtilityPassThrough = vendorUtilityCharges[key] || 0;
    amounts.dormUtilityPassThrough = dormUtilityPassThrough;
    // 辦件費/服務費/宿舍費/宿管費/宿舍其他費用(廠商代付)都是未稅金額，稅金
    // 算這些加上「代墊費用(鈞羽未稅)」的 5%；「代墊費用(供應商)」「代收代付」
    // 不計稅。合計＝以上未稅項目加總 + 稅金 + 代墊費用(供應商) + 代收代付。
    const taxableAmount = amounts.monthlyProcessingFee + amounts.monthlyServiceFee + amounts.monthlyDormFee + amounts.monthlyDormManageFee + dormOtherFeeCharge + dailyExpenseJunyu;
    const tax = Math.round(taxableAmount * 0.05);
    const total = taxableAmount + tax + dailyExpenseSupplier + dormUtilityPassThrough;
    return { projectCode: g.projectCode, client: g.client, totalDays: g.totalDays, amounts, tax, total, dailyExpenseItems: dailyExpenseCharges[key]?.items || [] };
  }).sort((a, b) => (a.client || '').localeCompare(b.client || ''));
}

export function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

export function currentYear() {
  return new Date().getFullYear();
}

const DORM_EQUIPMENT_ITEM = '宿舍設備';
const DORM_PNL_BILLABLE_STATUSES = ['已核准', '已匯款'];
const DORM_PROFIT_SHARE_RATE = 0.2;

// 損益細項欄位：收入(住宿費收入、宿舍設備收入)、成本(租金、房仲費、水費、
// 電費、瓦斯費、其他費用、宿舍設備支出)——月/宿舍/宿管1/全部宿舍這幾層
// 加總都用同一組欄位，避免每層各寫一次加總邏輯。
const DORM_PNL_INCOME_KEYS = ['housingIncome', 'dormManageFeeIncome', 'dormItemIncome'];
const DORM_PNL_COST_KEYS = ['rentCost', 'agentFeeCost', 'depositLossCost', 'waterCost', 'electricityCost', 'gasCost', 'otherUtilityCost', 'dormItemCost'];

function sumDormPnlEntries(entries) {
  const sum = {};
  [...DORM_PNL_INCOME_KEYS, ...DORM_PNL_COST_KEYS].forEach((k) => {
    sum[k] = entries.reduce((acc, e) => acc + (e[k] || 0), 0);
  });
  const income = DORM_PNL_INCOME_KEYS.reduce((acc, k) => acc + sum[k], 0);
  const cost = DORM_PNL_COST_KEYS.reduce((acc, k) => acc + sum[k], 0);
  const profit = income - cost;
  return { ...sum, income, cost, profit, bonus: Math.round(profit * DORM_PROFIT_SHARE_RATE) };
}

// 宿舍損益：收入＝住宿費收入(這個月住過這間宿舍的所有紀錄，依付款方式分流：
// 學生自付用住宿紀錄的每月租金(學生實際付的錢)；廠商代付改用該學生實習單位
// (專案+客戶)在「客戶費用建檔」設定的宿舍費費率(公司跟客戶實際收的錢)，不是
// 住宿紀錄上填的租金，兩者都 ÷ 當月天數 × 住在這間宿舍的天數；廠商代付的
// 住戶另外加計「客戶費用建檔」設定的宿管費費率，同樣 ÷ 當月天數 × 住在這
// 間宿舍的天數) + 日常支出申請(項目=宿舍設備、綁定這間宿舍、類型=收入、
// 已核准/已匯款)；成本＝租金
// (依租約在當月生效天數 ÷ 當月天數比例計算，起租/退租當月只算部分月份)
// + 房仲費(只算在起租月份) + 押金損失(押金金額－退還押金金額，算
// 在退還押金日期那個月) + 水費/電費/瓦斯費/其他費用(宿舍管理當月填寫的紀錄)
// + 日常支出申請(項目=宿舍設備、綁定這間宿舍、類型=支出、已核准/已匯款)；
// 利潤＝收入－成本；分紅＝利潤×20%。最後依宿舍在「宿舍管理」設定的宿管1
// 分類呈現。
export function computeDormProfitLossForYear(year, ctx) {
  const { dormitories, housingRecords, dormitoryUtilities, dailyExpenseApplications, clientFeeSetupRecords } = ctx;
  const dormResults = (dormitories || []).filter((d) => !d.confirmedClosed).map((d) => {
    const monthly = [];
    for (let m = 1; m <= 12; m++) {
      const monthStr = `${year}-${String(m).padStart(2, '0')}`;
      const range = monthRange(monthStr);

      let housingIncome = 0;
      let dormManageFeeIncome = 0;
      (housingRecords || []).forEach((h) => {
        // h.completed 只是「住宿安排」頁面把已離宿的紀錄從作業清單隱藏掉的
        // 歸檔標記，不代表這筆住宿財務上沒發生過，不能排除，否則舊紀錄一被
        // 標記完成，住宿費/宿管費收入就會從已經發生過的月份裡憑空消失。
        if (h.type !== d.name) return;
        const days = dateOverlapDays(range.start, range.end, h.checkIn, h.checkOut);
        if (days <= 0) return;
        if (h.payer === '廠商代付') {
          const pair = studentProjectClientPair(h.studentId, ctx);
          const rate = pair && (clientFeeSetupRecords || []).find((r) => (r.projectCode || '') === pair.projectCode && r.client === pair.client);
          if (!rate || rate.billDormFee === '否') return;
          const dormFeeRate = Number(rate.monthlyDormFee) || 0;
          housingIncome += dormFeeRate ? Math.round((dormFeeRate / range.daysInMonth) * days) : 0;
          const dormManageFeeRate = Number(rate.monthlyDormManageFee) || 0;
          dormManageFeeIncome += dormManageFeeRate ? Math.round((dormManageFeeRate / range.daysInMonth) * days) : 0;
        } else {
          housingIncome += h.monthlyRent ? Math.round((Number(h.monthlyRent) / range.daysInMonth) * days) : 0;
        }
      });

      let dormItemIncome = 0;
      let dormItemCost = 0;
      (dailyExpenseApplications || []).forEach((app) => {
        if (app.item !== DORM_EQUIPMENT_ITEM || app.dormId !== d.id) return;
        if ((app.date || '').slice(0, 7) !== monthStr) return;
        if (!DORM_PNL_BILLABLE_STATUSES.includes(app.status)) return;
        const amount = Number(app.amount) || 0;
        if (!amount) return;
        if ((app.type || '支出') === '收入') dormItemIncome += amount; else dormItemCost += amount;
      });

      // 租金按租約在這個月實際生效的天數比例計算（起租/退租當月只算部分
      // 月份的租金，不是整月租金），沒填起租日就不計租金；沒填退租日視為
      // 租約還沒結束，跟 dateOverlapDays 預設行為一致。
      const leaseDays = d.leaseStart ? dateOverlapDays(range.start, range.end, d.leaseStart, d.leaseEnd) : 0;
      const rentCost = leaseDays > 0 ? Math.round(((Number(d.rent) || 0) / range.daysInMonth) * leaseDays) : 0;
      const leaseStartMonth = d.leaseStart ? d.leaseStart.slice(0, 7) : '';
      const agentFeeCost = (leaseStartMonth === monthStr) ? (Number(d.agentFee) || 0) : 0;
      // 押金損失＝押金金額－退還押金金額，算在退還押金日期那個月（真正確
      // 認損失的時間點）；沒有填退還押金日期就還不算損失，不計入。
      const depositLossCost = (d.depositRefundDate && d.depositRefundDate.slice(0, 7) === monthStr)
        ? (Number(d.deposit) || 0) - (Number(d.depositRefundAmount) || 0) : 0;
      const u = (dormitoryUtilities || []).find((x) => x.dormitoryId === d.id && x.month === monthStr);
      const waterCost = Number(u?.waterFee) || 0;
      const electricityCost = Number(u?.electricityFee) || 0;
      const gasCost = Number(u?.gasFee) || 0;
      const otherUtilityCost = parseOtherFeesJson(u?.otherFees).reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

      monthly.push({
        month: m,
        ...sumDormPnlEntries([{ housingIncome, dormManageFeeIncome, dormItemIncome, rentCost, agentFeeCost, depositLossCost, waterCost, electricityCost, gasCost, otherUtilityCost, dormItemCost }]),
      });
    }
    const yearTotal = sumDormPnlEntries(monthly);
    return { dormId: d.id, dormName: d.name, manager1: d.manager1 || '未指定宿管1', monthly, yearTotal };
  });

  const byManager = {};
  dormResults.forEach((d) => { (byManager[d.manager1] ||= []).push(d); });
  return Object.keys(byManager).sort((a, b) => a.localeCompare(b)).map((manager1) => {
    const dorms = byManager[manager1].sort((a, b) => a.dormName.localeCompare(b.dormName));
    const managerMonthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, ...sumDormPnlEntries(dorms.map((d) => d.monthly[i])) }));
    const managerYearTotal = sumDormPnlEntries(managerMonthly);
    return { manager1, dorms, managerMonthly, managerYearTotal };
  });
}

// 全部宿舍（跨所有宿管1）合計，供頁面上方的總覽表使用。
export function sumDormProfitLossGroups(managerGroups) {
  const grandMonthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, ...sumDormPnlEntries(managerGroups.map((g) => g.managerMonthly[i])) }));
  const grandTotal = sumDormPnlEntries(grandMonthly);
  return { grandMonthly, grandTotal };
}
