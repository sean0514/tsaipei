import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const FIELDS = [
  { key: 'region', label: '地區', required: true },
  { key: 'name', label: '名字', required: true },
  { key: 'gender', label: '性別', options: ['', '男', '女'] },
  { key: 'identity', label: '身份', options: ['', '全職翻譯', '兼職翻譯', '學生翻譯', '外配翻譯'] },
  { key: 'phone', label: '電話' },
  { key: 'lineId', label: 'LINE ID' },
  { key: 'transportation', label: '交通方式' },
  { key: 'serviceAreas', label: '可配合區域' },
  { key: 'pricingMethod', label: '計價方式' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

// 可以看到「計價方式」的角色：薪資/成本性質的資訊，限主管、會計、系統
// 管理員，其他角色（包含業務/服務/翻譯/宿管人員）完全看不到這個欄位，
// 連表單、表格、CSV 匯出都排除，不是單純前端隱藏文字而已。
const PRICING_VISIBLE_ROLES = ['主管', '會計人員', '系統管理員'];

// 聯絡資訊／各區翻譯資訊：各地區配合的翻譯人員聯絡方式與配合條件，跟
// 「翻譯人員」這個系統角色是不同的東西——這裡存的是外部配合的翻譯資源
// 名單，不是系統登入帳號，純粹是給業務/服務人員查詢用的聯絡清單。
export default function TranslatorContactsPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'translatorContacts', role, overrides);
  const canSeePricing = PRICING_VISIBLE_ROLES.includes(role);
  const visibleFields = FIELDS.filter((f) => f.key !== 'pricingMethod' || canSeePricing);
  const csvFields = CSV_FIELDS.filter((f) => f.key !== 'pricingMethod' || canSeePricing);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_translatorContacts');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_translatorContacts', csvFields, { entityLabel: '各區翻譯資訊', requiredKeys: ['region', 'name'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows
    .filter((r) => !searchQuery || `${r.region || ''} ${r.name || ''} ${r.phone || ''} ${r.serviceAreas || ''}`.toLowerCase().includes(searchQuery))
    .sort((a, b) => (a.region || '').localeCompare(b.region || '') || (a.name || '').localeCompare(b.name || ''));

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
          <h2>各區翻譯資訊</h2>
          <div className="page-desc">各地區配合翻譯人員的聯絡方式與配合條件{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增翻譯資訊</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有各區翻譯資訊，請先下載備份再匯入。</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <input placeholder="搜尋地區/名字/電話/可配合區域" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>地區</th><th>名字</th><th>性別</th><th>身份</th><th>電話</th><th>LINE ID</th><th>交通方式</th><th>可配合區域</th>
                {canSeePricing && <th>計價方式</th>}
                {canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.region}</td>
                  <td>{r.name}</td>
                  <td>{r.gender || '—'}</td>
                  <td>{r.identity || '—'}</td>
                  <td>{r.phone || '—'}</td>
                  <td>{r.lineId || '—'}</td>
                  <td>{r.transportation || '—'}</td>
                  <td>{r.serviceAreas || '—'}</td>
                  {canSeePricing && <td>{r.pricingMethod || '—'}</td>}
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={8 + (canSeePricing ? 1 : 0) + (canEditPage ? 1 : 0)} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <ContactFormModal title={editing.id ? '編輯翻譯資訊' : '新增翻譯資訊'} initial={editing} fields={visibleFields} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function ContactFormModal({ title, initial, fields, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {fields.map((f) => (
              <label key={f.key}>
                {f.label}
                {f.options ? (
                  <select value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    {f.options.map((o) => <option key={o} value={o}>{o || '請選擇'}</option>)}
                  </select>
                ) : (
                  <input required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
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
