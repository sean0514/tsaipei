import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { exportEntityCSV } from '../../lib/csv';
import { employeeDaysInMonth, currentMonthStr } from '../../lib/dispatchBilling';

// 比照 tsaipei StudentMasterSheetPage 的月份彙整模式：以「在職/離職概況」為
// 基準，串接求職者基本資料，給會計人員按月下載薪資相關資訊使用。
export default function EmployeeMasterSheetPage() {
  useOutletContext();
  const { rows: employmentStatusRecords, loading } = useCollection('dispatch_employmentStatus');
  const { rows: jobSeekers } = useCollection('dispatch_jobSeekers');
  const [month, setMonth] = useState(currentMonthStr());
  const [q, setQ] = useState('');

  const rows = employmentStatusRecords.map((r) => {
    const s = jobSeekers.find((x) => x.id === r.jobSeekerId);
    return { record: r, jobSeeker: s, workDays: employeeDaysInMonth(r, month) };
  });

  const query = q.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (!query) return true;
    const text = `${r.jobSeeker?.chineseName || ''} ${r.record.client || ''}`.toLowerCase();
    return text.includes(query);
  });

  function handleDownload() {
    const exportRows = filtered.map((r) => ({
      client: r.record.client || '', name: r.jobSeeker?.chineseName || '(已刪除)', idNumber: r.jobSeeker?.idNumber || '',
      position: r.record.position || '', startDate: r.record.startDate || '', endDate: r.record.endDate || '',
      workDays: r.workDays, salary: r.record.salary || '',
    }));
    exportEntityCSV(exportRows, [
      { key: 'client', label: '客戶' }, { key: 'name', label: '姓名' }, { key: 'idNumber', label: '身分證號' },
      { key: 'position', label: '職務' }, { key: 'startDate', label: '到職日' }, { key: 'endDate', label: '離職日' },
      { key: 'workDays', label: '當月在職天數' }, { key: 'salary', label: '底薪' },
    ], `員工資料總檔_${month}`);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>員工資料總檔</h2>
          <div className="page-desc">依月份彙整所有在職/離職紀錄的客戶、職務與薪資資訊</div>
        </div>
        <button onClick={handleDownload}>下載此月份資料</button>
      </div>
      <div className="row-actions" style={{ marginBottom: 16 }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <input placeholder="搜尋姓名或客戶" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead>
              <tr><th>客戶</th><th>姓名</th><th>身分證號</th><th>職務</th><th>到職日</th><th>離職日</th><th>當月在職天數</th><th>底薪</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.record.id}>
                  <td>{r.record.client || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{r.jobSeeker?.chineseName || '(已刪除)'}</td>
                  <td>{r.jobSeeker?.idNumber || '—'}</td>
                  <td>{r.record.position || '—'}</td>
                  <td>{r.record.startDate || '—'}</td>
                  <td>{r.record.endDate || '—'}</td>
                  <td>{r.workDays}</td>
                  <td>{r.record.salary || '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="muted">{query ? '沒有符合搜尋條件的紀錄。' : '目前沒有在職/離職紀錄。'}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
