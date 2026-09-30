import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canView } from '../../lib/permissions';

// 彙整「求職者資訊」裡黑名單勾選「是」的求職者，資料直接來自
// dispatch_jobSeekers，不另外維護一份。唯讀頁面，要調整黑名單狀態請到
// 「求職者資訊」的新增/編輯表單。
export default function BlacklistPage() {
  const { system, role, overrides } = useOutletContext();
  const canSee = canView(system, 'bonus', role, overrides);
  const { rows: jobSeekers, loading } = useCollection('dispatch_jobSeekers');
  const [q, setQ] = useState('');

  const searchQuery = q.trim().toLowerCase();
  const rows = jobSeekers
    .filter((s) => s.blacklist === '是')
    .filter((s) => !searchQuery || `${s.chineseName || ''} ${s.idNumber || ''} ${s.client || ''}`.toLowerCase().includes(searchQuery))
    .sort((a, b) => (a.chineseName || '').localeCompare(b.chineseName || ''));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>黑名單</h2>
          <div className="page-desc">彙整「求職者資訊」黑名單勾選「是」的名單，資料來自求職者資訊的新增/編輯表單{!canSee && '（唯讀）'}</div>
        </div>
      </div>
      <input placeholder="搜尋姓名、身份證字號或廠商" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 280 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>姓名</th><th>身份證字號</th><th>廠商名稱</th><th>分店名稱</th><th>班別</th>
                <th>狀態</th><th>退保日期</th><th>最後工作日</th><th>備註</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.chineseName || '—'}</td>
                  <td>{r.idNumber || '—'}</td>
                  <td>{r.client || '—'}</td>
                  <td>{r.branch || '—'}</td>
                  <td>{r.shift || '—'}</td>
                  <td>{r.status || '—'}</td>
                  <td>{r.insuranceEndDate || '—'}</td>
                  <td>{r.lastWorkDate || '—'}</td>
                  <td>{r.notes || '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="muted">目前沒有黑名單資料。</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
