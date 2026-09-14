import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canView as computeCanView } from '../../lib/permissions';
import { exportEntityCSV } from '../../lib/csv';
import { parseROCDate } from './LeasesPage';

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function monthRange(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
}

// 承租中（未解約）且租期涵蓋所選月份的租約，才需要在那個月付款——比照宿舍
// 租賃主檔（LeasesPage.jsx）承租中／已退租的判斷方式，再加上起租日/結束日
// 是否落在月份範圍內。
function isDueInMonth(lease, range) {
  if (lease.terminationDate) return false;
  const start = parseROCDate(lease.leaseStart);
  const end = parseROCDate(lease.leaseEnd);
  if (start && start > range.end) return false;
  if (end && end < range.start) return false;
  return true;
}

const CSV_FIELDS = [
  { key: 'category', label: '科目' }, { key: 'name', label: '分類' }, { key: 'lesseeName', label: '承租單位名稱' },
  { key: 'rent', label: '金額' }, { key: 'paymentDay', label: '每月付款時間' }, { key: 'bankAccountName', label: '帳戶名稱' },
  { key: 'bank', label: '銀行' }, { key: 'branch', label: '分行' }, { key: 'branchCode', label: '分支代號' },
  { key: 'bankAccount', label: '帳號' }, { key: 'notes', label: '備註' },
];

// 依所選月份，從宿舍租賃主檔（dormMgmt_leases）即時算出當月需要匯款的租約
// 清單，純顯示＋下載，沒有另外的資料表——跟 tsaipei 系統裡「客戶請款計算」
// 依月份即時試算的模式一樣。
export default function RemittancePage() {
  const { system, role, overrides } = useOutletContext();
  const canViewPage = computeCanView(system, 'remittance', role, overrides);
  const { rows, loading, error } = useCollection('dormMgmt_leases');
  const [month, setMonth] = useState(currentMonthStr());

  const range = monthRange(month);
  const due = rows.filter((r) => isDueInMonth(r, range)).sort((a, b) => (a.paymentDay || '').localeCompare(b.paymentDay || ''));
  const total = due.reduce((sum, r) => sum + (Number(r.rent) || 0), 0);

  function handleDownload() {
    exportEntityCSV(due, CSV_FIELDS, `宿舍匯款_${month}`);
  }

  if (!canViewPage) return <div className="content">你沒有檢視這個頁面的權限。</div>;

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>宿舍匯款</h2>
          <div className="page-desc">依所選月份，列出當月需要付款的宿舍租約（承租中且租期涵蓋該月份），可下載當月轉帳清單（唯讀）</div>
        </div>
        <div className="row-actions">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button onClick={handleDownload}>下載此月份轉帳清單</button>
        </div>
      </div>
      {error ? (
        <p className="muted">讀取失敗，可能是這個帳號還沒有「宿舍租賃主檔」的檢視權限，請聯絡系統管理員確認。（錯誤訊息：{error.message}）</p>
      ) : loading ? <p className="muted">載入中…</p> : (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>共 {due.length} 筆，合計 {total.toLocaleString()} 元</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>科目</th><th>分類</th><th>承租單位名稱</th><th>金額</th><th>每月付款時間</th><th>帳戶名稱</th><th>銀行</th><th>分行</th><th>分支代號</th><th>帳號</th><th>備註</th></tr></thead>
              <tbody>
                {due.map((r) => (
                  <tr key={r.id}>
                    <td>{r.category || '—'}</td>
                    <td>{r.name || '—'}</td>
                    <td>{r.lesseeName || '—'}</td>
                    <td>{r.rent ? Number(r.rent).toLocaleString() : '—'}</td>
                    <td>{r.paymentDay || '—'}</td>
                    <td>{r.bankAccountName || '—'}</td>
                    <td>{r.bank || '—'}</td>
                    <td>{r.branch || '—'}</td>
                    <td>{r.branchCode || '—'}</td>
                    <td>{r.bankAccount || '—'}</td>
                    <td>{r.notes || '—'}</td>
                  </tr>
                ))}
                {due.length === 0 && <tr><td colSpan={11} className="muted">這個月份沒有需要付款的租約。</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
