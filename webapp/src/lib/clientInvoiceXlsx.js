import { downloadXlsx } from './xlsxExport';
import { COMPANY_INFO } from './clientInvoice';

const THIN_BORDER = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };

function headerRowCells(row, values, startCol = 2) {
  values.forEach((h, i) => {
    const cell = row.getCell(startCol + i);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = THIN_BORDER;
  });
}

// 未稅金額(小計)＝辦件費/服務費/宿舍費/宿管費/宿舍其他費用(廠商代付)/
// 代墊費用(鈞羽未稅)六項加總，不含代墊費用(供應商)；含稅金額＝未稅金額
// (小計)+營業稅5%；請款總金額＝含稅金額+代墊費用(供應商)，跟
// computeClientInvoice 算出的 grandTotal 是同一個數字，只是攤開顯示計算
// 過程，這裡直接從 categoryTotals 重算，不需要 computeClientInvoice 額外
// 回傳中間值。
function taxBreakdown(invoice) {
  const { categoryTotals, tax, grandTotal } = invoice;
  const untaxedSubtotal = categoryTotals.processingFee + categoryTotals.serviceFee + categoryTotals.dormFee
    + categoryTotals.dormManageFee + (categoryTotals.dormOtherFee || 0) + categoryTotals.dailyExpenseJunyu;
  const taxedTotal = untaxedSubtotal + tax;
  return {
    untaxedSubtotal, taxedTotal, grandTotal,
    supplierExpense: categoryTotals.dailyExpenseSupplier,
    utilityPassThrough: categoryTotals.dormUtility || 0,
    collectedDormFee: categoryTotals.collectedDormFee || 0,
  };
}

// Sheet1「請款單」：依類別(辦件費/服務費/宿舍費/宿管費/宿舍其他費用廠商
// 代付/代墊費用鈞羽)分行列出未稅金額，再列未稅金額(小計)/營業稅5%/含稅
// 金額，最後加上不計稅的代墊費用(供應商)算出請款總金額，方便客戶對帳跟
// 核對含不含稅。
function buildSummarySheet(workbook, client, invoice) {
  const { range, periodLabel, taxId, categoryTotals } = invoice;
  const { untaxedSubtotal, taxedTotal, supplierExpense, utilityPassThrough, collectedDormFee, grandTotal } = taxBreakdown(invoice);
  const yearRoc = range.year - 1911;
  const mm2 = String(range.month).padStart(2, '0');

  const sheet = workbook.addWorksheet('請款單');
  sheet.getColumn(2).width = 24;
  sheet.getColumn(3).width = 20;
  sheet.getColumn(4).width = 16;

  sheet.getCell('B2').value = COMPANY_INFO.name;
  sheet.getCell('B2').font = { bold: true, size: 14 };
  sheet.getCell('B3').value = COMPANY_INFO.addressZh;
  sheet.getCell('B4').value = COMPANY_INFO.addressEn;
  sheet.getCell('B6').value = `${yearRoc}.${mm2}月 請款單`;
  sheet.getCell('B6').font = { bold: true, size: 14 };
  sheet.getCell('B7').value = `計算區間：${yearRoc}.${mm2}.01~${yearRoc}.${mm2}.${range.daysInMonth}（${periodLabel || ''}）`;

  sheet.getCell('B9').value = '客戶名稱';
  sheet.getCell('B9').font = { bold: true };
  sheet.getCell('C9').value = client;
  sheet.getCell('B10').value = '統一編號';
  sheet.getCell('B10').font = { bold: true };
  sheet.getCell('C10').value = taxId || '';

  const headerRow = 12;
  headerRowCells(sheet.getRow(headerRow), ['項目', '金額']);

  // 宿舍費改成代收代付性質(鼎泰豐除外)，不再是未稅服務項目——這個客戶
  // 如果宿舍費是代收代付(categoryTotals.dormFee 為 0)，「宿舍費(未稅)」
  // 這一列就整列不列出，不是列出來顯示 0，跟鈞羽未稅服務項目區分開來。
  const categoryRows = [
    ['辦件費(未稅)', categoryTotals.processingFee],
    ['服務費(未稅)', categoryTotals.serviceFee],
    ...(categoryTotals.dormFee ? [['宿舍費(未稅)', categoryTotals.dormFee]] : []),
    ['宿管費(未稅)', categoryTotals.dormManageFee],
    ['宿舍其他費用(廠商代付未稅)', categoryTotals.dormOtherFee || 0],
    ['代墊費用(鈞羽未稅)', categoryTotals.dailyExpenseJunyu],
  ];
  categoryRows.forEach(([label, value], idx) => {
    const row = sheet.getRow(headerRow + 1 + idx);
    const labelCell = row.getCell(2);
    labelCell.value = label;
    labelCell.border = THIN_BORDER;
    const valueCell = row.getCell(3);
    valueCell.value = value || 0;
    valueCell.numFmt = '#,##0';
    valueCell.border = THIN_BORDER;
  });

  const summaryStartRow = headerRow + 1 + categoryRows.length;
  const summaryRows = [
    ['未稅金額(小計)', untaxedSubtotal],
    ['營業稅5%', invoice.tax],
    ['含稅金額', taxedTotal],
    ['代收宿舍費', collectedDormFee],
    ['代墊費用(供應商)', supplierExpense],
    ['代收代付(水電瓦斯)', utilityPassThrough],
    ['請款總金額', grandTotal],
  ];
  summaryRows.forEach(([label, value], idx) => {
    const row = sheet.getRow(summaryStartRow + idx);
    const isGrandTotal = idx === summaryRows.length - 1;
    const labelCell = row.getCell(2);
    labelCell.value = label;
    labelCell.font = { bold: true };
    labelCell.border = THIN_BORDER;
    if (isGrandTotal) labelCell.fill = TOTAL_FILL;
    const valueCell = row.getCell(3);
    valueCell.value = value;
    valueCell.numFmt = '#,##0';
    valueCell.font = { bold: true };
    valueCell.border = THIN_BORDER;
    if (isGrandTotal) valueCell.fill = TOTAL_FILL;
  });

  const noteRow = summaryStartRow + summaryRows.length + 2;
  const s9 = sheet.getCell(noteRow, 2);
  s9.value = '★請於10號前或合約約定日期前匯入下列帳號 ★';
  s9.font = { bold: true };
  sheet.getCell(noteRow + 1, 2).value = `◇ 匯款銀行：${COMPANY_INFO.bank}`;
  sheet.getCell(noteRow + 2, 2).value = `◇ 匯款帳戶：${COMPANY_INFO.account}`;
  sheet.getCell(noteRow + 3, 2).value = `◇ 匯款帳號：${COMPANY_INFO.accountNumber}`;
  sheet.getCell(noteRow + 5, 2).value = `TEL：${COMPANY_INFO.tel}`;
  sheet.getCell(noteRow + 6, 2).value = COMPANY_INFO.contactName;
  sheet.getCell(noteRow + 7, 2).value = `E-mail：${COMPANY_INFO.email}`;
}

// Sheet2「明細」：學生明細、代墊費用明細分成兩個獨立表格(各自有自己的
// 小計)，不再混在同一張表裡用「備註」欄硬塞項目名稱。
function buildDetailSheet(workbook, invoice) {
  const { studentRows, expenseRows } = invoice;
  // 合併帳單(同統編、不同客戶名稱/實習單位)才會有 site；單一專案的請款單
  // 本來就只有一個客戶，不需要這欄，所以欄位跟著 site 有沒有值動態增減，
  // 不影響原本單一專案下載請款單的明細版面。
  const hasSite = studentRows.some((r) => r.site) || expenseRows.some((r) => r.site);
  const { untaxedSubtotal, taxedTotal, supplierExpense, utilityPassThrough, collectedDormFee, grandTotal } = taxBreakdown(invoice);
  const sheet = workbook.addWorksheet('明細');
  sheet.columns = Array.from({ length: 6 }, () => ({ width: 14 }));
  sheet.getColumn(14).width = 16;
  sheet.getColumn(15).width = 12;

  let r = 1;
  const titleCell = sheet.getCell(r, 1);
  titleCell.value = '學生明細';
  titleCell.font = { bold: true, size: 12 };
  r += 1;

  // 右側(N/O欄)對齊學生明細表格頭部，放一份跟「請款單」頁簽一樣的未稅
  // 金額(小計)/營業稅5%/含稅金額/代收宿舍費/代墊費用(供應商)/代收代付
  // (水電瓦斯)/請款總金額，方便在明細頁簽就能核對總額，不用切回請款單
  // 頁簽。
  const summaryRows = [
    ['未稅金額(小計)', untaxedSubtotal],
    ['營業稅5%', invoice.tax],
    ['含稅金額', taxedTotal],
    ['代收宿舍費', collectedDormFee],
    ['代墊費用(供應商)', supplierExpense],
    ['代收代付(水電瓦斯)', utilityPassThrough],
    ['請款總金額', grandTotal],
  ];
  summaryRows.forEach(([label, value], idx) => {
    const row = sheet.getRow(r + idx);
    const isGrandTotal = idx === summaryRows.length - 1;
    const labelCell = row.getCell(14);
    labelCell.value = label;
    labelCell.font = { bold: true };
    if (isGrandTotal) labelCell.fill = TOTAL_FILL;
    const valueCell = row.getCell(15);
    valueCell.value = value;
    valueCell.numFmt = '#,##0';
    valueCell.font = { bold: true };
    if (isGrandTotal) valueCell.fill = TOTAL_FILL;
  });

  // 宿舍費改成代收代付性質(鼎泰豐除外)之後，「宿舍費用」欄跟「代收宿舍費」
  // 欄都改成有資料才出現，不是固定欄位——鼎泰豐這種還在用舊制的客戶看到
  // 「宿舍費用」欄(沒有代收宿舍費)，其他客戶看到「代收宿舍費」欄(宿舍費用
  // 欄不出現，因為已經代收代付化、不會有值)。
  const hasDormFee = studentRows.some((row) => row.dormFee);
  const hasCollectedDormFee = studentRows.some((row) => row.collectedDormFee);
  const studentColumns = [
    { key: 'no', label: '編號' },
    ...(hasSite ? [{ key: 'site', label: '實習場域' }] : []),
    { key: 'name', label: '姓名' },
    { key: 'passport', label: '護照號碼' },
    { key: 'startDate', label: '到職日' },
    { key: 'endDate', label: '離職日' },
    { key: 'days', label: '任職天數' },
    { key: 'serviceFee', label: '服務費用', numeric: true },
    { key: 'dormManageFee', label: '宿管費用', numeric: true },
    ...(hasDormFee ? [{ key: 'dormFee', label: '宿舍費用', numeric: true }] : []),
    { key: 'processingFee', label: '辦件費', numeric: true },
    { key: 'total', label: '請款金額', numeric: true },
    ...(hasCollectedDormFee ? [{ key: 'collectedDormFee', label: '代收宿舍費', numeric: true }] : []),
  ];
  headerRowCells(sheet.getRow(r), studentColumns.map((c) => c.label), 1);
  r += 1;
  const studentStartRow = r;
  studentRows.forEach((row) => {
    studentColumns.forEach((c, i) => {
      const cell = sheet.getRow(r).getCell(1 + i);
      cell.value = c.key === 'site' ? (row.site || '') : row[c.key];
      cell.border = THIN_BORDER;
      if (c.numeric) cell.numFmt = '#,##0';
    });
    r += 1;
  });
  if (studentRows.length) {
    const subtotalRow = sheet.getRow(r);
    subtotalRow.getCell(1).value = '小計';
    subtotalRow.getCell(1).font = { bold: true };
    studentColumns.forEach((c, i) => {
      if (!c.numeric) return;
      const col = i + 1;
      const colLetter = sheet.getColumn(col).letter;
      const cell = subtotalRow.getCell(col);
      cell.value = { formula: `SUM(${colLetter}${studentStartRow}:${colLetter}${r - 1})` };
      cell.numFmt = '#,##0';
      cell.font = { bold: true };
    });
  } else {
    sheet.getRow(r).getCell(1).value = '（無學生明細）';
    sheet.getRow(r).getCell(1).font = { italic: true };
  }
  r += 3;

  if (expenseRows.length) {
    sheet.getCell(r, 1).value = '代墊費用明細（日常支出申請）';
    sheet.getCell(r, 1).font = { bold: true, size: 12 };
    r += 1;
    const expenseHeaders = hasSite
      ? ['編號', '實習場域', '項目', '學生／備註', '日期', '發票類別', '金額']
      : ['編號', '項目', '學生／備註', '日期', '發票類別', '金額'];
    headerRowCells(sheet.getRow(r), expenseHeaders, 1);
    r += 1;
    const expenseStartRow = r;
    const expenseAmountCol = hasSite ? 7 : 6;
    expenseRows.forEach((row) => {
      const values = hasSite
        ? [row.no, row.site || '', row.item || '', row.name, row.startDate, row.invoiceType || '', row.total]
        : [row.no, row.item || '', row.name, row.startDate, row.invoiceType || '', row.total];
      values.forEach((v, i) => {
        const cell = sheet.getRow(r).getCell(1 + i);
        cell.value = v;
        cell.border = THIN_BORDER;
        if (i === expenseAmountCol - 1) cell.numFmt = '#,##0';
      });
      r += 1;
    });
    const subtotalRow = sheet.getRow(r);
    subtotalRow.getCell(1).value = '小計';
    subtotalRow.getCell(1).font = { bold: true };
    const col6Letter = sheet.getColumn(expenseAmountCol).letter;
    const totalCell = subtotalRow.getCell(expenseAmountCol);
    totalCell.value = { formula: `SUM(${col6Letter}${expenseStartRow}:${col6Letter}${r - 1})` };
    totalCell.numFmt = '#,##0';
    totalCell.font = { bold: true };
    r += 1;
  }
}

export async function downloadClientInvoiceXlsx(client, invoice) {
  const { range } = invoice;
  const yearRoc = range.year - 1911;
  const filename = `${yearRoc}.${range.month}月_${client}_請款單.xlsx`;

  await downloadXlsx(filename, (workbook) => {
    buildSummarySheet(workbook, client, invoice);
    buildDetailSheet(workbook, invoice);
  });
}
