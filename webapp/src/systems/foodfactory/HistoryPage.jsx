import { useMemo, useState } from 'react';
import { exportEntityCSV } from '../../lib/csv';
import pettyCashLegacy from '../../data/history/pettyCashLegacy.json';
import otherInfoLegacy from '../../data/history/otherInfoLegacy.json';
import stockSnapshot0908 from '../../data/history/stockSnapshot0908.json';
import customerStatement0920 from '../../data/history/customerStatement0920.json';
import customerStats from '../../data/history/customerStats.json';
import customerPayments from '../../data/history/customerPayments.json';
import customerListLegacy from '../../data/history/customerListLegacy.json';
import advancePayments from '../../data/history/advancePayments.json';

// 舊 Excel 系統轉入的歷史資料，遷移到本系統前的紀錄，僅供查閱/下載，不可編輯。
const DATASETS = [
  { key: 'pettyCash', label: '零用金(舊)', rows: pettyCashLegacy },
  { key: 'otherInfo', label: '其他資訊', rows: otherInfoLegacy },
  { key: 'stockSnapshot', label: '庫存快照(0908)', rows: stockSnapshot0908 },
  { key: 'customerStatement', label: '客戶對帳紀錄(0920)', rows: customerStatement0920 },
  { key: 'customerStats', label: '客戶統計紀錄', rows: customerStats },
  { key: 'customerPayments', label: '客戶回款紀錄', rows: customerPayments },
  { key: 'customerList', label: '客戶名單(舊)', rows: customerListLegacy },
  { key: 'advancePayments', label: '代墊款', rows: advancePayments },
];

export default function HistoryPage() {
  const [activeKey, setActiveKey] = useState(DATASETS[0].key);
  const [q, setQ] = useState('');

  const active = DATASETS.find((d) => d.key === activeKey);
  const columns = useMemo(() => (active.rows.length ? Object.keys(active.rows[0]) : []), [active]);

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = active.rows.filter((r) => !searchQuery || columns.some((c) => String(r[c] ?? '').toLowerCase().includes(searchQuery)));

  function handleDownload() {
    const fields = columns.map((c) => ({ key: c, label: c }));
    exportEntityCSV(active.rows, fields, active.label);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>歷史資料</h2>
        <button onClick={handleDownload}>下載完整資料</button>
      </div>
      <p className="muted">遷移到本系統前的舊資料，僅供查閱與下載，不可編輯。</p>
      <div className="row-actions" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        {DATASETS.map((d) => (
          <button
            key={d.key}
            className={d.key === activeKey ? 'primary' : ''}
            onClick={() => { setActiveKey(d.key); setQ(''); }}
          >
            {d.label}（{d.rows.length}）
          </button>
        ))}
      </div>
      <input placeholder="搜尋此資料表所有欄位" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
      <div className="card" style={{ overflowX: 'auto' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {filteredRows.slice(0, 500).map((r, idx) => (
                <tr key={idx}>
                  {columns.map((c) => <td key={c}>{r[c] === null || r[c] === undefined || r[c] === '' ? '—' : String(r[c])}</td>)}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={columns.length} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        </div>
        {filteredRows.length > 500 && (
          <p className="muted" style={{ marginTop: 8 }}>
            共 {filteredRows.length} 筆，畫面僅顯示前 500 筆，請縮小搜尋範圍或使用下載完整資料查看全部。
          </p>
        )}
      </div>
    </div>
  );
}
