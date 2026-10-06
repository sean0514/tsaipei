import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { lastCompletedMilestone } from './ApplicationProgressPage';

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

// Ported from submittedText/overallStatusTag in apps-script/Index.html —
// 跟 InternshipDocsPage 同一套判斷。
function submittedText(docs) {
  const names = docs.filter((d) => d.status !== '未提供').map((d) => d.docType);
  return names.length ? names.join('、') : '（尚未繳交）';
}
function overallStatusTag(docs) {
  const total = docs.length;
  const collected = docs.filter((d) => d.status !== '未提供').length;
  if (collected === 0) return <span className="tag tag-grey">尚未開始</span>;
  if (collected < total) return <span className="tag tag-amber">收集中 {collected}/{total}</span>;
  return <span className="tag tag-blue">已收齊，待確認完成</span>;
}

// 彙整「實習文件追蹤」「辦理簽證提醒」兩個頁面裡還沒完成的名單，行政人員
// 不用分別點進去檢查；純讀取彙整，資料來源都是各自分頁既有的集合，這裡
// 沒有編輯功能，要更新狀態請到原本的分頁操作（文件狀態要逐一切換、簽證
// 進度要在申辦進度追蹤調整，不是簡單的打勾，不適合搬到這裡直接編輯）。
export default function AdminPendingPage() {
  useOutletContext();
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { rows: internshipDocs, loading: loadingDocs } = useCollection('tsaipei_internshipDocs');
  const { rows: applicationProgress, loading: loadingProgress } = useCollection('tsaipei_applicationProgress');
  const [q, setQ] = useState('');

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);
  const searchQuery = q.trim().toLowerCase();

  // 實習文件追蹤：跟 InternshipDocsPage 的「處理中」同一套判斷——不是每份
  // 文件都「已核准」就算還沒完成。
  const docsByStudent = {};
  internshipDocs.forEach((d) => { (docsByStudent[d.studentId] ||= []).push(d); });
  let pendingDocStudentIds = Object.keys(docsByStudent).filter((sid) => {
    const docs = docsByStudent[sid];
    return !(docs.length > 0 && docs.every((d) => d.status === '已核准'));
  });
  if (searchQuery) {
    pendingDocStudentIds = pendingDocStudentIds.filter((sid) =>
      `${studentFullLabel(studentById(sid))} ${studentCompanyLabel(sid, ctx)}`.toLowerCase().includes(searchQuery));
  }
  const docsByCompany = {};
  pendingDocStudentIds.forEach((sid) => {
    const company = studentCompanyLabel(sid, ctx);
    (docsByCompany[company] ||= []).push(sid);
  });
  const docCompanies = Object.keys(docsByCompany).sort((a, b) => a.localeCompare(b));

  // 辦理簽證提醒：跟 VisaReminderPage 同一套判斷——申辦進度追蹤目前進度剛好
  // 顯示為「辦理簽證」的學生。
  const pendingVisa = applicationProgress
    .filter((r) => lastCompletedMilestone(r)?.key === 'visaDate')
    .filter((r) => !searchQuery || `${studentFullLabel(studentById(r.studentId))} ${studentCompanyLabel(r.studentId, ctx)}`.toLowerCase().includes(searchQuery));
  const visaByCompany = {};
  pendingVisa.forEach((r) => {
    const company = studentCompanyLabel(r.studentId, ctx);
    (visaByCompany[company] ||= []).push(r);
  });
  const visaCompanies = Object.keys(visaByCompany).sort((a, b) => a.localeCompare(b));

  const loading = loadingDocs || loadingProgress;

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>行政未完成事項</h2>
          <div className="page-desc">彙整實習文件追蹤（未繳齊文件）、辦理簽證提醒（即將辦理簽證）的名單，編輯請到原本的分頁操作（唯讀）</div>
        </div>
      </div>
      <input placeholder="搜尋學生或客戶" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>實習文件追蹤 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {pendingDocStudentIds.length} 位學生</span></h3>
            {docCompanies.length === 0 ? (
              <p className="muted">目前沒有未完成的項目。</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {docCompanies.map((company) => (
                  <div className="card" key={company}>
                    <h4 style={{ marginTop: 0 }}>{company} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{docsByCompany[company].length} 位學生</span></h4>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>學生</th><th>已繳交文件</th><th>狀態</th></tr></thead>
                        <tbody>
                          {docsByCompany[company].map((sid) => (
                            <tr key={sid}>
                              <td style={{ fontWeight: 600 }}>{studentFullLabel(studentById(sid))}</td>
                              <td>{submittedText(docsByStudent[sid])}</td>
                              <td>{overallStatusTag(docsByStudent[sid])}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>辦理簽證提醒 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {pendingVisa.length} 位學生</span></h3>
            {visaCompanies.length === 0 ? (
              <p className="muted">目前沒有未完成的項目。</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {visaCompanies.map((company) => (
                  <div className="card" key={company}>
                    <h4 style={{ marginTop: 0 }}>{company} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{visaByCompany[company].length} 位學生</span></h4>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>學生</th></tr></thead>
                        <tbody>
                          {visaByCompany[company].map((r) => (
                            <tr key={r.id}><td>{studentFullLabel(studentById(r.studentId))}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
