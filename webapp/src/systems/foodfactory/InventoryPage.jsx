import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { materialStock } from '../../lib/foodInventory';
import { exportEntityCSV } from '../../lib/csv';

// apps-script/Code.gs SHEET_FIELDS.Materials — full schema, all fields included.
const FIELDS = [
  { key: 'name', label: '原料名稱', required: true },
  { key: 'category', label: '分類' },
  { key: 'unit', label: '單位' },
  { key: 'safetyStock', label: '安全庫存量', type: 'number' },
  { key: 'storageCondition', label: '儲存條件' },
  { key: 'note', label: '備註' },
];

export default function InventoryPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'inventory', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('foodfactory_materials', { order: ['name', 'asc'] });
  const { rows: inventoryLogs } = useCollection('foodfactory_inventoryLogs');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');

  const filtered = rows.filter((r) => !q || [r.name, r.category].some((v) => v?.includes(q)));

  function handleDownload() {
    exportEntityCSV(rows.map((r) => ({ ...r, stock: materialStock(r.id, inventoryLogs) })), [...FIELDS, { key: 'stock', label: '目前庫存' }], '原料主檔');
  }

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
        <h2>原料與庫存 · 原料主檔</h2>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增原料</button>}
          <button onClick={handleDownload}>下載完整資料</button>
        </div>
      </div>
      <div className="card">
        <input placeholder="搜尋名稱/分類" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead>
              <tr>
                {FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}
                <th>目前庫存</th>
                {canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  {FIELDS.map((f) => <td key={f.key}>{r[f.key] || '—'}</td>)}
                  <td>{materialStock(r.id, inventoryLogs)} {r.unit}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={FIELDS.length + 2} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {editing && <MaterialFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function MaterialFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯原料' : '新增原料'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  type={f.type || 'text'}
                  required={f.required}
                  value={form[f.key] || ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
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
