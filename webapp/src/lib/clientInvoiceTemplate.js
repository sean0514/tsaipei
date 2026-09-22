// Lets each client have their own 請款單 Excel layout instead of always
// using our generated one (clientInvoiceXlsx.js): staff upload the
// client's own template file and say which cell each piece of data goes
// in; we then just write values into that template rather than building
// a sheet from scratch. Student rows (variable count) start at a chosen
// row and go down one row per student, one column per field — matching
// how most client-supplied invoice templates are laid out.

export const SUMMARY_MAP_FIELDS = [
  { key: 'client', label: '客戶名稱' },
  { key: 'taxId', label: '統一編號' },
  { key: 'projectCode', label: '專案編號' },
  { key: 'periodLabel', label: '期別' },
  { key: 'yearMonthLabel', label: '年月（例如 115.09）' },
  { key: 'daysInMonth', label: '當月天數' },
  { key: 'subtotal', label: '銷售額小計' },
  { key: 'tax', label: '營業稅' },
  { key: 'grandTotal', label: '請款總額' },
];

export const DETAIL_MAP_FIELDS = [
  { key: 'no', label: '編號' },
  { key: 'name', label: '姓名' },
  { key: 'passport', label: '護照號碼' },
  { key: 'startDate', label: '到職日' },
  { key: 'endDate', label: '離職日' },
  { key: 'days', label: '任職天數' },
  { key: 'serviceFee', label: '服務費用' },
  { key: 'dormManageFee', label: '宿管費用' },
  { key: 'dormFee', label: '宿舍費用' },
  { key: 'processingFee', label: '辦件費' },
  { key: 'total', label: '請款金額' },
];

export function emptyCellMap() {
  return { summary: {}, detail: { startRow: '', columns: {} } };
}

export function parseCellMap(json) {
  try {
    const parsed = json ? JSON.parse(json) : null;
    if (!parsed || typeof parsed !== 'object') return emptyCellMap();
    return { summary: parsed.summary || {}, detail: { startRow: parsed.detail?.startRow || '', columns: parsed.detail?.columns || {} } };
  } catch { return emptyCellMap(); }
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',').pop());
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Fills `workbook`'s first sheet using `cellMap`. Summary cells are set
// directly by their configured cell reference (e.g. "B5"); detail columns
// are set one row per student starting at cellMap.detail.startRow.
export function fillInvoiceTemplate(workbook, invoice, client, projectCode, cellMap) {
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('範本檔案裡沒有工作表可以填寫。');

  const yearRoc = invoice.range.year - 1911;
  const mm2 = String(invoice.range.month).padStart(2, '0');
  const summaryValues = {
    client, taxId: invoice.taxId || '', projectCode, periodLabel: invoice.periodLabel || '',
    yearMonthLabel: `${yearRoc}.${mm2}`, daysInMonth: invoice.range.daysInMonth,
    subtotal: invoice.subtotal, tax: invoice.tax, grandTotal: invoice.grandTotal,
  };
  Object.entries(cellMap.summary || {}).forEach(([key, cellRef]) => {
    if (!cellRef) return;
    sheet.getCell(cellRef).value = summaryValues[key];
  });

  const startRow = Number(cellMap.detail?.startRow) || 0;
  const columns = cellMap.detail?.columns || {};
  if (startRow > 0) {
    invoice.rows.forEach((r, idx) => {
      const rowNum = startRow + idx;
      DETAIL_MAP_FIELDS.forEach(({ key }) => {
        const col = columns[key];
        if (!col) return;
        sheet.getCell(`${col}${rowNum}`).value = r[key];
      });
    });
  }
}
