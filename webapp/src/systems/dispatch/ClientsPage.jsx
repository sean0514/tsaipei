import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const FIELDS = [
  { key: 'client', label: '廠商名稱', required: true },
];

// 分店/駐廠人員存成 JSON 字串陣列（跟客戶費用建檔的報價內容同一套做法），
// 一個廠商可以有多筆分店+駐廠人員配對，CSV 匯出入才能完整保留。
export function parseBranches(text) {
  if (!text) return [];
  try {
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'branches', label: '分店/駐廠人員' }];

export default function ClientsPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'bonus', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('dispatch_clients');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('dispatch_clients', CSV_FIELDS, { entityLabel: '客戶資訊', requiredKeys: ['client'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows
    .filter((r) => {
      if (!searchQuery) return true;
      if ((r.client || '').toLowerCase().includes(searchQuery)) return true;
      return parseBranches(r.branches).some((b) => (b.branch || '').toLowerCase().includes(searchQuery) || (b.onsiteStaff || '').toLowerCase().includes(searchQuery));
    })
    .sort((a, b) => (a.client || '').localeCompare(b.client || ''));

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
        <div>
          <h2>客戶資訊</h2>
          <div className="page-desc">廠商名稱與分店/駐廠人員基本資料{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增客戶資訊</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有客戶資訊，請先下載備份再匯入。</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <input placeholder="搜尋廠商名稱/分店名稱/駐廠人員" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>廠商名稱</th><th>分店 / 駐廠人員</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filteredRows.map((r) => {
                const branches = parseBranches(r.branches);
                return (
                  <tr key={r.id}>
                    <td>{r.client}</td>
                    <td>
                      {branches.length ? branches.map((b, i) => (
                        <div key={i} className="muted" style={{ fontSize: 13 }}>{b.branch || '（未填分店）'}：{b.onsiteStaff || '—'}</div>
                      )) : '—'}
                    </td>
                    {canEditPage && (
                      <td className="row-actions">
                        <button onClick={() => setEditing(r)}>編輯</button>
                        <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredRows.length === 0 && <tr><td colSpan={3} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <ClientFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function BranchesEditor({ items, onChange }) {
  function updateItem(i, patch) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function removeItem(i) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function addItem() {
    onChange([...items, { branch: '', onsiteStaff: '' }]);
  }

  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className="form-grid" style={{ marginBottom: 10, alignItems: 'end' }}>
          <label>
            分店名稱
            <input value={it.branch || ''} onChange={(e) => updateItem(i, { branch: e.target.value })} />
          </label>
          <label>
            駐廠人員
            <div className="row-actions">
              <input value={it.onsiteStaff || ''} onChange={(e) => updateItem(i, { onsiteStaff: e.target.value })} style={{ flex: 1 }} />
              <button type="button" className="danger" onClick={() => removeItem(i)}>移除</button>
            </div>
          </label>
        </div>
      ))}
      <button type="button" onClick={addItem}>+ 新增分店</button>
    </div>
  );
}

function ClientFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const branches = parseBranches(form.branches);

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ ...form, branches: JSON.stringify(branches.filter((b) => b.branch || b.onsiteStaff)) });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯客戶資訊' : '新增客戶資訊'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
          </div>
          <h4>分店 / 駐廠人員</h4>
          <BranchesEditor items={branches} onChange={(next) => setForm({ ...form, branches: JSON.stringify(next) })} />
          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
