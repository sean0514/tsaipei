import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canView } from '../../lib/permissions';

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

// 這是原本 Apps Script 版沒有的新頁面（依使用者要求新增）：把「還沒入台」的
// 學生（申辦進度尚未到達「入台」）跟「已在台、還沒離台」但已知下一次離台
// 時間的學生，各自整理成一份預計名單，方便一眼看到近期要處理的入出境事務。
export default function ExpectedArrivalPage() {
  const { system, role, overrides } = useOutletContext();
  const canSee = canView(system, 'inTaiwanTracking', role, overrides);
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { rows: progress, loading: loadingProgress } = useCollection('tsaipei_applicationProgress');
  const { rows: visaRecords, loading: loadingVisa } = useCollection('tsaipei_inTaiwanVisa');

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);
  const today = new Date().toISOString().slice(0, 10);

  // 預計入台：申辦進度還沒到「入台」階段的學生，依客戶分類。
  const pendingArrival = progress.filter((p) => p.currentStage !== '入台');
  const byCompanyArrival = {};
  pendingArrival.forEach((p) => {
    const company = studentCompanyLabel(p.studentId, ctx);
    (byCompanyArrival[company] ||= []).push(p);
  });
  const arrivalCompanies = Object.keys(byCompanyArrival).sort((a, b) => a.localeCompare(b));

  // 預計離台：已在台、但第二次離台時間還沒到期的學生，取下一個已知的離台時間
  // （第二次離台優先，沒有才看第一次），依日期排序，越快離台排越前面；
  // 完全沒有填離台時間的排在最後。
  const pendingDeparture = visaRecords
    .filter((v) => !(v.secondExitDate && v.secondExitDate <= today))
    .map((v) => ({ v, nextExit: v.secondExitDate || v.firstExitDate || '' }))
    .sort((a, b) => {
      if (!a.nextExit && !b.nextExit) return 0;
      if (!a.nextExit) return 1;
      if (!b.nextExit) return -1;
      return a.nextExit.localeCompare(b.nextExit);
    });

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>預計入台/離台</h2>
          <div className="page-desc">申辦進度尚未到達「入台」的學生，以及已在台、下一個已知離台時間尚未到期的學生{!canSee && '（唯讀）'}</div>
        </div>
      </div>
      {(loadingProgress || loadingVisa) ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>預計入台 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {pendingArrival.length} 位學生</span></h3>
            {arrivalCompanies.length === 0 ? <p className="muted">目前沒有等待入台的學生。</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {arrivalCompanies.map((company) => (
                  <div className="card" key={company}>
                    <h4 style={{ marginTop: 0 }}>{company} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{byCompanyArrival[company].length} 位學生</span></h4>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>學生</th><th>目前進度</th></tr></thead>
                        <tbody>
                          {byCompanyArrival[company].map((p) => (
                            <tr key={p.id}>
                              <td>{studentFullLabel(studentById(p.studentId))}</td>
                              <td>{p.currentStage || '—'}</td>
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
            <h3 style={{ margin: '0 0 12px' }}>預計離台 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {pendingDeparture.length} 位學生</span></h3>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>學生</th><th>客戶</th><th>預計離台日</th></tr></thead>
                  <tbody>
                    {pendingDeparture.map(({ v, nextExit }) => (
                      <tr key={v.id}>
                        <td>{studentFullLabel(studentById(v.studentId))}</td>
                        <td>{studentCompanyLabel(v.studentId, ctx)}</td>
                        <td>{nextExit || <span className="muted">尚未填寫</span>}</td>
                      </tr>
                    ))}
                    {pendingDeparture.length === 0 && <tr><td colSpan={3} className="muted">目前沒有在台的學生。</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
