import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { exportEntityCSV } from '../../lib/csv';
import { useAuth } from '../../auth/AuthContext';
import { logChange, nowIso } from '../../lib/changeLog';

const FIELDS = [
  { key: 'name', label: '客戶名稱', required: true },
  { key: 'contact', label: '聯絡人' },
  { key: 'phone', label: '電話' },
  { key: 'address', label: '地址' },
  { key: 'taxId', label: '統編' },
];

export default function CustomersPage() {
  const { system, role, overrides } = useOutletContext();
  const { user } = useAuth();
  const canEditPage = computeCanEdit(system, 'shipping', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('foodfactory_customers', { order: ['name', 'asc'] });
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows.filter((r) => !searchQuery || [r.name, r.contact, r.phone].some((v) => v?.toLowerCase().includes(searchQuery)));

  function handleDownload() {
    exportEntityCSV(rows, [...FIELDS, { key: 'updatedAt', label: '最後修改時間' }], '客戶主檔');
  }

  async function handleSave(data) {
    const updatedAt = nowIso();
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, { ...rest, updatedAt });
      await logChange('客戶主檔', '編輯', rest.name, user?.email);
    } else {
      await add({ ...data, updatedAt });
      await logChange('客戶主檔', '新增', data.name, user?.email);
    }
    setEditing(null);
  }

  async function handleDelete(customer) {
    await remove(customer.id);
    await logChange('客戶主檔', '刪除', customer.name, user?.email);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>成品與出貨 · 客戶主檔</h2>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增客戶</button>}
          <button onClick={handleDownload}>下載完整資料</button>
        </div>
      </div>
      <div className="card">
        <input placeholder="搜尋名稱/聯絡人/電話" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead><tr>{FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}<th>最後修改時間</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  {FIELDS.map((f) => <td key={f.key}>{r[f.key] || '—'}</td>)}
                  <td>{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => handleDelete(r)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={FIELDS.length + 2} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {editing && <CustomerFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function CustomerFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯客戶' : '新增客戶'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
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
