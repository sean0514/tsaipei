import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';

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

// Ported from studentCompanyName/matchPositionLabel in apps-script/Index.html —
// 這裡只取「實習場域」當分店名稱，不是完整的專案＋客戶標籤。
function studentVenueLabel(studentId, { matches, admittedList }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  return m?.venue || '—';
}

function daysBetween(dateStr, today) {
  return Math.abs((new Date(dateStr) - new Date(today)) / 86400000);
}

// 彙整「預計入台/離台」「開戶進度追蹤」「住宿安排」三個頁面裡還沒完成的
// 項目，客服不用三個頁面分別點進去檢查，一次看完要追的事項；資料來源都是
// 各自分頁既有的集合，這裡只讀取跟（已體檢/已送工/銀行帳戶）打勾直接寫回
// 原本那頁的紀錄，不會另外存一份。
export default function CustomerServicePendingPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditArrival = computeCanEdit(system, 'expectedArrival', role, overrides);
  const canEditBankAccount = computeCanEdit(system, 'bankAccountProgress', role, overrides);
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { rows: visaRecords, loading: loadingVisa, update: updateVisa } = useCollection('tsaipei_inTaiwanVisa');
  const { rows: bankProgress, loading: loadingBank, add: addBankProgress, update: updateBankProgress } = useCollection('tsaipei_bankAccountProgress');
  const { rows: housingRecords, loading: loadingHousing } = useCollection('tsaipei_housingRecords');

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);
  const today = new Date().toISOString().slice(0, 10);

  // 預計入台/離台：入境時間落在今天前後一個月內、且還沒勾「已體檢」或
  // 「已送工」的，跟 ExpectedArrivalPage 同一套 30 天判斷。
  const pendingArrivals = [];
  visaRecords.forEach((v) => {
    const dates = [
      v.firstEntryDate && { date: v.firstEntryDate, label: '第一次入境' },
      v.secondEntryDate && { date: v.secondEntryDate, label: '第二次入境' },
    ].filter(Boolean);
    const withinMonth = dates.find((d) => daysBetween(d.date, today) <= 30);
    if (withinMonth && (!v.healthCheckDone || !v.dispatchDone)) {
      pendingArrivals.push({ v, date: withinMonth.date, label: withinMonth.label });
    }
  });
  pendingArrivals.sort((a, b) => a.date.localeCompare(b.date));

  // 開戶進度追蹤：已入台、還沒按「確認完成」、且還沒勾「銀行帳戶」的，跟
  // BankAccountProgressPage 的「未開戶」同一套邏輯。
  const bankProgressByStudent = {};
  bankProgress.forEach((p) => { bankProgressByStudent[p.studentId] = p; });
  const pendingBankAccounts = visaRecords.filter((v) => (
    v.firstEntryDate
    && !bankProgressByStudent[v.studentId]?.confirmedDone
    && !bankProgressByStudent[v.studentId]?.bankAccountReceived
  ));

  // 住宿安排：還沒填入住日的，跟 HousingPage 的「未安排」同一套邏輯。
  const pendingHousing = housingRecords.filter((r) => !r.completed && !r.checkIn);

  async function toggleArrival(visaId, field, checked) {
    await updateVisa(visaId, { [field]: checked });
  }

  async function toggleBankAccount(studentId, checked) {
    const existing = bankProgressByStudent[studentId];
    if (existing) await updateBankProgress(existing.id, { bankAccountReceived: checked });
    else await addBankProgress({ studentId, bankAccountReceived: checked });
  }

  const loading = loadingVisa || loadingBank || loadingHousing;

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>客服未完成事項</h2>
          <div className="page-desc">彙整預計入台/離台（未勾已體檢/已送工）、開戶進度追蹤（未勾銀行帳戶）、住宿安排（未安排）的名單，各項目打勾/編輯請到原本的分頁操作，入台/離台的已體檢/已送工可以直接在這裡打勾</div>
        </div>
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>預計入台/離台 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {pendingArrivals.length} 筆</span></h3>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>學生</th><th>客戶</th><th>日期</th><th>項目</th><th>已體檢</th><th>已送工</th></tr></thead>
                  <tbody>
                    {pendingArrivals.map(({ v, date, label }) => (
                      <tr key={v.id}>
                        <td>{studentFullLabel(studentById(v.studentId))}</td>
                        <td>{studentCompanyLabel(v.studentId, ctx)}</td>
                        <td>{date}</td>
                        <td>{label}</td>
                        <td>
                          {canEditArrival ? (
                            <input type="checkbox" checked={!!v.healthCheckDone} onChange={(e) => toggleArrival(v.id, 'healthCheckDone', e.target.checked)} />
                          ) : (v.healthCheckDone ? '是' : '否')}
                        </td>
                        <td>
                          {canEditArrival ? (
                            <input type="checkbox" checked={!!v.dispatchDone} onChange={(e) => toggleArrival(v.id, 'dispatchDone', e.target.checked)} />
                          ) : (v.dispatchDone ? '是' : '否')}
                        </td>
                      </tr>
                    ))}
                    {pendingArrivals.length === 0 && <tr><td colSpan={6} className="muted">目前沒有未完成的項目。</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>開戶進度追蹤 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {pendingBankAccounts.length} 位學生</span></h3>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>學生</th><th>客戶</th><th>入台日期</th><th>銀行帳戶</th></tr></thead>
                  <tbody>
                    {pendingBankAccounts.map((v) => (
                      <tr key={v.id}>
                        <td>{studentFullLabel(studentById(v.studentId))}</td>
                        <td>{studentCompanyLabel(v.studentId, ctx)}</td>
                        <td>{v.firstEntryDate}</td>
                        <td>
                          {canEditBankAccount ? (
                            <input type="checkbox" checked={!!bankProgressByStudent[v.studentId]?.bankAccountReceived} onChange={(e) => toggleBankAccount(v.studentId, e.target.checked)} />
                          ) : (bankProgressByStudent[v.studentId]?.bankAccountReceived ? '是' : '否')}
                        </td>
                      </tr>
                    ))}
                    {pendingBankAccounts.length === 0 && <tr><td colSpan={4} className="muted">目前沒有未完成的項目。</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>住宿安排 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {pendingHousing.length} 位學生</span></h3>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>學生</th><th>分店</th></tr></thead>
                  <tbody>
                    {pendingHousing.map((r) => (
                      <tr key={r.id}>
                        <td>{studentFullLabel(studentById(r.studentId))}</td>
                        <td>{studentVenueLabel(r.studentId, ctx)}</td>
                      </tr>
                    ))}
                    {pendingHousing.length === 0 && <tr><td colSpan={2} className="muted">目前沒有未完成的項目。</td></tr>}
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
