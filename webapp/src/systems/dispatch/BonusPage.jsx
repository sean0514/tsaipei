import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { computeInternalBonusForMonth, computeInternalBonusByPersonForMonth, currentMonthStr } from '../../lib/dispatchBilling';

export default function BonusPage() {
  useOutletContext();
  const { rows: employmentStatusRecords } = useCollection('dispatch_employmentStatus');
  const { rows: internalFeeSetupRecords } = useCollection('dispatch_internalFeeSetup');
  const [month, setMonth] = useState(currentMonthStr());
  const [q, setQ] = useState('');

  const ctx = { employmentStatusRecords, internalFeeSetupRecords };
  const rows = computeInternalBonusForMonth(month, ctx).filter((r) => !q || (r.client || '').toLowerCase().includes(q.toLowerCase()));
  const byPerson = computeInternalBonusByPersonForMonth(month, ctx);

  return (
    <div className="content">
      <div className="page-header"><div><h2>內部獎金計算</h2><div className="page-desc">依月份自動試算：內部費用建檔費率 ÷ 當月天數 × 該客戶當月在職總天數</div></div></div>
      <p className="muted">依月份自動試算：內部費用建檔費率 ÷ 當月天數 × 該客戶當月在職總天數，以客戶加總。</p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <input placeholder="搜尋客戶" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
      </div>
      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <div className="table-wrap"><table>
          <thead><tr><th>客戶</th><th>業務人員</th><th>在職人數</th><th>在職總天數</th><th>獎金金額</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.client || '—'}</td>
                <td>{r.salesPerson || '—'}</td>
                <td>{r.headcount}</td>
                <td>{r.totalDays} 天</td>
                <td>{r.amount.toLocaleString()} 元</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="muted">沒有資料</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>依人員加總</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>姓名</th><th>總額</th><th>明細</th></tr></thead>
          <tbody>
            {byPerson.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td>{p.total.toLocaleString()} 元</td>
                <td className="muted">{p.breakdown.map((b) => `${b.client} ${b.amount.toLocaleString()}`).join('、')}</td>
              </tr>
            ))}
            {byPerson.length === 0 && <tr><td colSpan={3} className="muted">沒有資料</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
