import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { exportEntityCSV } from '../../lib/csv';

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// Ported from studentProjectCompanyKey/matchPositionLabel in apps-script/Index.html.
function studentProjectCompanyKey(studentId, { matches, admittedList, positions }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  if (!m) return '未指定客戶';
  const p = positions.find((pp) => pp.id === m.positionId);
  if (!p) return '未指定客戶';
  const parts = [p.projectCode, p.company, m.venue].filter(Boolean);
  return parts.join(' ') || '未指定客戶';
}

// Ported from renderStudentSelfPayHousing in apps-script/Index.html — a
// read-only report of housing records paid for by the student themselves.
export default function StudentSelfPayHousingPage() {
  useOutletContext();
  const { rows: housingRecords, loading } = useCollection('tsaipei_housingRecords');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const [q, setQ] = useState('');

  const ctx = { matches, admittedList, positions };
  const query = q.trim().toLowerCase();
  const filtered = housingRecords.filter((h) => {
    if (h.payer !== '學生自付') return false;
    if (h.completed) return false;
    if (!query) return true;
    const text = `${studentFullLabel(students.find((s) => s.id === h.studentId))} ${studentProjectCompanyKey(h.studentId, ctx)} ${h.type || ''}`.toLowerCase();
    return text.includes(query);
  });

  const groups = {};
  filtered.forEach((h) => {
    const key = studentProjectCompanyKey(h.studentId, ctx);
    (groups[key] ||= []).push(h);
  });
  const groupKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  function handleDownload() {
    const rows = filtered.map((h) => ({
      key: studentProjectCompanyKey(h.studentId, ctx),
      studentName: studentFullLabel(students.find((s) => s.id === h.studentId)),
      type: h.type || '',
      address: h.address || '',
      managers: [h.contactName, h.contactName2].filter(Boolean).join('、'),
      checkIn: h.checkIn || '',
      checkOut: h.checkOut || '',
    }));
    exportEntityCSV(rows, [
      { key: 'key', label: '客戶/專案' }, { key: 'studentName', label: '學生' }, { key: 'type', label: '宿舍名稱' },
      { key: 'address', label: '地址' }, { key: 'managers', label: '宿舍管理員' }, { key: 'checkIn', label: '入住日' }, { key: 'checkOut', label: '退宿日' },
    ], '學生自付宿舍');
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>學生自付宿舍</h2>
        <button onClick={handleDownload}>下載名單</button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>列出住宿費由學生自行負擔的學生名單。</p>
      <input placeholder="搜尋學生、客戶或宿舍名稱" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        groupKeys.length === 0 ? <p className="muted">{query ? '沒有符合搜尋條件的紀錄。' : '目前沒有付款方式為「學生自付」的住宿紀錄。'}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {groupKeys.map((key) => (
              <div className="card" key={key}>
                <h3 style={{ marginTop: 0 }}>{key} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[key].length} 位學生</span></h3>
                <div className="table-wrap"><table>
                  <thead><tr><th>學生</th><th>宿舍名稱</th><th>地址</th><th>宿舍管理員</th><th>入住期間</th></tr></thead>
                  <tbody>
                    {groups[key].map((h) => (
                      <tr key={h.id}>
                        <td style={{ fontWeight: 600 }}>{studentFullLabel(students.find((s) => s.id === h.studentId))}</td>
                        <td>{h.type || '—'}</td>
                        <td>{h.address || '—'}</td>
                        <td>{[h.contactName, h.contactName2].filter(Boolean).join('、') || '—'}</td>
                        <td>{h.checkIn || '—'} ~ {h.checkOut || '—'}</td>
                      </tr>
                    ))}
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
