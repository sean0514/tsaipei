import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { STAGES } from './ApplicationProgressPage';

const VISA_STAGE_INDEX = STAGES.indexOf('辦理簽證');

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

// 學生「確認錄取」後（見 AdmittedListPage.jsx）會自動建立一筆申辦進度追蹤
// 紀錄，本頁只是把申辦進度追蹤裡「辦理簽證」這一步還沒走完（含正在辦理中）
// 的學生名單，依客戶整理出來提醒；進度一旦超過「辦理簽證」就會自動從這裡
// 消失。純顯示用途，沒有編輯功能，要更新進度請到申辦進度追蹤頁面。
export default function VisaReminderPage() {
  useOutletContext();
  const { rows, loading } = useCollection('tsaipei_applicationProgress');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const [q, setQ] = useState('');

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);
  const searchQuery = q.trim().toLowerCase();

  const pending = rows
    .filter((r) => {
      const idx = STAGES.indexOf(r.currentStage);
      return idx < 0 || idx <= VISA_STAGE_INDEX;
    })
    .filter((r) => !searchQuery || `${studentFullLabel(studentById(r.studentId))} ${studentCompanyLabel(r.studentId, ctx)}`.toLowerCase().includes(searchQuery));

  const byCompany = {};
  pending.forEach((r) => {
    const company = studentCompanyLabel(r.studentId, ctx);
    (byCompany[company] ||= []).push(r);
  });
  const companies = Object.keys(byCompany).sort((a, b) => a.localeCompare(b)).map((company) => ({
    company,
    items: byCompany[company].slice().sort((a, b) =>
      studentFullLabel(studentById(a.studentId)).localeCompare(studentFullLabel(studentById(b.studentId)))
    ),
  }));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>辦理簽證提醒</h2>
          <div className="page-desc">依客戶分類，列出申辦進度追蹤裡「辦理簽證」尚未完成的學生；進度更新到辦理簽證之後的步驟即自動從清單移除（唯讀）</div>
        </div>
      </div>
      <input placeholder="搜尋學生或客戶" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        companies.length === 0 ? <p className="muted">目前沒有待辦理簽證的學生。</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {companies.map(({ company, items }) => (
              <div className="card" key={company}>
                <h3 style={{ marginTop: 0 }}>{company} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{items.length} 位學生</span></h3>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>學生</th></tr></thead>
                    <tbody>
                      {items.map((r) => (
                        <tr key={r.id}><td>{studentFullLabel(studentById(r.studentId))}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
