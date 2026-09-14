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

// 下載內容比照銀行的「匯款格式」範本欄位順序/名稱（銀行 ACH 批次轉帳匯入用），
// 跟畫面上顯示的完整明細表是兩回事。
const REMIT_FORMAT_FIELDS = [
  { key: 'payeeName', label: '收款人名稱' },
  { key: 'payeeAccount', label: '收款人帳號' },
  { key: 'payeeBankCode', label: '收款行銀行代號' },
  { key: 'amount', label: '付款金額' },
  { key: 'payeeTaxId', label: '收款人企業識別碼' },
  { key: 'feeMethod', label: '手續費扣法' },
  { key: 'payeeFax', label: '收款人傳真' },
  { key: 'payeeEmail', label: '收款人email' },
  { key: 'notes', label: '備註' },
  { key: 'paymentAccount', label: '付款帳號' },
  { key: 'transactionDate', label: '交易日期' },
];

// 「計算日期」是租約裡記錄的每月幾號付款（1-31），交易日期＝所選月份＋計算
// 日期，用西元 YYYYMMDD 純數字字串表示；超過該月天數（例如 2 月 30 號）就
// 收斂到當月最後一天。
function computeTransactionDate(monthStr, calcDay) {
  if (!calcDay) return '';
  const [y, m] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const day = Math.min(Math.max(Number(calcDay), 1), daysInMonth);
  return `${y}${String(m).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

function toRemitRow(r, month) {
  return {
    payeeName: r.bankAccountName || '',
    payeeAccount: r.bankAccount || '',
    payeeBankCode: r.branchCode || '',
    amount: r.rent || '',
    payeeTaxId: '',
    feeMethod: '0',
    payeeFax: '',
    payeeEmail: '',
    notes: r.remittanceNotes || '',
    paymentAccount: r.remittanceAccount || '',
    transactionDate: computeTransactionDate(month, r.paymentCalcDay),
  };
}

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
    exportEntityCSV(due.map((r) => toRemitRow(r, month)), REMIT_FORMAT_FIELDS, `宿舍匯款_${month}`);
  }

  if (!canViewPage) return <div className="content">你沒有檢視這個頁面的權限。</div>;

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>宿舍匯款</h2>
          <div className="page-desc">依所選月份，列出當月需要付款的宿舍租約（承租中且租期涵蓋該月份），可下載符合銀行匯款格式的當月轉帳清單（唯讀）</div>
        </div>
        <div className="row-actions">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button onClick={handleDownload}>下載匯款格式</button>
        </div>
      </div>
      {error ? (
        <p className="muted">讀取失敗，可能是這個帳號還沒有「宿舍租賃主檔」的檢視權限，請聯絡系統管理員確認。（錯誤訊息：{error.message}）</p>
      ) : loading ? <p className="muted">載入中…</p> : (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>共 {due.length} 筆，合計 {total.toLocaleString()} 元</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>科目</th><th>分類</th><th>承租單位名稱</th><th>匯款帳號</th><th>金額</th><th>計算日期</th><th>交易日期</th><th>帳戶名稱</th><th>銀行</th><th>分行</th><th>分支代號</th><th>帳號</th><th>備註</th><th>匯款備註</th></tr></thead>
              <tbody>
                {due.map((r) => (
                  <tr key={r.id}>
                    <td>{r.category || '—'}</td>
                    <td>{r.name || '—'}</td>
                    <td>{r.lesseeName || '—'}</td>
                    <td>{r.remittanceAccount || '—'}</td>
                    <td>{r.rent ? Number(r.rent).toLocaleString() : '—'}</td>
                    <td>{r.paymentCalcDay || '—'}</td>
                    <td>{computeTransactionDate(month, r.paymentCalcDay) || '—'}</td>
                    <td>{r.bankAccountName || '—'}</td>
                    <td>{r.bank || '—'}</td>
                    <td>{r.branch || '—'}</td>
                    <td>{r.branchCode || '—'}</td>
                    <td>{r.bankAccount || '—'}</td>
                    <td>{r.notes || '—'}</td>
                    <td>{r.remittanceNotes || '—'}</td>
                  </tr>
                ))}
                {due.length === 0 && <tr><td colSpan={14} className="muted">這個月份沒有需要付款的租約。</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
