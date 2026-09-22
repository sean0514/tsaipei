import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { WORK_TYPES } from './WorkersPage';

const EMPLOYER_STATUS = ['待媒合', '已媒合', '取消'];

const FIELDS = [
  { key: 'employerName', label: '雇主姓名', required: true },
  { key: 'phone', label: '聯絡電話' },
  { key: 'address', label: '地址' },
  { key: 'workType', label: '需求類型', options: WORK_TYPES },
  { key: 'careRecipient', label: '被照顧者狀況' },
  { key: 'status', label: '狀態', options: EMPLOYER_STATUS },
  { key: 'notes', label: '備註' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

export default function EmployersPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'employers', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('yujian_employers');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('yujian_employers', CSV_FIELDS, { entityLabel: '雇主家庭/需求單', requiredKeys: ['employerName'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows.filter((r) => !searchQuery || `${r.employerName || ''} ${r.address || ''}`.toLowerCase().includes(searchQuery));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ status: '待媒合', ...data });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>雇主家庭/需求單</h2>
          <div className="page-desc">管理雇主家庭的基本資料與聘僱需求{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增需求單</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有雇主資料，請先下載備份再匯入。</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <input placeholder="搜尋雇主姓名或地址" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr>{FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filtered.map((r) => (
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
              {filtered.length === 0 && <tr><td colSpan={FIELDS.length + (canEditPage ? 1 : 0)} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <EmployerFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function EmployerFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯需求單' : '新增需求單'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                {f.options ? (
                  <select required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    <option value="">請選擇</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
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
