import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { INDUSTRIES } from './constants';

const FIELDS = [
  { key: 'name', label: '雇主名稱', required: true },
  { key: 'industry', label: '產業別', options: INDUSTRIES },
  { key: 'demand', label: '需求人數', type: 'number' },
  { key: 'contact', label: '聯絡人' },
  { key: 'note', label: '備註', type: 'textarea' },
];
const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

export default function EmployersPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'employers', role, overrides);
  const { rows: employers, loading, add, update, remove } = useCollection('laborAgency_employers');
  const { rows: workers } = useCollection('laborAgency_workers');
  const [editing, setEditing] = useState(null);
  const { handleExport, handleImport } = useCsvOverwrite('laborAgency_employers', CSV_FIELDS, { entityLabel: '雇主需求單', requiredKeys: ['name'], canEdit: canEditPage });

  async function handleSave(data) {
    const payload = { ...data, demand: Math.max(0, parseInt(data.demand, 10) || 0) };
    if (payload.id) {
      const { id, ...rest } = payload;
      await update(id, rest);
    } else {
      await add(payload);
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>雇主需求單</h2>
          <div className="page-desc">雇主的產業別、需求人數、聯絡方式；在移工資料指定雇主後，這裡會自動算出已配對與缺口{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增雇主需求</button>}
          <ImportExportButtons rows={employers} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        employers.length === 0 ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>還沒有雇主需求單。新增後，可在移工資料中指定雇主，這裡會自動計算已配對與缺口。</p></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {employers.map((e) => {
              const matched = workers.filter((w) => w.employerId === e.id).length;
              const demand = +e.demand || 0;
              const remaining = demand - matched;
              return (
                <div className="card" key={e.id}>
                  <h3 style={{ marginTop: 0 }}>{e.name}</h3>
                  <div className="muted" style={{ fontSize: 13 }}>{e.industry || '—'}{e.contact ? `　聯絡人 ${e.contact}` : ''}</div>
                  <div style={{ margin: '10px 0' }}>
                    已配對 <b>{matched}</b> / 需求 <b>{demand}</b>{' '}
                    {remaining > 0 ? <span className="tag tag-amber">缺 {remaining} 人</span> : <span className="tag tag-green">已滿額</span>}
                  </div>
                  {e.note && <div className="muted" style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{e.note}</div>}
                  {canEditPage && (
                    <div className="row-actions" style={{ marginTop: 10 }}>
                      <button onClick={() => setEditing(e)}>編輯</button>
                      <button className="danger" onClick={() => remove(e.id)}>刪除</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
      {editing && <EmployerFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function EmployerFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯雇主需求' : '新增雇主需求'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.filter((f) => f.type !== 'textarea').map((f) => (
              <label key={f.key}>
                {f.label}
                {f.options ? (
                  <select value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    <option value="">請選擇</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} required={f.required} value={form[f.key] ?? (f.key === 'demand' ? 1 : '')} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
          </div>
          <label>
            備註
            <textarea rows={3} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ marginBottom: 16 }} />
          </label>
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
