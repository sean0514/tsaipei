import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { lastCompletedMilestone } from './ApplicationProgressPage';
import { t } from '../../lib/i18n';

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

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

// 複製自 systems/tsaipei/VisaReminderPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function VisaReminderPage() {
  const { lang } = useOutletContext();
  const { rows, loading } = useCollection('vietnam_applicationProgress');
  const { rows: students } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: positions } = useCollection('vietnam_positions');
  const [q, setQ] = useState('');

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);
  const searchQuery = q.trim().toLowerCase();

  const pending = rows
    .filter((r) => lastCompletedMilestone(r)?.key === 'visaDate')
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
          <h2>{t('辦理簽證提醒', lang)}</h2>
          <div className="page-desc">{t('依客戶分類，列出申辦進度追蹤裡目前進度顯示為「辦理簽證」的學生；進度離開辦理簽證即自動從清單移除（唯讀）', lang)}</div>
        </div>
      </div>
      <input placeholder={t('搜尋學生或客戶', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        companies.length === 0 ? <p className="muted">{t('目前沒有待辦理簽證的學生。', lang)}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {companies.map(({ company, items }) => (
              <div className="card" key={company}>
                <h3 style={{ marginTop: 0 }}>{company} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{items.length} {t('位學生', lang)}</span></h3>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>{t('學生', lang)}</th></tr></thead>
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
