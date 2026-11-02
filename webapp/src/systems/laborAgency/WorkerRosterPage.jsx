import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';
import { JOBS, GENDERS, STAGE_KEYS } from './constants';

// 移工名冊：跳過「移工管理」的案件階段／雇主配對等流程資訊，只看工人的
// 基本資料（姓名/性別/省份/工種/護照效期/備註），跟「移工管理」共用同一個
// laborAgency_workers 集合——移工送出履歷後會自動在這裡出現一筆（見
// pages/LaborAgencyResumeApplyPage.jsx），內部人員也可以在這裡直接補建。
const FIELDS = [
  { key: 'name', label: '姓名', required: true },
  { key: 'vietnameseName', label: '越文姓名' },
  { key: 'gender', label: '性別', options: GENDERS },
  { key: 'province', label: '省份' },
  { key: 'job', label: '工種', options: JOBS },
  { key: 'passportExpiry', label: '護照效期', type: 'date' },
  { key: 'note', label: '備註', type: 'textarea' },
];
const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

export default function WorkerRosterPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'workerRoster', role, overrides);
  const { rows: workers, loading, add, update, remove } = useCollection('laborAgency_workers');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('laborAgency_workers', CSV_FIELDS, { entityLabel: '工人資料', requiredKeys: ['name'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const filtered = workers
    .filter((w) => !searchQuery || `${w.name || ''} ${w.vietnameseName || ''} ${w.province || ''}`.toLowerCase().includes(searchQuery))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  async function handleSave(data) {
    const payload = { ...data };
    if (data.id) {
      const { id, ...rest } = payload;
      await update(id, rest);
    } else {
      // 新增時沿用「移工管理」流程的第一個階段，避免新建的工人在「移工
      // 管理」的流程管理頁面裡沒有階段可顯示。
      await add({ ...payload, stage: STAGE_KEYS[0], updatedAt: Date.now() });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('移工名冊', lang)}</h2>
          <div className="page-desc">{t('工人基本資料名冊，不含案件階段與雇主配對；移工送出履歷後會自動出現在這裡', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          <input placeholder={t('搜尋姓名或省份', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增工人', lang)}</button>}
          <ImportExportButtons rows={workers} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>{t('姓名', lang)}</th><th>{t('越文姓名', lang)}</th><th>{t('性別', lang)}</th>
                <th>{t('省份', lang)}</th><th>{t('工種', lang)}</th><th>{t('護照效期', lang)}</th>{canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr key={w.id}>
                  <td style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => setEditing(w)}>{w.name}</td>
                  <td>{w.vietnameseName || '—'}</td>
                  <td>{t(w.gender, lang) || '—'}</td>
                  <td>{w.province || '—'}</td>
                  <td>{t(w.job, lang) || '—'}</td>
                  <td>{w.passportExpiry || '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(w)}>{t('編輯', lang)}</button>
                      <button className="danger" onClick={() => remove(w.id)}>{t('刪除', lang)}</button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={canEditPage ? 7 : 6} className="muted">{t('尚未建立工人資料', lang)}</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}
      {editing && <WorkerRosterFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function WorkerRosterFormModal({ initial, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯工人', lang) : t('新增工人', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.filter((f) => f.type !== 'textarea').map((f) => (
              <label key={f.key}>
                {t(f.label, lang)}
                {f.options ? (
                  <select required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    <option value="">{t('請選擇', lang)}</option>
                    {f.options.map((o) => <option key={o} value={o}>{t(o, lang)}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
          </div>
          <label>
            {t('備註', lang)}
            <textarea rows={3} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ marginBottom: 16 }} />
          </label>
          <div className="row-actions">
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
