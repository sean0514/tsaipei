import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canView, canEdit as computeCanEdit } from '../../lib/permissions';
import { exportEntityCSV } from '../../lib/csv';
import { t } from '../../lib/i18n';

const TYPES = ['接機', '送機', '送工', '送宿舍'];
const AIRPORT_TYPES = ['接機', '送機'];
const BILL_TO_OPTIONS = ['實習單位', '鈞羽', '學生'];

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
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

function daysBetween(dateStr, today) {
  return Math.abs((new Date(dateStr) - new Date(today)) / 86400000);
}

// 複製自 systems/tsaipei/VehiclePickupPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function VehiclePickupPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canSee = canView(system, 'vehiclePickup', role, overrides);
  const canEditPage = computeCanEdit(system, 'vehiclePickup', role, overrides);
  const { rows: students } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: positions } = useCollection('vietnam_positions');
  const { rows: visaRecords, loading: l1 } = useCollection('vietnam_inTaiwanVisa');
  const { rows: arrangements, loading: l2, add, update, remove } = useCollection('vietnam_vehicleArrangements', { order: ['date', 'asc'] });
  const [reportMonth, setReportMonth] = useState(currentMonthStr());
  const [editing, setEditing] = useState(null);
  const loading = l1 || l2;

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);
  const today = new Date().toISOString().slice(0, 10);

  const pending = [];
  visaRecords.forEach((v) => {
    if (v.firstEntryDate && daysBetween(v.firstEntryDate, today) <= 30) pending.push({ v, date: v.firstEntryDate, label: '第一次入境', suggestedType: '接機' });
    if (v.secondEntryDate && daysBetween(v.secondEntryDate, today) <= 30) pending.push({ v, date: v.secondEntryDate, label: '第二次入境', suggestedType: '接機' });
    if (v.firstExitDate && daysBetween(v.firstExitDate, today) <= 30) pending.push({ v, date: v.firstExitDate, label: '第一次離境', suggestedType: '送機' });
    if (v.secondExitDate && daysBetween(v.secondExitDate, today) <= 30) pending.push({ v, date: v.secondExitDate, label: '第二次離境', suggestedType: '送機' });
  });
  const arranged = (visaId, label) => arrangements.some((a) => a.visaId === visaId && a.visaLabel === label);
  const pendingList = pending.filter(({ v, label }) => !arranged(v.id, label)).sort((a, b) => a.date.localeCompare(b.date));

  const arrangedList = [...arrangements].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  function handleDownload() {
    const monthRows = arrangedList
      .filter((a) => (a.date || '').startsWith(reportMonth))
      .map((a) => ({
        studentName: studentFullLabel(studentById(a.studentId)),
        company: studentCompanyLabel(a.studentId, ctx),
        type: a.type || '',
        date: a.date || '',
        vehicleCompany: a.vehicleCompany || '',
        vehicleLocation: a.vehicleLocation || '',
        terminal: a.terminal || '',
        flightTime: a.flightTime || '',
        fee: a.fee || '',
        billTo: a.billTo || '',
        done: a.done ? '是' : '否',
      }));
    exportEntityCSV(
      monthRows,
      [
        { key: 'studentName', label: '學生' },
        { key: 'company', label: '客戶' },
        { key: 'type', label: '類型' },
        { key: 'date', label: '車輛接送日期' },
        { key: 'vehicleCompany', label: '車輛公司' },
        { key: 'vehicleLocation', label: '車輛接送地點' },
        { key: 'terminal', label: '出入境航廈' },
        { key: 'flightTime', label: '班機時間' },
        { key: 'fee', label: '車資費用' },
        { key: 'billTo', label: '請款對象' },
        { key: 'done', label: '已完成' },
      ],
      `接送車輛安排_${reportMonth}`
    );
  }

  async function handleSave(data) {
    try {
      const { id, ...rest } = data;
      if (!AIRPORT_TYPES.includes(rest.type)) { rest.terminal = ''; rest.flightTime = ''; }
      if (id) await update(id, rest);
      else await add(rest);
      setEditing(null);
    } catch (err) {
      alert(`儲存失敗：${err?.message || '請稍後再試'}`);
    }
  }

  async function handleRemove(id) {
    if (!confirm('確定要刪除這筆安排嗎？')) return;
    try {
      await remove(id);
    } catch (err) {
      alert(`刪除失敗：${err?.message || '請稍後再試'}`);
    }
  }

  async function toggleDone(a) {
    try {
      await update(a.id, { done: !a.done });
    } catch (err) {
      alert(`更新失敗：${err?.message || '請稍後再試'}`);
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('接送車輛安排', lang)}</h2>
          <div className="page-desc">{t('「待安排」清單同步「預計入台/離台」：在台簽證追蹤裡落在今天前後一個月內的入境/離境紀錄', lang)}{!canSee && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
          <button onClick={handleDownload}>{t('下載此月份報表', lang)}</button>
          {canEditPage && <button className="primary" onClick={() => setEditing({ type: '送工', billTo: '', done: false })}>+ {t('新增安排車輛', lang)}</button>}
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>{t('待安排', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{t('共', lang)} {pendingList.length} {t('筆', lang)}</span></h3>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>{t('學生', lang)}</th><th>{t('客戶', lang)}</th><th>{t('日期', lang)}</th><th>{t('項目', lang)}</th><th>{t('建議類型', lang)}</th>{canEditPage && <th></th>}</tr>
                  </thead>
                  <tbody>
                    {pendingList.map(({ v, date, label, suggestedType }, i) => (
                      <tr key={`${v.id}-${label}-${i}`}>
                        <td>{studentFullLabel(studentById(v.studentId))}</td>
                        <td>{studentCompanyLabel(v.studentId, ctx)}</td>
                        <td>{date}</td>
                        <td>{label}</td>
                        <td>{suggestedType}</td>
                        {canEditPage && (
                          <td>
                            <button onClick={() => setEditing({
                              studentId: v.studentId, visaId: v.id, visaLabel: label,
                              type: suggestedType, date, billTo: '', done: false,
                            })}>{t('新增安排', lang)}</button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {pendingList.length === 0 && <tr><td colSpan={5 + (canEditPage ? 1 : 0)} className="muted">{t('目前沒有資料。', lang)}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>{t('已安排', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{t('共', lang)} {arrangedList.length} {t('筆', lang)}</span></h3>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('學生', lang)}</th><th>{t('客戶', lang)}</th><th>{t('類型', lang)}</th><th>{t('車輛接送日期', lang)}</th><th>{t('車輛公司', lang)}</th><th>{t('車輛接送地點', lang)}</th>
                      <th>{t('出入境航廈', lang)}</th><th>{t('班機時間', lang)}</th><th>{t('車資費用', lang)}</th><th>{t('請款對象', lang)}</th><th>{t('已完成', lang)}</th>
                      {canEditPage && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {arrangedList.map((a) => (
                      <tr key={a.id}>
                        <td>{studentFullLabel(studentById(a.studentId))}</td>
                        <td>{studentCompanyLabel(a.studentId, ctx)}</td>
                        <td>{a.type || '—'}</td>
                        <td>{a.date || '—'}</td>
                        <td>{a.vehicleCompany || '—'}</td>
                        <td>{a.vehicleLocation || '—'}</td>
                        <td>{AIRPORT_TYPES.includes(a.type) ? (a.terminal || '—') : '—'}</td>
                        <td>{AIRPORT_TYPES.includes(a.type) ? (a.flightTime || '—') : '—'}</td>
                        <td>{a.fee || '—'}</td>
                        <td>{a.billTo || '—'}</td>
                        <td>
                          {canEditPage ? (
                            <input type="checkbox" checked={!!a.done} onChange={() => toggleDone(a)} />
                          ) : (a.done ? '是' : '否')}
                        </td>
                        {canEditPage && (
                          <td className="row-actions">
                            <button onClick={() => setEditing(a)}>{t('編輯', lang)}</button>
                            <button onClick={() => handleRemove(a.id)}>{t('刪除', lang)}</button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {arrangedList.length === 0 && <tr><td colSpan={11 + (canEditPage ? 1 : 0)} className="muted">{t('目前沒有資料。', lang)}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      {editing && (
        <VehicleFormModal
          initial={editing}
          students={students}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
          lang={lang}
        />
      )}
    </div>
  );
}

function VehicleFormModal({ initial, students, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const showAirportFields = AIRPORT_TYPES.includes(form.type);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{form.id ? t('編輯安排', lang) : t('新增安排車輛', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('學生', lang)}
              <select required value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                <option value="" disabled>{t('請選擇', lang)}</option>
                {students.map((s) => <option key={s.id} value={s.id}>{studentFullLabel(s)}</option>)}
              </select>
            </label>
            <label>
              {t('類型', lang)}
              <select value={form.type || ''} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
              </select>
            </label>
            <label>
              {t('車輛接送日期', lang)}
              <input type="date" value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>
              {t('車輛公司', lang)}
              <input value={form.vehicleCompany || ''} onChange={(e) => setForm({ ...form, vehicleCompany: e.target.value })} />
            </label>
            <label>
              {t('車輛接送地點', lang)}
              <input value={form.vehicleLocation || ''} onChange={(e) => setForm({ ...form, vehicleLocation: e.target.value })} />
            </label>
            {showAirportFields && (
              <>
                <label>
                  {t('出入境航廈', lang)}
                  <input value={form.terminal || ''} onChange={(e) => setForm({ ...form, terminal: e.target.value })} />
                </label>
                <label>
                  {t('班機時間', lang)}
                  <input type="datetime-local" value={form.flightTime || ''} onChange={(e) => setForm({ ...form, flightTime: e.target.value })} />
                </label>
              </>
            )}
            <label>
              {t('車資費用', lang)}
              <input type="number" value={form.fee || ''} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
            </label>
            <label>
              {t('請款對象', lang)}
              <select value={form.billTo || ''} onChange={(e) => setForm({ ...form, billTo: e.target.value })}>
                <option value="">{t('請選擇', lang)}</option>
                {BILL_TO_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label>
              {t('已完成', lang)}
              <input type="checkbox" checked={!!form.done} onChange={(e) => setForm({ ...form, done: e.target.checked })} style={{ width: 'auto' }} />
            </label>
          </div>
          <div className="row-actions">
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
