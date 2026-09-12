import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const FIELDS = [
  { key: 'projectCode', label: '專案編號', required: true },
  { key: 'client', label: '客戶名稱', required: true },
  { key: 'taxId', label: '統一編號' },
  { key: 'monthlyProcessingFee', label: '每月辦件費', type: 'number' },
  { key: 'monthlyServiceFee', label: '每月服務費', type: 'number' },
  { key: 'monthlyDormFee', label: '每月宿舍費', type: 'number' },
  { key: 'monthlyDormManageFee', label: '每月宿管費', type: 'number' },
  { key: 'billingStartDate', label: '計費起算日', type: 'date' },
  { key: 'billingSettleDay', label: '請款結算日' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'billDormFee', label: '是否請款住宿費' }];

export default function ClientFeeSetupPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'bonus', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_clientFeeSetup');
  const { rows: positions } = useCollection('tsaipei_positions');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_clientFeeSetup', CSV_FIELDS, { entityLabel: '客戶費用建檔', requiredKeys: ['projectCode', 'client'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows.filter((r) => !searchQuery || `${r.projectCode || ''} ${r.client || ''}`.toLowerCase().includes(searchQuery));

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
        <h2>客戶費用建檔</h2>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增費率</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <p className="muted" style={{ marginTop: 0 }}>「客戶請款」的費率來源，一個專案＋客戶一列，不是計算結果本身。</p>
        <input placeholder="搜尋專案編號或客戶" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr>{FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}<th>是否請款住宿費</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  {FIELDS.map((f) => <td key={f.key}>{r[f.key] || '—'}</td>)}
                  <td>{r.billDormFee === '否' ? '否' : '是'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={FIELDS.length + 2} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <ClientFeeFormModal initial={editing} positions={positions} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function ClientFeeFormModal({ initial, positions, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const projectCodes = [...new Set(positions.map((p) => p.projectCode).filter(Boolean))].sort();
  const companies = [...new Set(positions.map((p) => p.company).filter(Boolean))].sort();
  if (form.client && !companies.includes(form.client)) companies.push(form.client);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯費率' : '新增費率'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              專案編號
              <select value={form.projectCode || ''} onChange={(e) => setForm({ ...form, projectCode: e.target.value })}>
                <option value="">請選擇</option>
                {projectCodes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              客戶名稱
              <select required value={form.client || ''} onChange={(e) => setForm({ ...form, client: e.target.value })}>
                <option value="">請選擇客戶</option>
                {companies.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {FIELDS.filter((f) => !['projectCode', 'client'].includes(f.key)).map((f) => (
              <label key={f.key}>
                {f.label}
                <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
            <label>
              是否請款住宿費
              <select value={form.billDormFee || '是'} onChange={(e) => setForm({ ...form, billDormFee: e.target.value })}>
                <option value="是">是</option>
                <option value="否">否</option>
              </select>
            </label>
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
