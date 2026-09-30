import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { currentMonthStr } from '../../lib/dispatchBilling';

// 依「招募專員」統計透過線上履歷連結新增的求職者筆數（只要填寫就算，不論
// 後續有沒有到職），獎金金額 = 筆數 × 推薦獎金設定的每筆金額。
export default function ReferralBonusPage() {
  useOutletContext();
  const { rows: jobSeekers, loading } = useCollection('dispatch_jobSeekers');
  const { rows: rateRows } = useCollection('dispatch_referralBonusRate');
  const rate = Number(rateRows.find((r) => r.id === 'default')?.amount) || 0;
  const [month, setMonth] = useState(currentMonthStr());
  const [showAll, setShowAll] = useState(false);

  const referred = jobSeekers.filter((s) => s.recruiter);
  const filtered = referred.filter((s) => {
    if (showAll) return true;
    const created = s.createdAt?.toDate?.();
    if (!created) return false;
    return created.toISOString().slice(0, 7) === month;
  });

  const byPerson = {};
  filtered.forEach((s) => {
    (byPerson[s.recruiter] ||= { name: s.recruiter, count: 0 }).count += 1;
  });
  const rows = Object.values(byPerson).sort((a, b) => b.count - a.count);

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>招募獎金統計</h2>
          <div className="page-desc">依招募專員統計透過線上履歷連結填寫的筆數，獎金 = 筆數 × 推薦獎金設定金額（每筆 {rate.toLocaleString()} 元）</div>
        </div>
      </div>
      <div className="row-actions" style={{ marginBottom: 16 }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} disabled={showAll} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          不限月份（全部區間）
        </label>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>招募專員</th><th>履歷筆數</th><th>獎金金額</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{r.count}</td>
                  <td>{(r.count * rate).toLocaleString()} 元</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={3} className="muted">目前沒有透過連結填寫的履歷資料。</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
