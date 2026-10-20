import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import Tag from '../../components/Tag';
import { CARE_TAG } from '../../lib/tags';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';

const STATUSES = ['良好', '待關心', '預計離台'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' }, { key: 'careDate', label: '關懷時間' },
  { key: 'content', label: '內容' }, { key: 'status', label: '狀態' }, { key: 'confirmedDeparture', label: '確認離台' },
];

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

// 複製自 systems/tsaipei/InTaiwanCarePage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function InTaiwanCarePage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'inTaiwanCare', role, overrides);
  const { rows, loading, update, remove } = useCollection('vietnam_inTaiwanCare');
  const { rows: students } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: positions } = useCollection('vietnam_positions');
  const [editing, setEditing] = useState(null);
  const [showDeparted, setShowDeparted] = useState(false);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_inTaiwanCare', CSV_FIELDS, { entityLabel: '在台關懷紀錄', requiredKeys: ['studentId'], canEdit: canEditPage });

  const ctx = { matches, admittedList, positions };
  const studentName = (id) => { const s = students.find((x) => x.id === id); return s?.chineseName || s?.originalName || '(未知)'; };
  const searchQuery = q.trim().toLowerCase();
  const visible = rows.filter((r) => (showDeparted || r.confirmedDeparture !== true) && (!searchQuery || `${studentName(r.studentId)} ${studentCompanyLabel(r.studentId, ctx)}`.toLowerCase().includes(searchQuery)));

  const byCompany = {};
  visible.forEach((r) => {
    const company = studentCompanyLabel(r.studentId, ctx);
    (byCompany[company] ||= []).push(r);
  });
  const companies = Object.keys(byCompany).sort((a, b) => a.localeCompare(b));

  async function handleSave(data) {
    const { id, ...rest } = data;
    await update(id, rest);
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('在台關懷紀錄', lang)}</h2>
          <div className="page-desc">{t('依專案編號＋客戶分類，記錄學生在台期間的關懷追蹤（在台簽證追蹤建立後自動加入；確認離台後自動移除）', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          <label className="muted"><input type="checkbox" checked={showDeparted} onChange={(e) => setShowDeparted(e.target.checked)} /> {t('顯示已確認離台', lang)}</label>
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「學生ID」欄位）；上傳後會完全取代目前所有在台關懷紀錄，請先下載備份再匯入。', lang)}</p>}
      <input placeholder={t('搜尋學生或客戶', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        companies.length === 0 ? <p className="muted">{t('尚無在台關懷紀錄。', lang)}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {companies.map((company) => (
              <div className="card" key={company}>
                <h3 style={{ marginTop: 0 }}>{company} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{byCompany[company].length} {t('筆紀錄', lang)}</span></h3>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>{t('學生', lang)}</th><th>{t('關懷時間', lang)}</th><th>{t('內容', lang)}</th><th>{t('狀態', lang)}</th><th>{t('確認離台', lang)}</th>{canEditPage && <th></th>}</tr></thead>
                    <tbody>
                      {byCompany[company].map((r) => (
                        <tr key={r.id}>
                          <td>{studentName(r.studentId)}</td>
                          <td>{r.careDate || '—'}</td>
                          <td>{r.content || '—'}</td>
                          <td><Tag value={r.status} map={CARE_TAG} lang={lang} /></td>
                          <td>
                            {canEditPage ? (
                              <input type="checkbox" checked={!!r.confirmedDeparture} onChange={(e) => update(r.id, { confirmedDeparture: e.target.checked })} />
                            ) : (r.confirmedDeparture ? t('是', lang) : t('否', lang))}
                          </td>
                          {canEditPage && (
                            <td>
                              <div className="row-actions">
                                <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                                <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
      )}
      {editing && <CareFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function CareFormModal({ initial, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('編輯在台關懷紀錄', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('關懷時間', lang)}
              <input type="date" value={form.careDate || ''} onChange={(e) => setForm({ ...form, careDate: e.target.value })} />
            </label>
            <label>
              {t('狀態', lang)}
              <select value={form.status || '良好'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              {t('內容', lang)}
              <input value={form.content || ''} onChange={(e) => setForm({ ...form, content: e.target.value })} />
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
