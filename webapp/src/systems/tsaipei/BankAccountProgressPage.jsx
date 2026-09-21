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

// Ported from studentCompanyName/matchPositionLabel in apps-script/Index.html.
function studentCompanyLabel(studentId, { matches, admittedList, positions }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  if (!m) return '未指定客戶';
  const p = positions.find((pp) => pp.id === m.positionId);
  if (!p) return '未指定客戶';
  return [p.projectCode, p.company, m.venue].filter(Boolean).join(' ') || '未指定客戶';
}

const CSV_FIELDS = [
  { key: 'studentName', label: '學生' }, { key: 'company', label: '客戶' },
  { key: 'firstEntryDate', label: '入台日期' }, { key: 'basicDocsReceived', label: '基資表' },
  { key: 'bankAccountReceived', label: '銀行帳戶' },
];

export default function BankAccountProgressPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'inTaiwanTracking', role, overrides);
  const { rows: visaRecords, loading } = useCollection('tsaipei_inTaiwanVisa');
  const { rows: progressRows, add: addProgress, update: updateProgress } = useCollection('tsaipei_bankAccountProgress');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const [q, setQ] = useState('');

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);

  // 已入台名單：在台簽證追蹤裡填了第一次入台時間的學生，自動列入，不需要另外維護。
  const arrived = visaRecords.filter((v) => v.firstEntryDate);
  const progressByStudent = {};
  progressRows.forEach((p) => { progressByStudent[p.studentId] = p; });

  const searchQuery = q.trim().toLowerCase();
  const visible = arrived.filter((v) => !searchQuery || `${studentFullLabel(studentById(v.studentId))} ${studentCompanyLabel(v.studentId, ctx)}`.toLowerCase().includes(searchQuery));

  const byCompany = {};
  visible.forEach((v) => {
    const company = studentCompanyLabel(v.studentId, ctx);
    (byCompany[company] ||= []).push(v);
  });
  const companies = Object.keys(byCompany).sort((a, b) => a.localeCompare(b));

  async function toggle(studentId, field, checked) {
    const existing = progressByStudent[studentId];
    if (existing) await updateProgress(existing.id, { [field]: checked });
    else await addProgress({ studentId, basicDocsReceived: false, bankAccountReceived: false, [field]: checked });
  }

  function handleDownload() {
    const data = arrived.map((v) => {
      const p = progressByStudent[v.studentId] || {};
      return {
        studentName: studentFullLabel(studentById(v.studentId)),
        company: studentCompanyLabel(v.studentId, ctx),
        firstEntryDate: v.firstEntryDate,
        basicDocsReceived: p.basicDocsReceived ? '是' : '否',
        bankAccountReceived: p.bankAccountReceived ? '是' : '否',
      };
    });
    exportEntityCSV(data, CSV_FIELDS, '開戶進度追蹤');
  }

  function ProgressTable({ items }) {
    return (
      <div className="table-wrap">
        <table>
          <thead><tr><th>學生</th><th>入台日期</th><th>基資表</th><th>銀行帳戶</th></tr></thead>
          <tbody>
            {items.map((v) => {
              const p = progressByStudent[v.studentId] || {};
              return (
                <tr key={v.id}>
                  <td>{studentFullLabel(studentById(v.studentId))}</td>
                  <td>{v.firstEntryDate}</td>
                  <td>
                    {canEditPage ? (
                      <input type="checkbox" checked={!!p.basicDocsReceived} onChange={(e) => toggle(v.studentId, 'basicDocsReceived', e.target.checked)} />
                    ) : (p.basicDocsReceived ? '是' : '否')}
                  </td>
                  <td>
                    {canEditPage ? (
                      <input type="checkbox" checked={!!p.bankAccountReceived} onChange={(e) => toggle(v.studentId, 'bankAccountReceived', e.target.checked)} />
                    ) : (p.bankAccountReceived ? '是' : '否')}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={4} className="muted">沒有資料</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>開戶進度追蹤</h2>
          <div className="page-desc">
            在台簽證追蹤裡填了第一次入台時間的學生會自動列入此清單；基資表包含申請書、在職證明、護照、簽證，收齊才勾選
            {!canEditPage && '（唯讀）'}
          </div>
        </div>
        <button onClick={handleDownload}>下載完整資料</button>
      </div>
      <input placeholder="搜尋學生或客戶" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        companies.length === 0 ? <p className="muted">目前沒有已入台的學生。</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {companies.map((company) => (
              <div className="card" key={company}>
                <h4 style={{ marginTop: 0 }}>{company} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{byCompany[company].length} 位學生</span></h4>
                <ProgressTable items={byCompany[company]} />
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
