import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { exportEntityCSV } from '../../lib/csv';

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// 會計專用：從日常支出申請裡挑出項目名稱包含「押金」的「支出」類紀錄
// （公司付出去、之後要討回來的押金，例如「宿舍押金」），跟其他一般支出
// 分開列成單獨一份追蹤清單，不用在日常支出申請一大串清單裡自己找。按
// 「已收回押金」就是這筆押金真的拿回來了，直接沿用日常支出申請原本的
// confirmedClosed 欄位結案（跟那邊「結案」按鈕是同一套機制），結案後
// 這裡的清單、日常支出申請的主列表都會一起把它隱藏（資料還在，下載完整
// 資料/已結案名單仍找得到，也可以從已結案名單復原)。
const DEPOSIT_ITEM_KEYWORD = '押金';

export default function DepositTrackingPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'depositTracking', role, overrides);
  const { rows: applications, loading, update } = useCollection('tsaipei_dailyExpenseApplications');
  const { rows: students } = useCollection('tsaipei_students');
  const [q, setQ] = useState('');

  const searchQuery = q.trim().toLowerCase();
  const deposits = applications
    .filter((r) => (r.type || '支出') === '支出')
    .filter((r) => (r.item || '').includes(DEPOSIT_ITEM_KEYWORD))
    .filter((r) => !r.confirmedClosed && !r.archived)
    .filter((r) => !searchQuery || `${r.applicant || ''} ${r.item || ''} ${r.purpose || ''} ${studentFullLabel(students.find((s) => s.id === r.studentId))}`.toLowerCase().includes(searchQuery))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const total = deposits.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  async function handleRecovered(r) {
    if (!window.confirm(`確定「${r.item || '押金'}」(${r.currency || '台幣'} ${Number(r.amount || 0).toLocaleString()}) 這筆押金已經收回了嗎？結案後會從這份清單消失（已結案名單仍可復原）。`)) return;
    try {
      await update(r.id, { confirmedClosed: true });
    } catch (err) {
      alert(`結案失敗：${err.message || err}`);
    }
  }

  function handleDownload() {
    const rows = deposits.map((r) => ({
      applicant: r.applicant || '',
      studentName: studentFullLabel(students.find((s) => s.id === r.studentId)),
      item: r.item || '',
      date: r.date || '',
      amount: Number(r.amount) || 0,
      currency: r.currency || '台幣',
      purpose: r.purpose || '',
      status: r.status || '',
    }));
    exportEntityCSV(rows, [
      { key: 'applicant', label: '申請人' }, { key: 'studentName', label: '學生姓名' },
      { key: 'item', label: '項目' }, { key: 'date', label: '日期' },
      { key: 'amount', label: '金額' }, { key: 'currency', label: '幣別' },
      { key: 'purpose', label: '用途說明' }, { key: 'status', label: '審核狀態' },
    ], '押金追蹤');
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>押金追蹤</h2>
          <div className="page-desc">從日常支出申請自動挑出項目名稱包含「押金」的支出類紀錄（例如宿舍押金），列成單獨清單方便追蹤；按「已收回押金」結案後從這裡消失（跟日常支出申請的「結案」共用同一套機制，已結案名單可復原）{!canEditPage && '（唯讀）'}</div>
        </div>
        <button onClick={handleDownload}>下載清單</button>
      </div>
      <input placeholder="搜尋申請人、學生、項目或用途說明" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>尚未收回的押金 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{deposits.length} 筆，合計 {total.toLocaleString()} 元</span></h3>
          <div className="table-wrap sticky-header"><table>
            <thead><tr><th>申請人</th><th>學生姓名</th><th>項目</th><th>日期</th><th>金額</th><th>用途說明</th><th>審核狀態</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {deposits.map((r) => (
                <tr key={r.id}>
                  <td>{r.applicant || '—'}</td>
                  <td>{studentFullLabel(students.find((s) => s.id === r.studentId)) || '—'}</td>
                  <td>{r.item || '—'}</td>
                  <td>{r.date || '—'}</td>
                  <td>{r.amount ? `${r.currency || '台幣'} ${Number(r.amount).toLocaleString()}` : '—'}</td>
                  <td>{r.purpose || '—'}</td>
                  <td>{r.status || '—'}</td>
                  {canEditPage && <td><button className="primary" onClick={() => handleRecovered(r)}>已收回押金</button></td>}
                </tr>
              ))}
              {deposits.length === 0 && <tr><td colSpan={canEditPage ? 8 : 7} className="muted">{searchQuery ? '沒有符合搜尋條件的紀錄。' : '目前沒有尚未收回的押金。'}</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
