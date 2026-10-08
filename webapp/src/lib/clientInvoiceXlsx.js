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

// 未稅金額(小計)＝辦件費/服務費/宿舍費/宿管費/代墊費用(鈞羽未稅)五項加總，
// 不含代墊費用(供應商)；含稅金額＝未稅金額(小計)+營業稅5%；請款總金額＝
// 含稅金額+代墊費用(供應商)，跟 computeClientInvoice 算出的 grandTotal
// 是同一個數字，只是攤開顯示計算過程，這裡直接從 categoryTotals 重算，
// 不需要 computeClientInvoice 額外回傳中間值。
function taxBreakdown(invoice) {
  const { categoryTotals, tax, grandTotal } = invoice;
  const untaxedSubtotal = categoryTotals.processingFee + categoryTotals.serviceFee + categoryTotals.dormFee
    + categoryTotals.dormManageFee + categoryTotals.dailyExpenseJunyu;
  const taxedTotal = untaxedSubtotal + tax;
  return { untaxedSubtotal, taxedTotal, supplierExpense: categoryTotals.dailyExpenseSupplier, grandTotal };
}

// Sheet1「請款單」：依類別(辦件費/服務費/宿舍費/宿管費/代墊費用鈞羽)分行
// 列出未稅金額，再列未稅金額(小計)/營業稅5%/含稅金額，最後加上不計稅的
// 代墊費用(供應商)算出請款總金額，方便客戶對帳跟核對含不含稅。
function buildSummarySheet(workbook, client, invoice) {
  const { range, periodLabel, taxId, categoryTotals } = invoice;
  const { untaxedSubtotal, taxedTotal, supplierExpense, grandTotal } = taxBreakdown(invoice);
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

  const categoryRows = [
    ['辦件費(未稅)', categoryTotals.processingFee],
    ['服務費(未稅)', categoryTotals.serviceFee],
    ['宿舍費(未稅)', categoryTotals.dormFee],
    ['宿管費(未稅)', categoryTotals.dormManageFee],
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
    ['代墊費用(供應商)', supplierExpense],
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
  const { untaxedSubtotal, taxedTotal, supplierExpense, grandTotal } = taxBreakdown(invoice);
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
  // 金額(小計)/營業稅5%/含稅金額/代墊費用(供應商)/請款總金額，方便在明細
  // 頁簽就能核對總額，不用切回請款單頁簽。
  const summaryRows = [
    ['未稅金額(小計)', untaxedSubtotal],
    ['營業稅5%', invoice.tax],
    ['含稅金額', taxedTotal],
    ['代墊費用(供應商)', supplierExpense],
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

  const studentHeaders = ['編號', '姓名', '護照號碼', '到職日', '離職日', '任職天數', '服務費用', '宿管費用', '宿舍費用', '辦件費', '請款金額'];
  headerRowCells(sheet.getRow(r), studentHeaders, 1);
  r += 1;
  const studentStartRow = r;
  studentRows.forEach((row) => {
    [row.no, row.name, row.passport, row.startDate, row.endDate, row.days, row.serviceFee, row.dormManageFee, row.dormFee, row.processingFee, row.total]
      .forEach((v, i) => {
        const cell = sheet.getRow(r).getCell(1 + i);
        cell.value = v;
        cell.border = THIN_BORDER;
        if (i >= 6) cell.numFmt = '#,##0';
      });
    r += 1;
  });
  if (studentRows.length) {
    const subtotalRow = sheet.getRow(r);
    subtotalRow.getCell(1).value = '小計';
    subtotalRow.getCell(1).font = { bold: true };
    [7, 8, 9, 10, 11].forEach((col) => {
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
    const expenseHeaders = ['編號', '項目', '學生／備註', '日期', '發票類別', '金額'];
    headerRowCells(sheet.getRow(r), expenseHeaders, 1);
    r += 1;
    const expenseStartRow = r;
    expenseRows.forEach((row) => {
      [row.no, row.item || '', row.name, row.startDate, row.invoiceType || '', row.total]
        .forEach((v, i) => {
          const cell = sheet.getRow(r).getCell(1 + i);
          cell.value = v;
          cell.border = THIN_BORDER;
          if (i === 5) cell.numFmt = '#,##0';
        });
      r += 1;
    });
    const subtotalRow = sheet.getRow(r);
    subtotalRow.getCell(1).value = '小計';
    subtotalRow.getCell(1).font = { bold: true };
    const col6Letter = sheet.getColumn(6).letter;
    const totalCell = subtotalRow.getCell(6);
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
