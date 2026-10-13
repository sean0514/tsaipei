import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canView, canEdit as computeCanEdit } from '../../lib/permissions';
import { exportEntityCSV } from '../../lib/csv';
import { t } from '../../lib/i18n';

const ARRIVAL_EXTRA_FIELDS = [
  { key: 'healthCheckDate', label: '體檢日期', type: 'date' },
  { key: 'healthCheckCompany', label: '體檢公司' },
  { key: 'dispatchLocation', label: '體檢公司送達地' },
  { key: 'dispatchDate', label: '送工日期', type: 'date' },
  { key: 'workDispatchLocation', label: '送工地點' },
];

const DEPARTURE_EXTRA_FIELDS = [
  { key: 'airline', label: '航空公司' },
  { key: 'flightNumber', label: '航班編號' },
  { key: 'terminal', label: '航廈' },
  { key: 'flightTime', label: '班機時間', type: 'datetime-local' },
  { key: 'ticketFee', label: '機票費用', type: 'number' },
  { key: 'payer', label: '付款人', options: ['', '學生', '廠商', '鈞羽'] },
];

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

// 複製自 systems/tsaipei/ExpectedArrivalPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function ExpectedArrivalPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canSee = canView(system, 'expectedArrival', role, overrides);
  const canEditPage = computeCanEdit(system, 'expectedArrival', role, overrides);
  const { rows: students } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: positions } = useCollection('vietnam_positions');
  const { rows: visaRecords, loading, update } = useCollection('vietnam_inTaiwanVisa');
  const [reportMonth, setReportMonth] = useState(currentMonthStr());
  const [editingExtras, setEditingExtras] = useState(null);

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);
  const today = new Date().toISOString().slice(0, 10);

  const arrivals = [];
  const departures = [];
  visaRecords.forEach((v) => {
    if (v.firstEntryDate && daysBetween(v.firstEntryDate, today) <= 30) arrivals.push({ v, date: v.firstEntryDate, label: '第一次入境' });
    if (v.secondEntryDate && daysBetween(v.secondEntryDate, today) <= 30) arrivals.push({ v, date: v.secondEntryDate, label: '第二次入境' });
    if (v.firstExitDate && daysBetween(v.firstExitDate, today) <= 30) departures.push({ v, date: v.firstExitDate, label: '第一次離境' });
    if (v.secondExitDate && daysBetween(v.secondExitDate, today) <= 30) departures.push({ v, date: v.secondExitDate, label: '第二次離境' });
  });
  arrivals.sort((a, b) => a.date.localeCompare(b.date));
  departures.sort((a, b) => a.date.localeCompare(b.date));

  function handleDownload() {
    const monthArrivals = [];
    const monthDepartures = [];
    visaRecords.forEach((v) => {
      if (v.firstEntryDate?.startsWith(reportMonth)) monthArrivals.push({ v, date: v.firstEntryDate, label: '第一次入境' });
      if (v.secondEntryDate?.startsWith(reportMonth)) monthArrivals.push({ v, date: v.secondEntryDate, label: '第二次入境' });
      if (v.firstExitDate?.startsWith(reportMonth)) monthDepartures.push({ v, date: v.firstExitDate, label: '第一次離境' });
      if (v.secondExitDate?.startsWith(reportMonth)) monthDepartures.push({ v, date: v.secondExitDate, label: '第二次離境' });
    });
    const combined = [...monthArrivals.map((x) => ({ ...x, type: '入台' })), ...monthDepartures.map((x) => ({ ...x, type: '離台' }))]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(({ v, date, label, type }) => ({
        studentName: studentFullLabel(studentById(v.studentId)),
        company: studentCompanyLabel(v.studentId, ctx),
        type,
        date,
        item: label,
      }));
    exportEntityCSV(
      combined,
      [
        { key: 'studentName', label: '學生' },
        { key: 'company', label: '客戶' },
        { key: 'type', label: '入台/離台' },
        { key: 'date', label: '日期' },
        { key: 'item', label: '項目' },
      ],
      `預計入台離台_${reportMonth}`
    );
  }

  function ListTable({ items, dateLabel = '日期', showArrivalExtras = false, showDepartureExtras = false }) {
    const extraFields = showArrivalExtras ? ARRIVAL_EXTRA_FIELDS : showDepartureExtras ? DEPARTURE_EXTRA_FIELDS : [];
    const colCount = 4 + extraFields.length + (showArrivalExtras ? 2 : 0) + (canEditPage ? 1 : 0);
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('學生', lang)}</th><th>{t('客戶', lang)}</th><th>{t(dateLabel, lang)}</th><th>{t('項目', lang)}</th>
              {extraFields.map((f) => <th key={f.key}>{t(f.label, lang)}</th>)}
              {showArrivalExtras && <><th>{t('已體檢', lang)}</th><th>{t('已送工', lang)}</th></>}
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
                {extraFields.map((f) => <td key={f.key}>{v[f.key] || '—'}</td>)}
                {showArrivalExtras && (
                  <>
                    <td>
                      {canEditPage ? (
                        <input type="checkbox" checked={!!v.healthCheckDone} onChange={(e) => update(v.id, { healthCheckDone: e.target.checked })} />
                      ) : (v.healthCheckDone ? '是' : '否')}
                    </td>
                    <td>
                      {canEditPage ? (
                        <input type="checkbox" checked={!!v.dispatchDone} onChange={(e) => update(v.id, { dispatchDone: e.target.checked })} />
                      ) : (v.dispatchDone ? '是' : '否')}
                    </td>
                  </>
                )}
                {canEditPage && (
                  <td>
                    <button onClick={() => {
                      const initial = {};
                      extraFields.forEach((f) => { initial[f.key] = v[f.key] || ''; });
                      setEditingExtras({ visaId: v.id, fields: extraFields, initial, title: `${studentFullLabel(studentById(v.studentId))} - ${showArrivalExtras ? t('體檢/送工資訊', lang) : t('航班/付款資訊', lang)}` });
                    }}>{t('編輯', lang)}</button>
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={colCount} className="muted">{t('目前沒有資料。', lang)}</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  async function handleSaveExtras(data) {
    const { visaId, fields } = editingExtras;
    const payload = {};
    fields.forEach((f) => { payload[f.key] = data[f.key] || ''; });
    await update(visaId, payload);
    setEditingExtras(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('預計入台/離台', lang)}</h2>
          <div className="page-desc">{t('在台簽證追蹤裡填有入境或離境時間（第一次／第二次皆可）且落在今天前後一個月內的學生，超過一個月自動從清單移除', lang)}{!canSee && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
          <button onClick={handleDownload}>{t('下載此月份報表', lang)}</button>
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>{t('入台', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{t('共', lang)} {arrivals.length} {t('筆', lang)}</span></h3>
            <div className="card"><ListTable items={arrivals} dateLabel="入境日期" showArrivalExtras /></div>
          </div>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>{t('離台', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{t('共', lang)} {departures.length} {t('筆', lang)}</span></h3>
            <div className="card"><ListTable items={departures} showDepartureExtras /></div>
          </div>
        </div>
      )}
      {editingExtras && (
        <ExtrasFormModal
          title={editingExtras.title}
          fields={editingExtras.fields}
          initial={editingExtras.initial}
          onCancel={() => setEditingExtras(null)}
          onSave={handleSaveExtras}
          lang={lang}
        />
      )}
    </div>
  );
}

function ExtrasFormModal({ title, fields, initial, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {fields.map((f) => (
              <label key={f.key}>
                {t(f.label, lang)}
                {f.options ? (
                  <select value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    {f.options.map((o) => <option key={o} value={o}>{o || t('請選擇', lang)}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
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
