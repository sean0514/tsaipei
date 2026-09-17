import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';

const FIELDS = [
  { key: 'name', label: '品名', required: true },
  { key: 'batchNo', label: '批號' },
  { key: 'spec', label: '規格(容量)' },
  { key: 'unit', label: '單位(重量)' },
  { key: 'shelfLifeDays', label: '保存期限(天)', type: 'number' },
  { key: 'price', label: '售價', type: 'number' },
];

export default function ProductsPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'shipping', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('foodfactory_products', { order: ['name', 'asc'] });
  const [editing, setEditing] = useState(null);

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add(data);
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>成品與出貨 · 成品主檔</h2>
        {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增成品</button>}
      </div>
      <div className="card">
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead><tr>{FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {FIELDS.map((f) => <td key={f.key}>{r[f.key] || '—'}</td>)}
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={FIELDS.length + 1} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {editing && <ProductFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function ProductFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯成品' : '新增成品'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
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
