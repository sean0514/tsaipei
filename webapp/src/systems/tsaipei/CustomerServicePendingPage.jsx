import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function parseOtherFees(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function isUtilityFilled(u) {
  if (!u) return false;
  if (u.waterFee || u.electricityFee || u.gasFee) return true;
  return parseOtherFees(u.otherFees).length > 0;
}

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

// 彙整「預計入台/離台」「開戶進度追蹤」「住宿安排」「宿舍管理」幾個頁面裡
// 還沒完成的項目，客服不用分別點進去檢查，一次看完要追的事項；資料來源都
// 是各自分頁既有的集合，這裡的打勾/填寫其他費用都直接寫回原本那頁的紀錄，
// 不會另外存一份。
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
  const canEditDorm = computeCanEdit(system, 'dormManagement', role, overrides);
  const { rows: dormitories, loading: loadingDorms } = useCollection('tsaipei_dormitories');
  const { rows: utilities, loading: loadingUtilities, add: addUtility, update: updateUtility } = useCollection('tsaipei_dormitoryUtilities');
  const [utilEditing, setUtilEditing] = useState(null);
  const [utilMonth, setUtilMonth] = useState(currentMonthStr());

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

  // 宿舍管理：這個月還沒填「其他費用」（水費/電費/瓦斯費/自訂其他費用）的
  // 宿舍，跟 DormManagementPage 判斷「這個月有沒有填過」同一套邏輯。
  function utilityFor(dormId) {
    return utilities.find((u) => u.dormitoryId === dormId && u.month === utilMonth);
  }
  const pendingUtilities = dormitories.filter((d) => !d.confirmedClosed && !isUtilityFilled(utilityFor(d.id)));

  async function toggleArrival(visaId, field, checked) {
    await updateVisa(visaId, { [field]: checked });
  }

  async function toggleBankAccount(studentId, checked) {
    const existing = bankProgressByStudent[studentId];
    if (existing) await updateBankProgress(existing.id, { bankAccountReceived: checked });
    else await addBankProgress({ studentId, bankAccountReceived: checked });
  }

  // upsert：跟 DormManagementPage 的 handleSaveUtility 同一套邏輯，找得到
  // 同宿舍+同月份的既有紀錄就更新，找不到就新增——這裡填寫完會直接寫回
  // tsaipei_dormitoryUtilities，宿舍管理那頁打開會看到同一筆資料。
  async function handleSaveUtility(dormId, data) {
    const existing = utilityFor(dormId);
    if (existing) await updateUtility(existing.id, data);
    else await addUtility({ dormitoryId: dormId, month: utilMonth, ...data });
    setUtilEditing(null);
  }

  const loading = loadingVisa || loadingBank || loadingHousing || loadingDorms || loadingUtilities;

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>客服未完成事項</h2>
          <div className="page-desc">彙整預計入台/離台（未勾已體檢/已送工）、開戶進度追蹤（未勾銀行帳戶）、住宿安排（未安排）、宿舍管理（本月未填其他費用）的名單，入台/離台的已體檢/已送工、宿舍管理的其他費用可以直接在這裡填寫，其餘編輯請到原本的分頁操作</div>
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
          <div>
            <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              宿舍管理 · 其他費用 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {pendingUtilities.length} 間</span>
              <input type="month" value={utilMonth} onChange={(e) => setUtilMonth(e.target.value)} style={{ fontWeight: 400, fontSize: 13 }} />
            </h3>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>宿舍名稱</th><th>地點</th>{canEditDorm && <th></th>}</tr></thead>
                  <tbody>
                    {pendingUtilities.map((d) => (
                      <tr key={d.id}>
                        <td>{d.name}</td>
                        <td>{d.location || '—'}</td>
                        {canEditDorm && (
                          <td>
                            <button onClick={() => setUtilEditing({ dormId: d.id, waterFee: '', electricityFee: '', gasFee: '', otherFees: '' })}>填寫其他費用</button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {pendingUtilities.length === 0 && <tr><td colSpan={canEditDorm ? 3 : 2} className="muted">目前沒有未完成的項目。</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      {utilEditing && (
        <OtherFeesFormModal
          month={utilMonth}
          initial={utilEditing}
          onCancel={() => setUtilEditing(null)}
          onSave={(data) => handleSaveUtility(utilEditing.dormId, data)}
        />
      )}
    </div>
  );
}

function OtherFeesListEditor({ fees, onChange }) {
  function updateRow(i, patch) {
    onChange(fees.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function removeRow(i) {
    onChange(fees.filter((_, idx) => idx !== i));
  }
  function addRow() {
    onChange([...fees, { label: '', amount: '' }]);
  }

  return (
    <div>
      {fees.map((f, i) => (
        <div key={i} className="form-grid" style={{ marginBottom: 8 }}>
          <label>
            項目名稱
            <input value={f.label || ''} onChange={(e) => updateRow(i, { label: e.target.value })} />
          </label>
          <label>
            金額
            <input value={f.amount || ''} onChange={(e) => updateRow(i, { amount: e.target.value })} />
          </label>
          <button type="button" onClick={() => removeRow(i)} style={{ alignSelf: 'end' }}>移除</button>
        </div>
      ))}
      <button type="button" onClick={addRow}>+ 新增其他費用</button>
    </div>
  );
}

function OtherFeesFormModal({ month, initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const otherFees = parseOtherFees(form.otherFees);

  function setOtherFees(next) {
    setForm({ ...form, otherFees: JSON.stringify(next) });
  }

  function handleSubmit(e) {
    e.preventDefault();
    const cleaned = parseOtherFees(form.otherFees).filter((f) => f.label);
    onSave({ ...form, otherFees: JSON.stringify(cleaned) });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{month} 其他費用</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              水費
              <input type="number" value={form.waterFee} onChange={(e) => setForm({ ...form, waterFee: e.target.value })} />
            </label>
            <label>
              電費
              <input type="number" value={form.electricityFee} onChange={(e) => setForm({ ...form, electricityFee: e.target.value })} />
            </label>
            <label>
              瓦斯費
              <input type="number" value={form.gasFee} onChange={(e) => setForm({ ...form, gasFee: e.target.value })} />
            </label>
          </div>
          <h4>其他費用（可自行新增）</h4>
          <OtherFeesListEditor fees={otherFees} onChange={setOtherFees} />
          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
