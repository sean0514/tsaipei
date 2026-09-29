import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const SERVICE_CATEGORIES = ['派遣', '待招', '承攬'];
const QUOTE_METHODS = ['時薪制', '月薪制', '計件制'];

const FIELDS = [
  { key: 'client', label: '客戶名稱', required: true },
  { key: 'taxId', label: '統一編號' },
  { key: 'industry', label: '產業別' },
  { key: 'contactName', label: '聯絡人' },
  { key: 'contactPhone', label: '聯絡電話' },
  { key: 'address', label: '地址' },
];

// 服務類別/報價方式（複選）、報價內容（可多筆新增的項目/內容清單）都存成
// JSON 字串陣列，跟其他系統「實習場域/地點」「其他福利」同一套做法，CSV
// 匯出入才能完整保留、重新匯入後也能正確還原成清單。
function parseList(text) {
  if (!text) return [];
  try {
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, ...FIELDS,
  { key: 'serviceCategories', label: '服務費用計算類別' }, { key: 'quoteMethods', label: '報價方式' },
  { key: 'quoteItems', label: '報價內容' }, { key: 'notes', label: '備註' },
];

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
          <h2>客戶費用建檔</h2>
          <div className="page-desc">客戶基本資料、服務費用計算類別、報價方式與報價內容{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增客戶建檔</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有客戶費用建檔，請先下載備份再匯入。</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <input placeholder="搜尋客戶名稱" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>客戶名稱</th><th>統一編號</th><th>產業別</th><th>服務類別</th><th>報價方式</th><th>報價內容</th>
                {canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => {
                const categories = parseList(r.serviceCategories);
                const methods = parseList(r.quoteMethods);
                const items = parseList(r.quoteItems);
                return (
                  <tr key={r.id}>
                    <td>{r.client || '—'}</td>
                    <td>{r.taxId || '—'}</td>
                    <td>{r.industry || '—'}</td>
                    <td>{categories.length ? categories.join('、') : '—'}</td>
                    <td>{methods.length ? methods.join('、') : '—'}</td>
                    <td>{items.length ? `${items.length} 筆` : '—'}</td>
                    {canEditPage && (
                      <td className="row-actions">
                        <button onClick={() => setEditing(r)}>編輯</button>
                        <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredRows.length === 0 && <tr><td colSpan={canEditPage ? 7 : 6} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <ClientFeeFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function CheckboxGroup({ options, values, onChange }) {
  function toggle(o) {
    onChange(values.includes(o) ? values.filter((v) => v !== o) : [...values, o]);
  }
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
          <input type="checkbox" checked={values.includes(o)} onChange={() => toggle(o)} />
          {o}
        </label>
      ))}
    </div>
  );
}

function QuoteItemsEditor({ items, onChange }) {
  function updateItem(i, patch) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function removeItem(i) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function addItem() {
    onChange([...items, { item: '', content: '' }]);
  }

  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className="form-grid" style={{ marginBottom: 10, alignItems: 'end' }}>
          <label>
            項目
            <input value={it.item || ''} onChange={(e) => updateItem(i, { item: e.target.value })} />
          </label>
          <label style={{ gridColumn: 'span 1' }}>
            內容
            <div className="row-actions">
              <input value={it.content || ''} onChange={(e) => updateItem(i, { content: e.target.value })} style={{ flex: 1 }} />
              <button type="button" className="danger" onClick={() => removeItem(i)}>移除</button>
            </div>
          </label>
        </div>
      ))}
      <button type="button" onClick={addItem}>+ 新增報價內容</button>
    </div>
  );
}

function ClientFeeFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const categories = parseList(form.serviceCategories);
  const methods = parseList(form.quoteMethods);
  const items = parseList(form.quoteItems);

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
      ...form,
      serviceCategories: JSON.stringify(categories),
      quoteMethods: JSON.stringify(methods),
      quoteItems: JSON.stringify(items.filter((it) => it.item || it.content)),
    });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯客戶建檔' : '新增客戶建檔'}</h3>
        <form onSubmit={handleSubmit}>
          <h4 style={{ marginTop: 0 }}>客戶建檔</h4>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
          </div>

          <h4>服務費用計算類別</h4>
          <CheckboxGroup options={SERVICE_CATEGORIES} values={categories} onChange={(next) => setForm({ ...form, serviceCategories: JSON.stringify(next) })} />

          <h4>報價方式</h4>
          <CheckboxGroup options={QUOTE_METHODS} values={methods} onChange={(next) => setForm({ ...form, quoteMethods: JSON.stringify(next) })} />

          <h4>報價內容</h4>
          <QuoteItemsEditor items={items} onChange={(next) => setForm({ ...form, quoteItems: JSON.stringify(next) })} />

          <label style={{ marginTop: 16, display: 'block' }}>
            備註
            <textarea rows={3} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>

          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
