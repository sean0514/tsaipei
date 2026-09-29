import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canView } from '../../lib/permissions';
import { parseBenefits } from './PositionsPage';

// 彙整檢視「實習單位」新增職缺表單裡登記的其他福利，資料直接來自
// tsaipei_positions，不另外維護一份，職缺那邊改了這裡就跟著變。唯讀頁面，
// 要編輯福利項目請到「實習單位」的新增/編輯職缺表單。
export default function PositionBenefitsPage() {
  const { system, role, overrides } = useOutletContext();
  const canSee = canView(system, 'benefits', role, overrides);
  const { rows: positions, loading } = useCollection('tsaipei_positions', { order: ['projectCode', 'asc'] });
  const [q, setQ] = useState('');

  const searchQuery = q.trim().toLowerCase();
  const rows = positions
    .map((p) => ({ ...p, benefits: parseBenefits(p.otherBenefits) }))
    .filter((p) => p.benefits.length > 0)
    .filter((p) => !searchQuery || `${p.projectCode || ''} ${p.company || ''} ${p.benefits.join(' ')}`.toLowerCase().includes(searchQuery));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>實習單位福利</h2>
          <div className="page-desc">彙整各實習單位（職缺）目前登記的其他福利項目，資料來自「實習單位」的新增職缺表單{!canSee && '（唯讀）'}</div>
        </div>
      </div>
      <input placeholder="搜尋專案編號、公司或福利項目" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 280 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="table-wrap"><table>
            <thead><tr><th>專案編號</th><th>公司名稱</th><th>職務名稱</th><th>實習津貼金額</th><th>膳宿費扣款金額</th><th>其他福利</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.projectCode || '—'}</td>
                  <td>{r.company || '—'}</td>
                  <td>{r.title || '—'}</td>
                  <td>{r.stipendAmount ? Number(r.stipendAmount).toLocaleString() : '—'}</td>
                  <td>{r.boardDeduction ? Number(r.boardDeduction).toLocaleString() : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {r.benefits.map((b, i) => <span key={i} className="tag" style={{ fontSize: 12 }}>{b}</span>)}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="muted">目前沒有登記其他福利的職缺。</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
