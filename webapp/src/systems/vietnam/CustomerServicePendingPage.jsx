import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';

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

// 複製自 systems/tsaipei/CustomerServicePendingPage.jsx，collection 字首
// 改成 vietnam_，介面文字包上 t(...)。
export default function CustomerServicePendingPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditArrival = computeCanEdit(system, 'expectedArrival', role, overrides);
  const canEditBankAccount = computeCanEdit(system, 'bankAccountProgress', role, overrides);
  const { rows: students } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: positions } = useCollection('vietnam_positions');
  const { rows: visaRecords, loading: loadingVisa, update: updateVisa } = useCollection('vietnam_inTaiwanVisa');
  const { rows: bankProgress, loading: loadingBank, add: addBankProgress, update: updateBankProgress } = useCollection('vietnam_bankAccountProgress');
  const { rows: housingRecords, loading: loadingHousing } = useCollection('vietnam_housingRecords');
  const canEditDorm = computeCanEdit(system, 'dormManagement', role, overrides);
  const { rows: dormitories, loading: loadingDorms } = useCollection('vietnam_dormitories');
  const { rows: utilities, loading: loadingUtilities, add: addUtility, update: updateUtility } = useCollection('vietnam_dormitoryUtilities');
  const [utilEditing, setUtilEditing] = useState(null);
  const [utilMonth, setUtilMonth] = useState(currentMonthStr());

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);
  const today = new Date().toISOString().slice(0, 10);

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

  const bankProgressByStudent = {};
  bankProgress.forEach((p) => { bankProgressByStudent[p.studentId] = p; });
  const pendingBankAccounts = visaRecords.filter((v) => (
    v.firstEntryDate
    && !bankProgressByStudent[v.studentId]?.confirmedDone
    && !bankProgressByStudent[v.studentId]?.bankAccountReceived
  ));

  const pendingHousing = housingRecords.filter((r) => !r.completed && !r.checkIn);

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
          <h2>{t('客服未完成事項', lang)}</h2>
          <div className="page-desc">{t('彙整預計入台/離台（未勾已體檢/已送工）、開戶進度追蹤（未勾銀行帳戶）、住宿安排（未安排）、宿舍管理（本月未填其他費用）的名單，入台/離台的已體檢/已送工、宿舍管理的其他費用可以直接在這裡填寫，其餘編輯請到原本的分頁操作', lang)}</div>
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>{t('預計入台/離台', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{t('共', lang)} {pendingArrivals.length} {t('筆', lang)}</span></h3>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t('學生', lang)}</th><th>{t('客戶', lang)}</th><th>{t('日期', lang)}</th><th>{t('項目', lang)}</th><th>{t('已體檢', lang)}</th><th>{t('已送工', lang)}</th></tr></thead>
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
                    {pendingArrivals.length === 0 && <tr><td colSpan={6} className="muted">{t('目前沒有未完成的項目。', lang)}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>{t('開戶進度追蹤', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{t('共', lang)} {pendingBankAccounts.length} {t('位學生', lang)}</span></h3>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t('學生', lang)}</th><th>{t('客戶', lang)}</th><th>{t('入台日期', lang)}</th><th>{t('銀行帳戶', lang)}</th></tr></thead>
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
                    {pendingBankAccounts.length === 0 && <tr><td colSpan={4} className="muted">{t('目前沒有未完成的項目。', lang)}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>{t('住宿安排', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{t('共', lang)} {pendingHousing.length} {t('位學生', lang)}</span></h3>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t('學生', lang)}</th><th>{t('分店', lang)}</th></tr></thead>
                  <tbody>
                    {pendingHousing.map((r) => (
                      <tr key={r.id}>
                        <td>{studentFullLabel(studentById(r.studentId))}</td>
                        <td>{studentVenueLabel(r.studentId, ctx)}</td>
                      </tr>
                    ))}
                    {pendingHousing.length === 0 && <tr><td colSpan={2} className="muted">{t('目前沒有未完成的項目。', lang)}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div>
            <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              {t('宿舍管理', lang)} · {t('其他費用', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{t('共', lang)} {pendingUtilities.length} {t('間', lang)}</span>
              <input type="month" value={utilMonth} onChange={(e) => setUtilMonth(e.target.value)} style={{ fontWeight: 400, fontSize: 13 }} />
            </h3>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t('宿舍名稱', lang)}</th><th>{t('地點', lang)}</th>{canEditDorm && <th></th>}</tr></thead>
                  <tbody>
                    {pendingUtilities.map((d) => (
                      <tr key={d.id}>
                        <td>{d.name}</td>
                        <td>{d.location || '—'}</td>
                        {canEditDorm && (
                          <td>
                            <button onClick={() => setUtilEditing({ dormId: d.id, waterFee: '', electricityFee: '', gasFee: '', otherFees: '' })}>{t('填寫其他費用', lang)}</button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {pendingUtilities.length === 0 && <tr><td colSpan={canEditDorm ? 3 : 2} className="muted">{t('目前沒有未完成的項目。', lang)}</td></tr>}
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
          lang={lang}
        />
      )}
    </div>
  );
}

function OtherFeesListEditor({ fees, onChange, lang }) {
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
            {t('項目名稱', lang)}
            <input value={f.label || ''} onChange={(e) => updateRow(i, { label: e.target.value })} />
          </label>
          <label>
            {t('金額', lang)}
            <input value={f.amount || ''} onChange={(e) => updateRow(i, { amount: e.target.value })} />
          </label>
          <button type="button" onClick={() => removeRow(i)} style={{ alignSelf: 'end' }}>{t('移除', lang)}</button>
        </div>
      ))}
      <button type="button" onClick={addRow}>+ {t('新增其他費用', lang)}</button>
    </div>
  );
}

function OtherFeesFormModal({ month, initial, onCancel, onSave, lang }) {
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
        <h3>{month} {t('其他費用', lang)}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              {t('水費', lang)}
              <input type="number" value={form.waterFee} onChange={(e) => setForm({ ...form, waterFee: e.target.value })} />
            </label>
            <label>
              {t('電費', lang)}
              <input type="number" value={form.electricityFee} onChange={(e) => setForm({ ...form, electricityFee: e.target.value })} />
            </label>
            <label>
              {t('瓦斯費', lang)}
              <input type="number" value={form.gasFee} onChange={(e) => setForm({ ...form, gasFee: e.target.value })} />
            </label>
          </div>
          <h4>{t('其他費用（可自行新增）', lang)}</h4>
          <OtherFeesListEditor fees={otherFees} onChange={setOtherFees} lang={lang} />
          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
