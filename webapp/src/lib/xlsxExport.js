// Shared helper: build the workbook via the caller's `build` callback, then
// trigger a browser download. Used by both systems' invoice-Excel features
// (generateClientInvoice in tsaipei, generateCustomerInvoiceXlsx in
// foodfactory) — client-side generation via exceljs instead of a Cloud
// Function, since neither system has a backend beyond Firestore.
// exceljs (~1.9MB unpacked) is dynamically imported here so it only loads
// when someone actually clicks a download button, not in the main bundle.
export async function downloadXlsx(filename, build) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Same as downloadXlsx, but starts from an uploaded template's bytes
// instead of a blank workbook — used to fill in a client's own 請款單
// layout rather than generating our own fixed one.
export async function downloadFilledXlsxTemplate(filename, templateArrayBuffer, fill) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateArrayBuffer);
  fill(workbook);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function addKeyValueSheet(workbook, sheetName, rows) {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = [{ width: 20 }, { width: 40 }];
  rows.forEach((row) => sheet.addRow(row));
  return sheet;
}

export function addTableSheet(workbook, sheetName, header, rows) {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(header).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row));
  sheet.columns.forEach((col) => { col.width = 16; });
  return sheet;
}
