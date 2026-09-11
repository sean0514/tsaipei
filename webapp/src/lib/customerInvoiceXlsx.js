import { downloadXlsx } from './xlsxExport';

// Ported from generateCustomerInvoiceXlsx in food-factory-mgmt/apps-script/Code.gs.
export async function downloadCustomerInvoiceXlsx(invoice, customer, items, products) {
  await downloadXlsx(`${invoice.invoiceNo}.xlsx`, (workbook) => {
    const sheet1 = workbook.addWorksheet('請款單');
    sheet1.columns = [{ width: 16 }, { width: 30 }];
    [
      ['請款單號', invoice.invoiceNo],
      ['客戶', customer?.name || ''],
      ['期間', `${invoice.periodStart} ~ ${invoice.periodEnd}`],
      ['總金額', invoice.totalAmount],
    ].forEach((row) => sheet1.addRow(row));

    const sheet2 = workbook.addWorksheet('出貨明細');
    const header = ['出貨單號', '出貨日期', '成品', '批號', '數量', '單價', '金額', '稅金', '總計'];
    sheet2.addRow(header).font = { bold: true };
    items.forEach((s) => {
      const p = products.find((pp) => pp.id === s.productId);
      sheet2.addRow([s.shipmentNo, s.date, p ? p.name : s.productId, s.batchNo, s.quantity, s.unitPrice, s.amount, s.tax, s.total]);
    });
    sheet2.columns.forEach((col) => { col.width = 14; });
  });
}
