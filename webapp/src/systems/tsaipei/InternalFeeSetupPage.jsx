import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { ROLE_FIELDS } from './PositionsPage';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'projectCode', label: '專案編號' }, { key: 'client', label: '客戶名稱' },
  ...ROLE_FIELDS,
];

export default function InternalFeeSetupPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'bonus', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_internalFeeSetup');
  const [editing, setEditing] = useState(null);
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_internalFeeSetup', CSV_FIELDS, { entityLabel: '內部費用建檔', requiredKeys: ['projectCode', 'client'], canEdit: canEditPage });

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
        <h2>內部費用建檔</h2>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增費率</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <p className="muted" style={{ marginTop: 0 }}>「內部獎金計算」的費率來源，一個專案＋客戶一列，不是計算結果本身。</p>
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead><tr><th>專案編號</th><th>客戶</th>{ROLE_FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.projectCode}</td>
                  <td>{r.client}</td>
                  {ROLE_FIELDS.map((f) => <td key={f.key}>{r[f.key] || 0}</td>)}
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={ROLE_FIELDS.length + 3} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
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
            <label>
              專案編號
              <input required value={form.projectCode || ''} onChange={(e) => setForm({ ...form, projectCode: e.target.value })} />
            </label>
            <label>
              客戶名稱
              <input required value={form.client || ''} onChange={(e) => setForm({ ...form, client: e.target.value })} />
            </label>
            {ROLE_FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}（每月）
                <input type="number" value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
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
