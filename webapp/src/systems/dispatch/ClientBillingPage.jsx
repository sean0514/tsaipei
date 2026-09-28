import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { computeClientBillingForMonth, currentMonthStr } from '../../lib/dispatchBilling';
import { exportEntityCSV } from '../../lib/csv';

const CSV_FIELDS = [
  { key: 'client', label: '客戶' }, { key: 'billingType', label: '收費類型' }, { key: 'headcount', label: '在職人數' },
  { key: 'totalDays', label: '在職總天數' }, { key: 'amount', label: '請款金額' },
];

export default function ClientBillingPage() {
  useOutletContext();
  const { rows: employmentStatusRecords } = useCollection('dispatch_employmentStatus');
  const { rows: clientFeeSetupRecords } = useCollection('dispatch_clientFeeSetup');
  const [month, setMonth] = useState(currentMonthStr());

  const rows = computeClientBillingForMonth(month, { employmentStatusRecords, clientFeeSetupRecords });

  function handleDownload() {
    exportEntityCSV(rows, CSV_FIELDS, `客戶請款計算_${month}`);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>客戶請款計算</h2>
          <div className="page-desc">依月份自動試算：固定制直接收取固定金額；月費制以客戶費用建檔費率 ÷ 當月天數 × 該客戶當月在職總天數</div>
        </div>
        <button onClick={handleDownload}>下載此月份資料</button>
      </div>
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ marginBottom: 12 }} />
      <div className="card" style={{ overflowX: 'auto' }}>
        <div className="table-wrap"><table>
          <thead><tr><th>客戶</th><th>收費類型</th><th>在職人數</th><th>在職總天數</th><th>請款金額</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.client}>
                <td>{r.client}</td>
                <td>{r.billingType || '—'}</td>
                <td>{r.headcount}</td>
                <td>{r.totalDays} 天</td>
                <td>{r.amount.toLocaleString()} 元</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="muted">沒有資料</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
