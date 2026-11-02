import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';
import { STAGE_KEYS, JOBS, GENDERS, stageIndex, passportStatus, employerLabel } from './constants';

const FIELDS = [
  { key: 'name', label: '姓名（越南文姓名可直接輸入）', required: true },
  { key: 'gender', label: '性別', options: GENDERS },
  { key: 'province', label: '家鄉省份' },
  { key: 'job', label: '工種', options: JOBS },
  { key: 'employerId', label: '配對雇主' },
  { key: 'stage', label: '目前階段', options: STAGE_KEYS },
  { key: 'passportExpiry', label: '護照效期', type: 'date' },
  { key: 'note', label: '備註', type: 'textarea' },
];
const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

export default function WorkersPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'workers', role, overrides);
  const { rows: workers, loading, add, update, remove } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');
  const [editing, setEditing] = useState(null);
  const [arranging, setArranging] = useState(false);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('laborAgency_workers', CSV_FIELDS, { entityLabel: '移工資料', requiredKeys: ['name'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const filtered = workers
    .filter((w) => !searchQuery || `${w.name || ''} ${w.province || ''} ${employerLabel(employers, w.employerId, lang)} ${w.stage || ''}`.toLowerCase().includes(searchQuery))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  async function handleSave(data) {
    const prevStage = editing?.stage || '';
    const payload = { ...data, stage: data.stage || STAGE_KEYS[0] };
    // 階段沒變就保留原本的 updatedAt（代表還停留在同一關），階段改變才
    // 重新蓋成現在時間，讓「停留超過 30 天」的判斷準確。
    payload.updatedAt = (editing?.id && prevStage === payload.stage) ? (editing.updatedAt || Date.now()) : Date.now();
    if (data.id) {
      const { id, ...rest } = payload;
      await update(id, rest);
    } else {
      await add(payload);
    }
    setEditing(null);
  }

  async function handleMoveStage(id, stage) {
    await update(id, { stage, updatedAt: Date.now() });
  }

  async function handleArrangeEmployer({ workerId, employerId }) {
    const worker = workers.find((w) => w.id === workerId);
    await update(workerId, { employerId, stage: worker?.stage || STAGE_KEYS[0], updatedAt: Date.now() });
    setArranging(false);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('移工管理', lang)}</h2>
          <div className="page-desc">{t('越南移工案件進度管理，依雇主分組呈現每位移工目前所在的案件階段', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          <input placeholder={t('搜尋姓名、省份、雇主、階段', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
          {canEditPage && <button className="primary" onClick={() => setArranging(true)}>+ {t('新增雇主安排', lang)}</button>}
          {canEditPage && <button onClick={() => setEditing({})}>+ {t('新增移工', lang)}</button>}
          <ImportExportButtons rows={workers} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <ProcessView workers={filtered} employers={employers} canEditPage={canEditPage} onMoveStage={handleMoveStage} onEdit={setEditing} lang={lang} />
      )}
      {editing && (
        <WorkerFormModal initial={editing} employers={employers} onCancel={() => setEditing(null)} onSave={handleSave} onRemove={editing.id ? () => { remove(editing.id); setEditing(null); } : null} lang={lang} />
      )}
      {arranging && (
        <ArrangeEmployerModal workers={workers} employers={employers} onCancel={() => setArranging(false)} onSave={handleArrangeEmployer} lang={lang} />
      )}
    </div>
  );
}

// 新增雇主安排：直接從既有的移工（移工名冊／履歷自動建立）跟既有的雇主
// 需求單各選一筆，建立配對，不用像「新增移工」一樣重新輸入一筆完整的
// 移工資料。
function ArrangeEmployerModal({ workers, employers, onCancel, onSave, lang }) {
  const [workerId, setWorkerId] = useState('');
  const [employerId, setEmployerId] = useState('');
  const sortedWorkers = [...workers].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ workerId, employerId });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('新增雇主安排', lang)}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              {t('移工', lang)}
              <select required value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
                <option value="">{t('請選擇', lang)}</option>
                {sortedWorkers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label>
              {t('雇主', lang)}
              <select required value={employerId} onChange={(e) => setEmployerId(e.target.value)}>
                <option value="">{t('請選擇', lang)}</option>
                {employers.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
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

// 流程管理：依雇主分組（而不是階段分欄）呈現進度，方便業務/行政人員一次
// 看完某個雇主底下所有移工目前卡在哪個階段；沒有配對雇主的移工歸在最後
// 的「尚未配對」分組。
function ProcessView({ workers, employers, canEditPage, onMoveStage, onEdit, lang }) {
  const groups = [
    ...employers.map((e) => ({ id: e.id, name: e.name, items: workers.filter((w) => w.employerId === e.id) })),
    { id: '', name: t('尚未配對', lang), items: workers.filter((w) => !w.employerId) },
  ].filter((g) => g.items.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {groups.length === 0 && <p className="muted">{t('沒有案件', lang)}</p>}
      {groups.map((g) => (
        <div className="card" key={g.id || '__unmatched__'}>
          <h4 style={{ marginTop: 0 }}>{g.name} <span className="muted" style={{ fontWeight: 400 }}>（{g.items.length}）</span></h4>
          <div className="table-wrap"><table>
            <thead><tr><th>{t('姓名', lang)}</th><th>{t('工種', lang)}</th><th>{t('目前階段', lang)}</th><th>{t('證件狀態', lang)}</th></tr></thead>
            <tbody>
              {g.items
                .sort((a, b) => stageIndex(a.stage) - stageIndex(b.stage))
                .map((w) => {
                  const ps = passportStatus(w, lang);
                  return (
                    <tr key={w.id}>
                      <td style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => onEdit(w)}>{w.name}</td>
                      <td>{t(w.job, lang) || '—'}</td>
                      <td>
                        {canEditPage ? (
                          <select value={w.stage} onChange={(e) => onMoveStage(w.id, e.target.value)}>
                            {STAGE_KEYS.map((k) => <option key={k} value={k}>{t(k, lang)}</option>)}
                          </select>
                        ) : t(w.stage, lang)}
                      </td>
                      <td><span className={`tag ${ps.cls}`}>{ps.label}</span></td>
                    </tr>
                  );
                })}
            </tbody>
          </table></div>
        </div>
      ))}
    </div>
  );
}

function WorkerFormModal({ initial, employers, onCancel, onSave, onRemove, lang }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯移工', lang) : t('新增移工', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.filter((f) => f.type !== 'textarea' && f.key !== 'employerId').map((f) => (
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
            <label>
              {t('配對雇主', lang)}
              <select value={form.employerId || ''} onChange={(e) => setForm({ ...form, employerId: e.target.value })}>
                <option value="">{t('尚未配對', lang)}</option>
                {employers.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </label>
          </div>
          <label>
            {t('備註', lang)}
            <textarea rows={3} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ marginBottom: 16 }} />
          </label>
          <div className="row-actions">
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
            {onRemove && <button type="button" className="danger" onClick={onRemove}>{t('刪除', lang)}</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
