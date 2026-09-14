import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

// Ported from the user-supplied 宿舍租賃 spreadsheet — same欄位順序/名稱，日期
// 維持原始的民國年格式（例如 112/02/01）以文字儲存，不轉換成西元日期。
const FIELDS = [
  { key: 'category', label: '科目' },
  { key: 'name', label: '分類' },
  { key: 'address', label: '地址' },
  { key: 'leaseStart', label: '起租日' },
  { key: 'leaseEnd', label: '結束日' },
  { key: 'terminationDate', label: '解約日' },
  { key: 'deposit', label: '押金', type: 'number' },
  { key: 'rent', label: '金額', type: 'number' },
  { key: 'paymentDay', label: '每月付款時間' },
  { key: 'lesseeName', label: '承租單位名稱' },
  { key: 'contactName', label: '聯絡人' },
  { key: 'contactPhone', label: '電話' },
  { key: 'bankAccountName', label: '帳戶名稱' },
  { key: 'bank', label: '銀行' },
  { key: 'branch', label: '分行' },
  { key: 'branchCode', label: '分支代號' },
  { key: 'bankAccount', label: '帳號' },
  { key: 'notes', label: '備註' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

export default function LeasesPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'leases', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('dormMgmt_leases');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('dormMgmt_leases', CSV_FIELDS, { entityLabel: '宿舍租賃主檔', canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows.filter((r) => !searchQuery || [r.category, r.name, r.address, r.lesseeName].some((v) => v?.toLowerCase().includes(searchQuery)));

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
          <h2>宿舍租賃主檔</h2>
          <div className="page-desc">記錄每筆宿舍/場地租約：地址、租期、押金、租金、每月付款時間與匯款資訊{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增租約</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有租賃主檔資料，請先下載備份再匯入。</p>}
      <input placeholder="搜尋科目、分類、地址或承租單位" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      <div className="card" style={{ overflowX: 'auto' }}>
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr>{FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  {FIELDS.map((f) => <td key={f.key}>{f.type === 'number' ? (r[f.key] ? Number(r[f.key]).toLocaleString() : '—') : (r[f.key] || '—')}</td>)}
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={FIELDS.length + 1} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <LeaseFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function LeaseFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 640 }}>
        <h3>{initial.id ? '編輯租約' : '新增租約'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input type={f.type || 'text'} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.key.includes('lease') || f.key === 'terminationDate' ? '例如 112/02/01' : ''} />
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
