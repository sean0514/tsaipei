import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { exportEntityCSV } from '../../lib/csv';
import { useAuth } from '../../auth/AuthContext';
import { logChange, nowIso } from '../../lib/changeLog';

const FIELDS = [
  { key: 'name', label: '供應商名稱', required: true },
  { key: 'contact', label: '聯絡人' },
  { key: 'phone', label: '電話' },
  { key: 'address', label: '地址' },
  { key: 'taxId', label: '統編' },
  { key: 'billingCycle', label: '計算週期' },
  { key: 'paymentMethod', label: '付款方式' },
  { key: 'bankAccount', label: '帳號' },
  { key: 'bankBranch', label: '分行' },
  { key: 'accountName', label: '戶名' },
];

const PAYMENT_METHODS = ['現金', '匯款'];

export default function SuppliersPage() {
  const { system, role, overrides } = useOutletContext();
  const { user } = useAuth();
  const canEditPage = computeCanEdit(system, 'inventory', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('foodfactory_suppliers', { order: ['name', 'asc'] });
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows.filter((r) => !searchQuery || [r.name, r.contact, r.phone].some((v) => v?.toLowerCase().includes(searchQuery)));

  function handleDownload() {
    exportEntityCSV(rows, [...FIELDS, { key: 'updatedAt', label: '最後修改時間' }], '供應商');
  }

  async function handleSave(data) {
    const updatedAt = nowIso();
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, { ...rest, updatedAt });
      await logChange('供應商', '編輯', rest.name, user?.email);
    } else {
      await add({ ...data, updatedAt });
      await logChange('供應商', '新增', data.name, user?.email);
    }
    setEditing(null);
  }

  async function handleDelete(supplier) {
    await remove(supplier.id);
    await logChange('供應商', '刪除', supplier.name, user?.email);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>原料與庫存 · 供應商</h2>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增供應商</button>}
          <button onClick={handleDownload}>下載完整資料</button>
        </div>
      </div>
      <div className="card">
        <input placeholder="搜尋名稱/聯絡人/電話" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
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
          </table></div>
        )}
      </div>
      {editing && <SupplierFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

const PLAIN_FIELDS = FIELDS.filter((f) => !['paymentMethod', 'bankAccount', 'bankBranch', 'accountName'].includes(f.key));

function SupplierFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const isTransfer = form.paymentMethod === '匯款';
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯供應商' : '新增供應商'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {PLAIN_FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
            <label>
              付款方式
              <select value={form.paymentMethod || ''} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                <option value="">請選擇</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            {isTransfer && (
              <>
                <label>
                  帳號
                  <input value={form.bankAccount || ''} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} />
                </label>
                <label>
                  分行
                  <input value={form.bankBranch || ''} onChange={(e) => setForm({ ...form, bankBranch: e.target.value })} />
                </label>
                <label>
                  戶名
                  <input value={form.accountName || ''} onChange={(e) => setForm({ ...form, accountName: e.target.value })} />
                </label>
              </>
            )}
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
