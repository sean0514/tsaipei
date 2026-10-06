import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { computeClientBillingForMonth, currentMonthStr } from '../../lib/bonus';
import { computeClientInvoice } from '../../lib/clientInvoice';
import { downloadClientInvoiceXlsx } from '../../lib/clientInvoiceXlsx';
import { downloadFilledXlsxTemplate } from '../../lib/xlsxExport';
import { fillInvoiceTemplate, parseCellMap, base64ToArrayBuffer } from '../../lib/clientInvoiceTemplate';

export default function ClientBillingPage() {
  useOutletContext();
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: inTaiwanVisaRecords } = useCollection('tsaipei_inTaiwanVisa');
  const { rows: clientFeeSetupRecords } = useCollection('tsaipei_clientFeeSetup');
  const { rows: dailyExpenseApplications } = useCollection('tsaipei_dailyExpenseApplications');
  const [month, setMonth] = useState(currentMonthStr());
  const [busyKey, setBusyKey] = useState(null);

  const ctx = { students, matches, positions, admittedList, inTaiwanVisaRecords, clientFeeSetupRecords, dailyExpenseApplications };
  const rows = computeClientBillingForMonth(month, ctx);

  async function handleDownload(row) {
    const key = `${row.projectCode}||${row.client}`;
    setBusyKey(key);
    try {
      const invoice = computeClientInvoice(row.projectCode, row.client, month, ctx);
      if (!invoice) {
        alert('此專案／客戶在該月份沒有可計算的學生資料，請確認在台簽證追蹤與客戶費用建檔是否都已設定。');
        return;
      }
      const feeSetup = clientFeeSetupRecords.find((r) => (r.projectCode || '') === (row.projectCode || '') && r.client === row.client);
      if (feeSetup?.invoiceTemplateData) {
        const cellMap = parseCellMap(feeSetup.invoiceCellMap);
        const templateBuffer = base64ToArrayBuffer(feeSetup.invoiceTemplateData);
        const filename = feeSetup.invoiceTemplateName || `${row.client}_請款單.xlsx`;
        await downloadFilledXlsxTemplate(filename, templateBuffer, (workbook) => {
          fillInvoiceTemplate(workbook, invoice, row.client, row.projectCode, cellMap);
        });
      } else {
        await downloadClientInvoiceXlsx(row.client, invoice);
      }
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="content">
      <div className="page-header"><div><h2>客戶請款計算</h2><div className="page-desc">依月份自動試算：客戶費用建檔金額 ÷ 當月天數 × 學生當月在台天數，以實習單位（專案＋客戶）加總</div></div></div>
      <p className="muted">依月份自動試算：依「實習單位（專案編號＋客戶）」把所有學生當月在台天數加總，乘以客戶費用建檔的月費率÷當月天數。</p>
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ marginBottom: 12 }} />
      <ClientBillingChart rows={rows} />
      <div className="card" style={{ overflowX: 'auto' }}>
        <div className="table-wrap"><table>
          <thead><tr><th>客戶</th><th>專案編號</th><th>辦件費(含稅)</th><th>服務費(未稅)</th><th>宿舍費(未稅)</th><th>宿管費(未稅)</th><th>代墊費用(鈞羽未稅)</th><th>稅金5%</th><th>代墊費用(供應商)</th><th>合計總額</th><th>在台總天數</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const key = `${r.projectCode}||${r.client}`;
              return (
                <tr key={key}>
                  <td>{r.client || '—'}</td>
                  <td>{r.projectCode}</td>
                  <td>{(r.amounts.monthlyProcessingFee || 0).toLocaleString()}</td>
                  <td>{(r.amounts.monthlyServiceFee || 0).toLocaleString()}</td>
                  <td>{(r.amounts.monthlyDormFee || 0).toLocaleString()}</td>
                  <td>{(r.amounts.monthlyDormManageFee || 0).toLocaleString()}</td>
                  <td>{(r.amounts.dailyExpenseChargeJunyu || 0).toLocaleString()}</td>
                  <td>{(r.tax || 0).toLocaleString()}</td>
                  <td>{(r.amounts.dailyExpenseChargeSupplier || 0).toLocaleString()}</td>
                  <td>{r.total.toLocaleString()}</td>
                  <td>{r.totalDays} 天</td>
                  <td><button disabled={busyKey === key} onClick={() => handleDownload(r)}>{busyKey === key ? '產生中…' : '下載請款單'}</button></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={12} className="muted">沒有資料</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

// 用純 SVG 畫橫向長條圖，不額外加圖表套件；依「合計總額」由大到小排序，
// 讓每個實習單位(專案＋客戶)當月請款金額一眼就能比較出高低。
function ClientBillingChart({ rows }) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const max = Math.max(...sorted.map((r) => r.total), 1);
  const barHeight = 28;
  const gap = 10;
  const labelWidth = 180;
  const chartWidth = 480;
  const height = sorted.length * (barHeight + gap);

  return (
    <div className="card" style={{ marginBottom: 16, overflowX: 'auto' }}>
      <h3 style={{ marginTop: 0 }}>當月各客戶請款金額</h3>
      <svg width={labelWidth + chartWidth + 90} height={height} role="img" aria-label="當月各客戶請款金額長條圖">
        {sorted.map((r, i) => {
          const y = i * (barHeight + gap);
          const barW = (r.total / max) * chartWidth;
          const key = `${r.projectCode}||${r.client}`;
          return (
            <g key={key}>
              <text x={labelWidth - 8} y={y + barHeight / 2 + 4} textAnchor="end" fontSize="13" fill="var(--text, #333)">
                {r.client || '—'}{r.projectCode ? `(${r.projectCode})` : ''}
              </text>
              <rect x={labelWidth} y={y} width={Math.max(barW, 2)} height={barHeight} fill="var(--accent)" rx="4" />
              <text x={labelWidth + barW + 8} y={y + barHeight / 2 + 4} fontSize="13" fill="var(--text, #333)">
                {r.total.toLocaleString()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
