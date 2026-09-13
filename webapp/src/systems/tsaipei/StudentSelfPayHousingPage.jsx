import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { exportEntityCSV } from '../../lib/csv';

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// Ported from monthRange()/dateOverlapDays() in apps-script/Index.html —
// same 當月天數 rule used by 客戶請款計算/在台簽證追蹤.
function monthRange(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start, end, daysInMonth: end.getDate() };
}

function dateOverlapDays(rangeStart, rangeEnd, entryStr, exitStr) {
  if (!entryStr) return 0;
  const entry = new Date(`${entryStr}T00:00:00`);
  if (Number.isNaN(entry.getTime())) return 0;
  const exit = exitStr ? new Date(`${exitStr}T00:00:00`) : rangeEnd;
  const s = entry < rangeStart ? rangeStart : entry;
  const e = exit > rangeEnd ? rangeEnd : exit;
  if (e < s) return 0;
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

// Ported from renderStudentSelfPayHousing in apps-script/Index.html — a
// read-only report of housing records paid for by the student themselves.
// 依宿舍分類（原本依客戶/專案分類），並依使用者要求新增「當月天數」「金額」欄位
// 與依月份下載報表。
export default function StudentSelfPayHousingPage() {
  useOutletContext();
  const { rows: housingRecords, loading } = useCollection('tsaipei_housingRecords');
  const { rows: students } = useCollection('tsaipei_students');
  const [q, setQ] = useState('');
  const [month, setMonth] = useState(currentMonthStr());

  const range = monthRange(month);
  const query = q.trim().toLowerCase();
  const filtered = housingRecords.filter((h) => {
    if (h.payer !== '學生自付') return false;
    if (h.completed) return false;
    if (!query) return true;
    const text = `${studentFullLabel(students.find((s) => s.id === h.studentId))} ${h.type || ''}`.toLowerCase();
    return text.includes(query);
  });

  function statsFor(h) {
    const days = dateOverlapDays(range.start, range.end, h.checkIn, h.checkOut);
    const amount = h.monthlyRent ? Math.round((Number(h.monthlyRent) / range.daysInMonth) * days) : 0;
    return { days, amount };
  }

  const groups = {};
  filtered.forEach((h) => {
    const key = h.type || '未指定宿舍';
    (groups[key] ||= []).push(h);
  });
  const groupKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  function handleDownload() {
    const rows = filtered.map((h) => {
      const { days, amount } = statsFor(h);
      return {
        dorm: h.type || '',
        studentName: studentFullLabel(students.find((s) => s.id === h.studentId)),
        address: h.address || '',
        managers: [h.contactName, h.contactName2].filter(Boolean).join('、'),
        checkIn: h.checkIn || '',
        checkOut: h.checkOut || '',
        days,
        amount,
      };
    });
    exportEntityCSV(rows, [
      { key: 'dorm', label: '宿舍名稱' }, { key: 'studentName', label: '學生' },
      { key: 'address', label: '地址' }, { key: 'managers', label: '宿舍管理員' },
      { key: 'checkIn', label: '入住日' }, { key: 'checkOut', label: '退住日' },
      { key: 'days', label: '當月天數' }, { key: 'amount', label: '金額' },
    ], `學生自付宿舍_${month}`);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>學生自付宿舍</h2>
          <div className="page-desc">列出住宿費由學生自行負擔的學生名單，依宿舍分類；「當月天數」「金額」依所選月份與每月租金試算</div>
        </div>
        <div className="row-actions">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button onClick={handleDownload}>下載此月份報表</button>
        </div>
      </div>
      <input placeholder="搜尋學生或宿舍名稱" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        groupKeys.length === 0 ? <p className="muted">{query ? '沒有符合搜尋條件的紀錄。' : '目前沒有付款方式為「學生自付」的住宿紀錄。'}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {groupKeys.map((key) => (
              <div className="card" key={key}>
                <h3 style={{ marginTop: 0 }}>{key} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[key].length} 位學生</span></h3>
                <div className="table-wrap"><table>
                  <thead><tr><th>學生</th><th>宿舍名稱</th><th>地址</th><th>宿舍管理員</th><th>入住日</th><th>退住日</th><th>當月天數</th><th>金額</th></tr></thead>
                  <tbody>
                    {groups[key].map((h) => {
                      const { days, amount } = statsFor(h);
                      return (
                        <tr key={h.id}>
                          <td style={{ fontWeight: 600 }}>{studentFullLabel(students.find((s) => s.id === h.studentId))}</td>
                          <td>{h.type || '—'}</td>
                          <td>{h.address || '—'}</td>
                          <td>{[h.contactName, h.contactName2].filter(Boolean).join('、') || '—'}</td>
                          <td>{h.checkIn || '—'}</td>
                          <td>{h.checkOut || '—'}</td>
                          <td>{days}</td>
                          <td>{amount.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
