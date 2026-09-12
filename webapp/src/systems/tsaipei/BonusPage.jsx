import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import {
  BONUS_ROLE_KEYS, BONUS_ROLE_LABELS, computeInternalBonusForMonth, computeInternalBonusByPersonForMonth, currentMonthStr,
} from '../../lib/bonus';

export default function BonusPage() {
  useOutletContext();
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: inTaiwanVisaRecords } = useCollection('tsaipei_inTaiwanVisa');
  const { rows: internalFeeSetupRecords } = useCollection('tsaipei_internalFeeSetup');
  const [month, setMonth] = useState(currentMonthStr());
  const [q, setQ] = useState('');

  const ctx = { students, matches, positions, admittedList, inTaiwanVisaRecords, internalFeeSetupRecords };
  const rows = computeInternalBonusForMonth(month, ctx).filter((r) =>
    !q || (r.client || '').toLowerCase().includes(q.toLowerCase()) || (r.projectCode || '').toLowerCase().includes(q.toLowerCase())
  );
  const byPerson = computeInternalBonusByPersonForMonth(month, ctx);

  return (
    <div className="content">
      <div className="page-header"><div><h2>內部獎金計算</h2><div className="page-desc">依月份自動試算：內部費用建檔金額 ÷ 當月天數 × 學生當月在台天數，以實習單位（專案＋客戶）加總</div></div></div>
      <p className="muted">依月份自動試算：內部費用建檔金額 ÷ 當月天數 × 學生當月在台天數，以實習單位（專案＋客戶）加總。</p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <input placeholder="搜尋客戶或專案編號" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
      </div>
      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <div className="table-wrap"><table>
          <thead><tr><th>客戶</th>{BONUS_ROLE_LABELS.map((l) => <th key={l}>{l}</th>)}<th>在台總天數</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><strong>{r.client || '—'}</strong><div className="muted">{r.projectCode}</div></td>
                {BONUS_ROLE_KEYS.map((k) => (
                  <td key={k}>
                    {r.roles[k] && <div style={{ fontWeight: 600 }}>{r.roles[k]}</div>}
                    <div className="muted">{(r.amounts[k] || 0).toLocaleString()} 元</div>
                  </td>
                ))}
                <td>{r.totalDays} 天</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={13} className="muted">沒有資料</td></tr>}
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
                <td className="muted">{p.breakdown.map((b) => `${b.client}(${b.role}) ${b.amount.toLocaleString()}`).join('、')}</td>
              </tr>
            ))}
            {byPerson.length === 0 && <tr><td colSpan={3} className="muted">沒有資料</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
