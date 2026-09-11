import { downloadXlsx } from './xlsxExport';
import { COMPANY_INFO } from './clientInvoice';

// Ported cell-for-cell from buildInvoiceSummarySheet_/buildInvoiceDetailSheet_
// in apps-script/Code.gs (which used A1-style Sheets ranges; here the same
// layout is built with exceljs row/col indices, 1-based like Sheets).
export async function downloadClientInvoiceXlsx(client, invoice) {
  const { range, subtotal, tax, grandTotal, rows, periodLabel, taxId } = invoice;
  const yearRoc = range.year - 1911;
  const mm2 = String(range.month).padStart(2, '0');
  const filename = `${yearRoc}.${range.month}月_${client}_請款單.xlsx`;

  await downloadXlsx(filename, (workbook) => {
    const sheet1 = workbook.addWorksheet('請款單');
    sheet1.getColumn(2).width = 30;
    for (let c = 3; c <= 6; c++) sheet1.getColumn(c).width = 15;

    sheet1.getCell('B2').value = COMPANY_INFO.name;
    sheet1.getCell('B2').font = { bold: true, size: 14 };
    sheet1.getCell('B3').value = COMPANY_INFO.addressZh;
    sheet1.getCell('B4').value = COMPANY_INFO.addressEn;
    sheet1.getCell('D6').value = `${yearRoc}.${mm2}月 請款單`;
    sheet1.getCell('D6').font = { bold: true, size: 12 };
    sheet1.getCell('C7').value = `計算區間：${yearRoc}.${mm2}.01~${yearRoc}.${mm2}.${range.daysInMonth}`;

    const headerRow = 9;
    const headers = ['客戶名稱', '統一編號', '品名', '銷售額', '營業稅', '總　計'];
    headers.forEach((h, i) => {
      const cell = sheet1.getRow(headerRow).getCell(2 + i);
      cell.value = h;
      cell.font = { bold: true };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    const dataVals = [client, taxId || '', '服務費', subtotal, tax, grandTotal];
    dataVals.forEach((v, i) => {
      const cell = sheet1.getRow(headerRow + 1).getCell(2 + i);
      cell.value = v;
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      if (i >= 3) cell.numFmt = '#,##0';
    });

    sheet1.getCell(headerRow + 3, 2).value = '金額合計';
    sheet1.getCell(headerRow + 3, 2).font = { bold: true };
    [subtotal, tax, grandTotal].forEach((v, i) => {
      const cell = sheet1.getRow(headerRow + 3).getCell(5 + i);
      cell.value = v;
      cell.numFmt = '#,##0';
    });

    sheet1.getCell(headerRow + 6, 2).value = `${grandTotal}  taxes included`;
    sheet1.getCell(headerRow + 7, 2).value = 'Type of payment: payment in lump sum';
    const s9 = sheet1.getCell(headerRow + 9, 2);
    s9.value = '★請於10號前或合約約定日期前匯入下列帳號 ★';
    s9.font = { bold: true };
    sheet1.getCell(headerRow + 10, 2).value = `◇ 匯款銀行：${COMPANY_INFO.bank}`;
    sheet1.getCell(headerRow + 11, 2).value = `◇ 匯款帳戶：${COMPANY_INFO.account}`;
    sheet1.getCell(headerRow + 12, 2).value = `◇ 匯款帳號：${COMPANY_INFO.accountNumber}`;
    sheet1.getCell(headerRow + 14, 2).value = `TEL：${COMPANY_INFO.tel}`;
    sheet1.getCell(headerRow + 15, 2).value = COMPANY_INFO.contactName;
    sheet1.getCell(headerRow + 16, 2).value = `E-mail：${COMPANY_INFO.email}`;

    const sheet2 = workbook.addWorksheet('學生明細');
    const detailHeaders = ['編號', '姓名', '護照號碼', '到職日', '離職日', '任職天數', '服務費用', '宿管費用', '宿舍費用', '辦件費', '請款金額', '備註'];
    const headerRowObj = sheet2.getRow(1);
    detailHeaders.forEach((h, i) => {
      const cell = headerRowObj.getCell(1 + i);
      cell.value = h;
      cell.font = { bold: true };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    rows.forEach((r, idx) => {
      const row = sheet2.getRow(2 + idx);
      [r.no, r.name, r.passport, r.startDate, r.endDate, r.days, r.serviceFee, r.dormManageFee, r.dormFee, r.processingFee, r.total, periodLabel || '']
        .forEach((v, i) => {
          const cell = row.getCell(1 + i);
          cell.value = v;
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          if (i >= 6 && i <= 10) cell.numFmt = '#,##0';
        });
    });
    const totalRow = 2 + rows.length;
    sheet2.getCell(totalRow, 1).value = '小計';
    sheet2.getCell(totalRow, 1).font = { bold: true };
    ['F', 'G', 'H', 'I', 'J', 'K'].forEach((col) => {
      sheet2.getCell(`${col}${totalRow}`).value = { formula: `SUM(${col}2:${col}${totalRow - 1})` };
    });
    sheet2.getCell(totalRow + 2, 7).value = '當月天數';
    sheet2.getCell(totalRow + 2, 8).value = range.daysInMonth;
    sheet2.getCell(totalRow + 2, 10).value = '合計';
    sheet2.getCell(totalRow + 2, 11).value = subtotal;
    sheet2.getCell(totalRow + 3, 10).value = '營業稅';
    sheet2.getCell(totalRow + 3, 11).value = tax;
    sheet2.getCell(totalRow + 4, 10).value = '發票金額';
    sheet2.getCell(totalRow + 4, 11).value = grandTotal;
    [totalRow + 2, totalRow + 3, totalRow + 4].forEach((r) => { sheet2.getCell(r, 11).numFmt = '#,##0'; });
    sheet2.columns.forEach((col) => { col.width = 14; });
  });
}
