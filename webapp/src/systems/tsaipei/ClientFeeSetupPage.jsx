import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const BILLING_TYPES = ['半年制', '月費制'];

const FIELDS = [
  { key: 'projectCode', label: '專案編號', required: true },
  { key: 'client', label: '客戶名稱', required: true },
  { key: 'taxId', label: '統一編號' },
  { key: 'billingType', label: '收費類型', options: BILLING_TYPES },
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
  const filteredRows = rows
    .filter((r) => !searchQuery || `${r.projectCode || ''} ${r.client || ''}`.toLowerCase().includes(searchQuery))
    .sort((a, b) => (a.projectCode || '').localeCompare(b.projectCode || ''));
  const groups = { 半年制: [], 月費制: [] };
  filteredRows.forEach((r) => groups[r.billingType === '半年制' ? '半年制' : '月費制'].push(r));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add(data);
    }
    setEditing(null);
  }

  // 把「實習單位」裡有、但這裡還沒有的專案編號＋公司名稱直接複製成新的一列，
  // 使用者再補上費用金額即可，不用手動一筆一筆新增選擇。
  async function handleCopyFromPositions() {
    const existing = new Set(rows.map((r) => r.projectCode));
    const seen = new Set();
    const toAdd = [];
    positions.forEach((p) => {
      if (!p.projectCode || !p.company) return;
      if (existing.has(p.projectCode) || seen.has(p.projectCode)) return;
      seen.add(p.projectCode);
      toAdd.push({ projectCode: p.projectCode, client: p.company });
    });
    if (toAdd.length === 0) { alert('實習單位裡的專案編號都已經在這裡了，沒有新的可以帶入。'); return; }
    for (const item of toAdd) await add(item);
    alert(`已從實習單位複製帶入 ${toAdd.length} 筆，請補上費用金額。`);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>客戶費用建檔</h2>
          <div className="page-desc">依專案設定各客戶每月應收取的費用金額{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增費率</button>}
          {canEditPage && <button onClick={handleCopyFromPositions}>從實習單位複製帶入</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有客戶費用設定，請先下載備份再匯入。</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <p className="muted" style={{ marginTop: 0 }}>「客戶請款」的費率來源，一個專案＋客戶一列，不是計算結果本身。</p>
        <input placeholder="搜尋專案編號或客戶" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {BILLING_TYPES.map((type) => {
              const tableFields = FIELDS.filter((f) => f.key !== 'billingType');
              return (
                <div key={type}>
                  <h3 style={{ margin: '0 0 8px' }}>{type} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[type].length} 筆</span></h3>
                  <div className="table-wrap"><table>
                    <thead><tr>{tableFields.map((f) => <th key={f.key}>{f.label}</th>)}<th>是否請款住宿費</th>{canEditPage && <th></th>}</tr></thead>
                    <tbody>
                      {groups[type].map((r) => (
                        <tr key={r.id}>
                          {tableFields.map((f) => <td key={f.key}>{r[f.key] || '—'}</td>)}
                          <td>{r.billDormFee === '否' ? '否' : '是'}</td>
                          {canEditPage && (
                            <td className="row-actions">
                              <button onClick={() => setEditing(r)}>編輯</button>
                              <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                            </td>
                          )}
                        </tr>
                      ))}
                      {groups[type].length === 0 && <tr><td colSpan={tableFields.length + 2} className="muted">沒有資料</td></tr>}
                    </tbody>
                  </table></div>
                </div>
              );
            })}
          </div>
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
  // 專案編號在「實習單位」裡已經跟公司名稱綁在一起，選了專案編號就自動帶入對應公司。
  const companyByProjectCode = {};
  positions.forEach((p) => { if (p.projectCode && p.company && !companyByProjectCode[p.projectCode]) companyByProjectCode[p.projectCode] = p.company; });

  function handleProjectCodeChange(code) {
    setForm({ ...form, projectCode: code, client: companyByProjectCode[code] || form.client });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯費率' : '新增費率'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              專案編號
              <select value={form.projectCode || ''} onChange={(e) => handleProjectCodeChange(e.target.value)}>
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
