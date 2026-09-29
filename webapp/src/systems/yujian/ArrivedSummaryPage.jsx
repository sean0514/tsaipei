import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { exportEntityCSV } from '../../lib/csv';
import { FIELDS } from './ApplicationProgressPage';

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'confirmedClosed', label: '已結案' }];

// 已入台名單依「入境時間」區間篩選、下載總表用的獨立頁面（跟已入台名單本身
// 的清單畫面分開，這裡只做區間篩選＋預覽＋下載）。
export default function ArrivedSummaryPage() {
  useOutletContext();
  const { rows, loading } = useCollection('yujian_arrivedList');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  const rangeRows = rows.filter((r) => {
    if (!r.entryDate) return false;
    if (rangeStart && r.entryDate < rangeStart) return false;
    if (rangeEnd && r.entryDate > rangeEnd) return false;
    return true;
  }).sort((a, b) => (a.entryDate || '').localeCompare(b.entryDate || ''));

  function handleDownload() {
    exportEntityCSV(rangeRows, CSV_FIELDS, `已入台名單_總表_${rangeStart || '起'}~${rangeEnd || '訖'}`);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>下載總表</h2>
          <div className="page-desc">依入境時間區間篩選「已入台名單」，預覽後下載完整資料</div>
        </div>
      </div>
      <div className="row-actions" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 13 }}>入境時間區間：</span>
        <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
        <span className="muted">～</span>
        <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
        <button className="primary" onClick={handleDownload}>下載總表</button>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <p className="muted" style={{ marginTop: 0 }}>符合區間 {rangeRows.length} 筆（任一端留空就不限制那一邊）</p>
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>雇主姓名</th><th>編號</th><th>國籍</th><th>入境時間</th><th>送工時間</th><th>進度狀態</th></tr></thead>
            <tbody>
              {rangeRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.employerName || '—'}</td>
                  <td>{r.caseNo || '—'}</td>
                  <td>{r.nationality || '—'}</td>
                  <td>{r.entryDate || '—'}</td>
                  <td>{r.dispatchDate || '—'}</td>
                  <td>{r.status || '—'}</td>
                </tr>
              ))}
              {rangeRows.length === 0 && <tr><td colSpan={6} className="muted">沒有符合區間的資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
