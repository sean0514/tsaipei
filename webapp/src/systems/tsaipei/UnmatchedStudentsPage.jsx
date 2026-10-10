import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { exportEntityCSV } from '../../lib/csv';

function studentFullLabel(s) {
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// 學生尚未安排：純彙整頁面，不用手動維護——只要這個學生在「媒合紀錄」裡
// 完全沒有任何一筆紀錄，就自動列進這裡；一旦業務在媒合紀錄頁面幫他配對
// 職缺，就會自動從這個清單消失。已結案的學生不計入（跟其他分頁同一套
// confirmedClosed 慣例）。
export default function UnmatchedStudentsPage() {
  useOutletContext();
  const { rows: students, loading } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const [q, setQ] = useState('');

  const matchedStudentIds = new Set(matches.map((m) => m.studentId).filter(Boolean));
  const unmatched = students.filter((s) => !s.confirmedClosed && !matchedStudentIds.has(s.id));

  const searchQuery = q.trim().toLowerCase();
  const filtered = unmatched
    .filter((s) => !searchQuery || `${studentFullLabel(s)} ${s.school || ''} ${s.nationality || ''}`.toLowerCase().includes(searchQuery))
    .sort((a, b) => studentFullLabel(a).localeCompare(studentFullLabel(b)));

  function handleDownload() {
    const rows = filtered.map((s) => ({
      name: studentFullLabel(s), nationality: s.nationality || '', school: s.school || '',
      status: s.status || '', startDate: s.startDate || '', phone: s.phone || '',
    }));
    exportEntityCSV(rows, [
      { key: 'name', label: '學生姓名' }, { key: 'nationality', label: '國籍' }, { key: 'school', label: '就讀學校' },
      { key: 'status', label: '狀態' }, { key: 'startDate', label: '實習開始日' }, { key: 'phone', label: '電話' },
    ], '學生尚未安排');
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>學生尚未安排</h2>
          <div className="page-desc">自動列出目前在「媒合紀錄」裡完全沒有任何一筆紀錄的學生；一旦幫學生配對職缺，就會自動從這裡消失，不用手動維護</div>
        </div>
        <div className="row-actions">
          <button onClick={handleDownload}>下載名單</button>
        </div>
      </div>
      <input placeholder="搜尋學生、學校或國籍" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>尚未安排名單 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{filtered.length} 位學生</span></h3>
          <div className="table-wrap"><table>
            <thead><tr><th>學生姓名</th><th>國籍</th><th>就讀學校</th><th>狀態</th><th>實習開始日</th><th>電話</th></tr></thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{studentFullLabel(s)}</td>
                  <td>{s.nationality || '—'}</td>
                  <td>{s.school || '—'}</td>
                  <td>{s.status || '—'}</td>
                  <td>{s.startDate || '—'}</td>
                  <td>{s.phone || '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="muted">{searchQuery ? '沒有符合搜尋條件的學生。' : '目前所有學生都已經安排媒合了。'}</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
