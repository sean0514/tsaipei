import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canView, canEdit as computeCanEdit } from '../../lib/permissions';
import { exportEntityCSV } from '../../lib/csv';

// 資料來源跟「預計入台/離台」一樣：在台簽證追蹤裡填有入境或離境時間（第一次／
// 第二次皆可）且落在今天前後一個月內的學生，超過一個月自動從清單移除。這裡
// 另外在同一筆在台簽證追蹤紀錄上存接送車輛相關欄位（跟體檢/送工/航班資訊用
// 不同欄位名稱，不會互相覆蓋）。
const VEHICLE_FIELDS = [
  { key: 'vehicleType', label: '類型', options: ['', '接機', '送機', '送公司'] },
  { key: 'vehicleDate', label: '車輛接送日期', type: 'date' },
  { key: 'vehicleCompany', label: '車輛公司' },
  { key: 'vehicleLocation', label: '車輛接送地點' },
  { key: 'vehicleTerminal', label: '出入境航廈' },
];

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
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

function daysBetween(dateStr, today) {
  return Math.abs((new Date(dateStr) - new Date(today)) / 86400000);
}

export default function VehiclePickupPage() {
  const { system, role, overrides } = useOutletContext();
  const canSee = canView(system, 'vehiclePickup', role, overrides);
  const canEditPage = computeCanEdit(system, 'vehiclePickup', role, overrides);
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { rows: visaRecords, loading, update } = useCollection('tsaipei_inTaiwanVisa');
  const [reportMonth, setReportMonth] = useState(currentMonthStr());
  const [editingExtras, setEditingExtras] = useState(null);

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);
  const today = new Date().toISOString().slice(0, 10);

  const items = [];
  visaRecords.forEach((v) => {
    if (v.firstEntryDate && daysBetween(v.firstEntryDate, today) <= 30) items.push({ v, date: v.firstEntryDate, label: '第一次入境' });
    if (v.secondEntryDate && daysBetween(v.secondEntryDate, today) <= 30) items.push({ v, date: v.secondEntryDate, label: '第二次入境' });
    if (v.firstExitDate && daysBetween(v.firstExitDate, today) <= 30) items.push({ v, date: v.firstExitDate, label: '第一次離境' });
    if (v.secondExitDate && daysBetween(v.secondExitDate, today) <= 30) items.push({ v, date: v.secondExitDate, label: '第二次離境' });
  });
  items.sort((a, b) => a.date.localeCompare(b.date));

  function handleDownload() {
    const monthItems = [];
    visaRecords.forEach((v) => {
      if (v.firstEntryDate?.startsWith(reportMonth)) monthItems.push({ v, date: v.firstEntryDate, label: '第一次入境' });
      if (v.secondEntryDate?.startsWith(reportMonth)) monthItems.push({ v, date: v.secondEntryDate, label: '第二次入境' });
      if (v.firstExitDate?.startsWith(reportMonth)) monthItems.push({ v, date: v.firstExitDate, label: '第一次離境' });
      if (v.secondExitDate?.startsWith(reportMonth)) monthItems.push({ v, date: v.secondExitDate, label: '第二次離境' });
    });
    const combined = monthItems
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(({ v, date, label }) => ({
        studentName: studentFullLabel(studentById(v.studentId)),
        company: studentCompanyLabel(v.studentId, ctx),
        date,
        item: label,
        vehicleType: v.vehicleType || '',
        vehicleDate: v.vehicleDate || '',
        vehicleCompany: v.vehicleCompany || '',
        vehicleLocation: v.vehicleLocation || '',
        vehicleTerminal: v.vehicleTerminal || '',
      }));
    exportEntityCSV(
      combined,
      [
        { key: 'studentName', label: '學生' },
        { key: 'company', label: '客戶' },
        { key: 'date', label: '日期' },
        { key: 'item', label: '項目' },
        { key: 'vehicleType', label: '類型' },
        { key: 'vehicleDate', label: '車輛接送日期' },
        { key: 'vehicleCompany', label: '車輛公司' },
        { key: 'vehicleLocation', label: '車輛接送地點' },
        { key: 'vehicleTerminal', label: '出入境航廈' },
      ],
      `接送車輛安排_${reportMonth}`
    );
  }

  async function handleSaveExtras(data) {
    const { visaId } = editingExtras;
    const payload = {};
    VEHICLE_FIELDS.forEach((f) => { payload[f.key] = data[f.key] || ''; });
    await update(visaId, payload);
    setEditingExtras(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>接送車輛安排</h2>
          <div className="page-desc">資料同步「預計入台/離台」：在台簽證追蹤裡填有入境或離境時間（第一次／第二次皆可）且落在今天前後一個月內的學生，超過一個月自動從清單移除{!canSee && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
          <button onClick={handleDownload}>下載此月份報表</button>
        </div>
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>學生</th><th>客戶</th><th>日期</th><th>項目</th>
                  {VEHICLE_FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}
                  {canEditPage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {items.map(({ v, date, label }, i) => (
                  <tr key={`${v.id}-${label}-${i}`}>
                    <td>{studentFullLabel(studentById(v.studentId))}</td>
                    <td>{studentCompanyLabel(v.studentId, ctx)}</td>
                    <td>{date}</td>
                    <td>{label}</td>
                    {VEHICLE_FIELDS.map((f) => <td key={f.key}>{v[f.key] || '—'}</td>)}
                    {canEditPage && (
                      <td>
                        <button onClick={() => {
                          const initial = {};
                          VEHICLE_FIELDS.forEach((f) => { initial[f.key] = v[f.key] || ''; });
                          setEditingExtras({ visaId: v.id, initial, title: `${studentFullLabel(studentById(v.studentId))} - 接送車輛安排` });
                        }}>編輯</button>
                      </td>
                    )}
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={4 + VEHICLE_FIELDS.length + (canEditPage ? 1 : 0)} className="muted">目前沒有資料。</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {editingExtras && (
        <ExtrasFormModal
          title={editingExtras.title}
          initial={editingExtras.initial}
          onCancel={() => setEditingExtras(null)}
          onSave={handleSaveExtras}
        />
      )}
    </div>
  );
}

function ExtrasFormModal({ title, initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {VEHICLE_FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                {f.options ? (
                  <select value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    {f.options.map((o) => <option key={o} value={o}>{o || '請選擇'}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
          </div>
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
