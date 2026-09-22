import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const STATUSES = ['未匯款', '已匯款', '退回'];

const FIELDS = [
  { key: 'serialNumber', label: '編號' },
  { key: 'shipDate', label: '寄件日期', type: 'date' },
  { key: 'trackingNumber', label: '寄件編號' },
  { key: 'senderName', label: '寄件人' },
  { key: 'senderPhone', label: '電話(寄件人)' },
  { key: 'recipientName', label: '收件人' },
  { key: 'recipientPhone', label: '電話(收件人)' },
  { key: 'address', label: '地址' },
  { key: 'documentContent', label: '文件內容' },
  { key: 'amount', label: '金額', type: 'number' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'status', label: '狀態' }];

export default function PostageFeeRecordPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'applicationForms', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_postageFeeRecords');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_postageFeeRecords', CSV_FIELDS, { entityLabel: '郵資費用紀錄', requiredKeys: ['trackingNumber'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows.filter((r) => !searchQuery || `${r.trackingNumber || ''} ${r.senderName || ''} ${r.recipientName || ''} ${r.documentContent || ''}`.toLowerCase().includes(searchQuery));
  const groups = { 未匯款: [], 已匯款: [], 退回: [] };
  filtered.forEach((r) => groups[STATUSES.includes(r.status) ? r.status : '未匯款'].push(r));
  STATUSES.forEach((s) => groups[s].sort((a, b) => (b.shipDate || '').localeCompare(a.shipDate || '')));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ status: '未匯款', ...data });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>郵資費用紀錄</h2>
          <div className="page-desc">依未匯款／已匯款／退回分類{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增紀錄</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有郵資費用紀錄，請先下載備份再匯入。</p>}
      <input placeholder="搜尋寄件編號、寄件人、收件人或文件內容" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 280 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {STATUSES.map((status) => (
            <div className="card" key={status} style={{ overflowX: 'auto' }}>
              <h3 style={{ marginTop: 0 }}>{status}（{groups[status].length}）</h3>
              <div className="table-wrap"><table>
                <thead><tr>
                  <th>編號</th><th>寄件日期</th><th>寄件編號</th><th>寄件人</th><th>電話</th>
                  <th>收件人</th><th>電話</th><th>地址</th><th>文件內容</th><th>金額</th>{canEditPage && <th></th>}
                </tr></thead>
                <tbody>
                  {groups[status].map((r) => (
                    <tr key={r.id}>
                      <td>{r.serialNumber || '—'}</td>
                      <td>{r.shipDate || '—'}</td>
                      <td>{r.trackingNumber || '—'}</td>
                      <td>{r.senderName || '—'}</td>
                      <td>{r.senderPhone || '—'}</td>
                      <td>{r.recipientName || '—'}</td>
                      <td>{r.recipientPhone || '—'}</td>
                      <td>{r.address || '—'}</td>
                      <td>{r.documentContent || '—'}</td>
                      <td>{r.amount ? Number(r.amount).toLocaleString() : '—'}</td>
                      {canEditPage && (
                        <td className="row-actions">
                          {STATUSES.filter((s) => s !== status).map((s) => (
                            <button key={s} onClick={() => update(r.id, { status: s })}>{s}</button>
                          ))}
                          <button onClick={() => setEditing(r)}>編輯</button>
                          <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {groups[status].length === 0 && <tr><td colSpan={canEditPage ? 11 : 10} className="muted">沒有資料</td></tr>}
                </tbody>
              </table></div>
            </div>
          ))}
        </div>
      )}
      {editing && <PostageFeeFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function PostageFeeFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯郵資紀錄' : '新增郵資紀錄'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
            {initial.id && (
              <label>
                狀態
                <select value={form.status || '未匯款'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
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
