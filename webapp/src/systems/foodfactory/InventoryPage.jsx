import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../auth/AuthContext';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
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

const LOG_CSV_FIELDS = [
  { key: 'date', label: '時間' }, { key: 'action', label: '動作' },
  { key: 'materialName', label: '原料名稱' }, { key: 'operator', label: '操作人員' },
];

export default function InventoryPage() {
  const { system, role, overrides } = useOutletContext();
  const { user } = useAuth();
  const canEditPage = computeCanEdit(system, 'inventory', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('foodfactory_materials', { order: ['name', 'asc'] });
  const { rows: changeLogs, loading: logsLoading } = useCollection('foodfactory_materialChangeLogs', { order: ['date', 'desc'] });
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [logQ, setLogQ] = useState('');

  const filtered = rows.filter((r) => !q || [r.name, r.category].some((v) => v?.includes(q)));
  const logSearchQuery = logQ.trim().toLowerCase();
  const filteredLogs = changeLogs.filter((l) => !logSearchQuery || `${l.action || ''} ${l.materialName || ''} ${l.operator || ''}`.toLowerCase().includes(logSearchQuery));

  function handleDownload() {
    exportEntityCSV(rows, [...FIELDS, { key: 'updatedAt', label: '修改日期' }], '原料主檔');
  }

  function handleDownloadLogs() {
    exportEntityCSV(changeLogs, LOG_CSV_FIELDS, '原料修改紀錄');
  }

  // 每一次新增/編輯/刪除都寫一筆修改紀錄，方便追蹤誰在什麼時候動過哪筆原料。
  async function logChange(action, materialName) {
    await addDoc(collection(db, 'foodfactory_materialChangeLogs'), {
      date: new Date().toISOString(), action, materialName, operator: user?.email || '(未知)',
    });
  }

  async function handleSave(data) {
    const updatedAt = new Date().toISOString().slice(0, 10);
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, { ...rest, updatedAt });
      await logChange('編輯', rest.name);
    } else {
      await add({ ...data, updatedAt });
      await logChange('新增', data.name);
    }
    setEditing(null);
  }

  async function handleDelete(material) {
    await remove(material.id);
    await logChange('刪除', material.name);
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
                <th>修改日期</th>
                {canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  {FIELDS.map((f) => <td key={f.key}>{r[f.key] || '—'}</td>)}
                  <td>{r.updatedAt || '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => handleDelete(r)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={FIELDS.length + 2} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="page-header" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>修改紀錄</h3>
          <button onClick={handleDownloadLogs}>下載完整資料</button>
        </div>
        <input placeholder="搜尋動作/原料名稱/操作人員" value={logQ} onChange={(e) => setLogQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {logsLoading ? <p className="muted">載入中…</p> : (
          <table>
            <thead><tr><th>時間</th><th>動作</th><th>原料名稱</th><th>操作人員</th></tr></thead>
            <tbody>
              {filteredLogs.map((l) => (
                <tr key={l.id}>
                  <td>{l.date ? new Date(l.date).toLocaleString() : '—'}</td>
                  <td>{l.action}</td>
                  <td>{l.materialName || '—'}</td>
                  <td>{l.operator || '—'}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && <tr><td colSpan={4} className="muted">沒有資料</td></tr>}
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
