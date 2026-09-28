import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const BILLING_TYPES = ['固定制', '月費制'];

const FIELDS = [
  { key: 'client', label: '客戶名稱', required: true },
  { key: 'billingType', label: '收費類型', options: BILLING_TYPES },
  { key: 'fixedFee', label: '固定金額（固定制）', type: 'number' },
  { key: 'monthlyServiceFee', label: '每月服務費（月費制）', type: 'number' },
  { key: 'notes', label: '備註' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'reviewStatus', label: '審核狀態' }];

export default function ClientFeeSetupPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'bonus', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('dispatch_clientFeeSetup');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('dispatch_clientFeeSetup', CSV_FIELDS, { entityLabel: '客戶費用建檔', requiredKeys: ['client'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows
    .filter((r) => !searchQuery || (r.client || '').toLowerCase().includes(searchQuery))
    .sort((a, b) => (a.client || '').localeCompare(b.client || ''));
  const groups = { 待審核: [], 固定制: [], 月費制: [] };
  filteredRows.forEach((r) => {
    if (r.reviewStatus !== '已審核') { groups.待審核.push(r); return; }
    groups[r.billingType === '固定制' ? '固定制' : '月費制'].push(r);
  });

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ reviewStatus: '待審核', ...data });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>客戶費用建檔</h2>
          <div className="page-desc">設定各客戶每月應收取的費用金額{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增費率</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有客戶費用設定，請先下載備份再匯入。新增的費率預設「待審核」，按下「審核」後才會歸入固定制／月費制分類。</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <p className="muted" style={{ marginTop: 0 }}>「客戶請款計算」的費率來源，一個客戶一列，不是計算結果本身。</p>
        <input placeholder="搜尋客戶名稱" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h3 style={{ margin: '0 0 8px' }}>待審核 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups.待審核.length} 筆</span></h3>
              <div className="table-wrap"><table>
                <thead><tr><th>客戶名稱</th><th>收費類型</th><th>固定金額</th><th>每月服務費</th>{canEditPage && <th></th>}</tr></thead>
                <tbody>
                  {groups.待審核.map((r) => (
                    <tr key={r.id}>
                      <td>{r.client || '—'}</td>
                      <td>{r.billingType || '—'}</td>
                      <td>{r.fixedFee || '—'}</td>
                      <td>{r.monthlyServiceFee || '—'}</td>
                      {canEditPage && (
                        <td className="row-actions">
                          <button onClick={() => update(r.id, { reviewStatus: '已審核' })}>審核</button>
                          <button onClick={() => setEditing(r)}>編輯</button>
                          <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {groups.待審核.length === 0 && <tr><td colSpan={canEditPage ? 5 : 4} className="muted">沒有資料</td></tr>}
                </tbody>
              </table></div>
            </div>
            {BILLING_TYPES.map((type) => (
              <div key={type}>
                <h3 style={{ margin: '0 0 8px' }}>{type} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[type].length} 筆</span></h3>
                <div className="table-wrap"><table>
                  <thead><tr><th>客戶名稱</th>{type === '固定制' ? <th>固定金額</th> : <th>每月服務費</th>}<th>備註</th>{canEditPage && <th></th>}</tr></thead>
                  <tbody>
                    {groups[type].map((r) => (
                      <tr key={r.id}>
                        <td>{r.client || '—'}</td>
                        <td>{type === '固定制' ? (r.fixedFee || '—') : (r.monthlyServiceFee || '—')}</td>
                        <td>{r.notes || '—'}</td>
                        {canEditPage && (
                          <td className="row-actions">
                            <button onClick={() => setEditing(r)}>編輯</button>
                            <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {groups[type].length === 0 && <tr><td colSpan={canEditPage ? 4 : 3} className="muted">沒有資料</td></tr>}
                  </tbody>
                </table></div>
              </div>
            ))}
          </div>
        )}
      </div>
      {editing && <ClientFeeFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function ClientFeeFormModal({ initial, onCancel, onSave }) {
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
