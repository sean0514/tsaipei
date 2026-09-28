import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const FIELDS = [
  { key: 'client', label: '客戶名稱', required: true },
  { key: 'salesPerson', label: '業務人員' },
  { key: 'monthlyRate', label: '每月費率', type: 'number' },
  { key: 'notes', label: '備註' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

export default function InternalFeeSetupPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'bonus', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('dispatch_internalFeeSetup');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('dispatch_internalFeeSetup', CSV_FIELDS, { entityLabel: '內部費用建檔', requiredKeys: ['client'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows
    .filter((r) => !searchQuery || (r.client || '').toLowerCase().includes(searchQuery))
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
          <h2>內部費用建檔</h2>
          <div className="page-desc">設定各客戶對應業務人員的內部獎金月費率{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增費率</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有內部費用設定，請先下載備份再匯入。</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <p className="muted" style={{ marginTop: 0 }}>「內部獎金計算」的費率來源，一個客戶一列，不是計算結果本身。</p>
        <input placeholder="搜尋客戶名稱" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>客戶名稱</th><th>業務人員</th><th>每月費率</th><th>備註</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.client}</td>
                  <td>{r.salesPerson || '—'}</td>
                  <td>{r.monthlyRate || 0}</td>
                  <td>{r.notes || '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={5} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <FeeFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function FeeFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯費率' : '新增費率'}</h3>
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
