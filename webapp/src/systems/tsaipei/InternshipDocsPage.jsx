import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';

// HANDOFF.md says "9 種文件" but only lists 7 — going with what's actually
// named there (申請書/實習合約 were explicitly removed from the list).
export const DOC_TYPES = ['語言能力證明', '在學證明', '延畢證明', '夜間實習同意書', '護照影本', '保險證明', '其他'];
const STATUSES = ['未提供', '已收到', '已核准', '不適用'];

export default function InternshipDocsPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'internshipDocs', role, overrides);
  const { rows, loading, update, remove } = useCollection('tsaipei_internshipDocs');
  const { rows: students } = useCollection('tsaipei_students');
  const [studentFilter, setStudentFilter] = useState('');

  const studentName = (id) => students.find((s) => s.id === id)?.chineseName || '(未知)';
  const byStudent = {};
  rows
    .filter((r) => !studentFilter || r.studentId === studentFilter)
    .forEach((r) => { (byStudent[r.studentId] ||= []).push(r); });

  return (
    <div className="content">
      <div className="page-header"><h2>實習文件追蹤</h2></div>
      <div className="card">
        <select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)} style={{ marginBottom: 12 }}>
          <option value="">全部學生</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.chineseName}</option>)}
        </select>
        {loading ? <p className="muted">載入中…</p> : (
          Object.keys(byStudent).length === 0 ? <p className="muted">沒有資料</p> :
          Object.entries(byStudent).map(([studentId, docs]) => {
            const allDone = docs.every((d) => d.status === '已核准' || d.status === '不適用');
            return (
              <div key={studentId} style={{ marginBottom: 20 }}>
                <h4 style={{ marginBottom: 6 }}>{studentName(studentId)} {allDone && <span className="muted">（已完成繳交）</span>}</h4>
                <table>
                  <thead><tr><th>文件類型</th><th>狀態</th><th>收件日期</th>{canEditPage && <th></th>}</tr></thead>
                  <tbody>
                    {docs.map((d) => (
                      <tr key={d.id}>
                        <td>{d.docType}</td>
                        <td>
                          {canEditPage ? (
                            <select value={d.status || '未提供'} onChange={(e) => update(d.id, { status: e.target.value })}>
                              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : (d.status || '—')}
                        </td>
                        <td>{d.receivedDate || '—'}</td>
                        {canEditPage && <td><button className="danger" onClick={() => remove(d.id)}>刪除</button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
