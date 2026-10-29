import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import Tag from '../../components/Tag';

const BILLING_TYPES = ['固定制', '月費制'];
const CONTRACT_STATUSES = ['洽談中', '已簽約', '已終止'];
const CONTRACT_STATUS_TAG = { 洽談中: 'tag-amber', 已簽約: 'tag-green', 已終止: 'tag-grey' };
const NO_CONTRACT_STATUS_KEY = '未填簽約狀態';

// 單純的客戶基本資料總覽（跟「客戶費用建檔」不同，那邊是請款計算用的詳細
// 費率設定，這裡只是一個客戶一列的簡單名冊，方便快速查詢客戶的產業別、
// 收費類型、實習津貼/膳宿費扣款金額、其他福利，不綁定專案編號）。
const FIELDS = [
  { key: 'client', label: '客戶名稱', required: true },
  { key: 'contractStatus', label: '簽約狀態', options: CONTRACT_STATUSES },
  { key: 'taxId', label: '統一編號' },
  { key: 'industry', label: '產業別' },
  { key: 'billingType', label: '收費類型', options: BILLING_TYPES },
  { key: 'stipendAmount', label: '實習津貼金額', type: 'number' },
  { key: 'boardDeduction', label: '膳宿費扣款金額', type: 'number' },
  { key: 'otherBenefits', label: '其他福利', type: 'textarea' },
];
const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

export default function ClientListPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'clientList', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_clientList');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [taxIdQuery, setTaxIdQuery] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_clientList', CSV_FIELDS, { entityLabel: '客戶列表', requiredKeys: ['client'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const taxIdSearchQuery = taxIdQuery.trim().toLowerCase();
  const filteredRows = rows
    .filter((r) => !searchQuery || `${r.client || ''} ${r.taxId || ''} ${r.industry || ''}`.toLowerCase().includes(searchQuery))
    .filter((r) => !taxIdSearchQuery || (r.taxId || '').toLowerCase().includes(taxIdSearchQuery))
    .sort((a, b) => (a.client || '').localeCompare(b.client || ''));

  // 依簽約狀態分類顯示，方便一眼看出目前有在合作（已簽約）、洽談中、已終止
  // 的客戶各有多少間；沒填簽約狀態的歸到「未填簽約狀態」，固定排在最後。
  const groups = {};
  filteredRows.forEach((r) => {
    const key = r.contractStatus || NO_CONTRACT_STATUS_KEY;
    (groups[key] ||= []).push(r);
  });
  const groupKeys = [...CONTRACT_STATUSES, NO_CONTRACT_STATUS_KEY].filter((k) => groups[k]?.length);

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
          <h2>客戶列表</h2>
          <div className="page-desc">客戶的基本資料名冊，依簽約狀態（洽談中/已簽約/已終止）分類顯示{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增客戶</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有客戶列表資料，請先下載備份再匯入。</p>}
      <div className="row-actions" style={{ marginBottom: 16 }}>
        <input placeholder="搜尋客戶名稱/統一編號/產業別" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        <input placeholder="搜尋統一編號" value={taxIdQuery} onChange={(e) => setTaxIdQuery(e.target.value)} style={{ width: 180 }} />
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        groupKeys.length === 0 ? <p className="muted">沒有資料</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {groupKeys.map((key) => (
              <div className="card" key={key} style={{ overflowX: 'auto' }}>
                <h3 style={{ marginTop: 0 }}>
                  {key === NO_CONTRACT_STATUS_KEY ? key : <Tag value={key} map={CONTRACT_STATUS_TAG} />}{' '}
                  <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[key].length} 間客戶</span>
                </h3>
                <div className="table-wrap"><table>
                  <thead>
                    <tr>
                      <th>客戶名稱</th><th>統一編號</th><th>產業別</th><th>收費類型</th><th>實習津貼金額</th><th>膳宿費扣款金額</th><th>其他福利</th>
                      {canEditPage && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {groups[key].map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.client}</td>
                        <td>{r.taxId || '—'}</td>
                        <td>{r.industry || '—'}</td>
                        <td>{r.billingType || '—'}</td>
                        <td>{r.stipendAmount || '—'}</td>
                        <td>{r.boardDeduction || '—'}</td>
                        <td style={{ whiteSpace: 'pre-wrap' }}>{r.otherBenefits || '—'}</td>
                        {canEditPage && (
                          <td className="row-actions">
                            <button onClick={() => setEditing(r)}>編輯</button>
                            <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            ))}
          </div>
        )
      )}
      {editing && <ClientFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function ClientFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯客戶' : '新增客戶'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.filter((f) => f.type !== 'textarea').map((f) => (
              <label key={f.key}>
                {f.label}
                {f.options ? (
                  <select value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    <option value="">請選擇</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
          </div>
          <label>
            其他福利
            <textarea rows={3} value={form.otherBenefits || ''} onChange={(e) => setForm({ ...form, otherBenefits: e.target.value })} style={{ marginBottom: 16 }} />
          </label>
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
