import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { exportEntityCSV } from '../../lib/csv';
import { useAuth } from '../../auth/AuthContext';
import { logChange, nowIso } from '../../lib/changeLog';

const DATA_TYPES = ['合格判定', '數值', '文字'];

const CSV_FIELDS = [
  { key: 'templateName', label: '範本名稱' }, { key: 'appliesTo', label: '適用對象' },
  { key: 'itemName', label: '檢驗項目' }, { key: 'spec', label: '標準值/規格' }, { key: 'dataType', label: '資料型態' },
  { key: 'updatedAt', label: '最後修改時間' },
];

export default function QcTemplatesPage() {
  const { system, role, overrides } = useOutletContext();
  const { user } = useAuth();
  const canEditPage = computeCanEdit(system, 'qc', role, overrides);
  const { rows: templates, loading, add, update, remove } = useCollection('foodfactory_qcTemplates');
  const { rows: items, add: addItem, update: updateItem, remove: removeItem } = useCollection('foodfactory_qcTemplateItems');
  const [editing, setEditing] = useState(null);
  const [itemFormFor, setItemFormFor] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [q, setQ] = useState('');

  const searchQuery = q.trim().toLowerCase();
  const filteredTemplates = templates.filter((t) => !searchQuery || `${t.name || ''} ${t.appliesTo || ''}`.toLowerCase().includes(searchQuery));

  function handleDownload() {
    const data = items.map((it) => {
      const t = templates.find((tt) => tt.id === it.templateId);
      return { templateName: t?.name || '', appliesTo: t?.appliesTo || '', itemName: it.itemName, spec: it.spec, dataType: it.dataType, updatedAt: it.updatedAt };
    });
    exportEntityCSV(data, CSV_FIELDS, '檢驗範本');
  }

  async function handleSave(data) {
    const updatedAt = nowIso();
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, { ...rest, updatedAt });
      await logChange('檢驗範本', '編輯', rest.name, user?.email);
    } else {
      await add({ ...data, updatedAt });
      await logChange('檢驗範本', '新增', data.name, user?.email);
    }
    setEditing(null);
  }

  async function handleDeleteTemplate(template) {
    await remove(template.id);
    await logChange('檢驗範本', '刪除', template.name, user?.email);
  }

  async function handleDeleteItem(item, templateName) {
    await removeItem(item.id);
    await logChange('檢驗範本項目', '刪除', `${templateName} / ${item.itemName}`, user?.email);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>品質/食安 · 檢驗範本</h2>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增範本</button>}
          <button onClick={handleDownload}>下載完整資料</button>
        </div>
      </div>
      <input placeholder="搜尋範本名稱/適用對象" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : filteredTemplates.map((t) => (
        <div className="card" key={t.id} style={{ marginBottom: 16 }}>
          <div className="page-header" style={{ marginBottom: 8 }}>
            <div>
              <strong>{t.name}</strong>
              <span className="muted" style={{ marginLeft: 8 }}>適用對象：{t.appliesTo || '—'}</span>
              <span className="muted" style={{ marginLeft: 8 }}>最後修改：{t.updatedAt ? new Date(t.updatedAt).toLocaleString() : '—'}</span>
            </div>
            {canEditPage && (
              <div className="row-actions">
                <button onClick={() => setEditing(t)}>編輯範本</button>
                <button className="danger" onClick={() => handleDeleteTemplate(t)}>刪除範本</button>
              </div>
            )}
          </div>
          <table>
            <thead><tr><th>檢驗項目</th><th>標準值/規格</th><th>資料型態</th><th>最後修改時間</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {items.filter((it) => it.templateId === t.id).map((it) => (
                <tr key={it.id}>
                  <td>{it.itemName}</td><td>{it.spec || '—'}</td><td>{it.dataType}</td>
                  <td>{it.updatedAt ? new Date(it.updatedAt).toLocaleString() : '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditingItem(it)}>編輯</button>
                      <button className="danger" onClick={() => handleDeleteItem(it, t.name)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {canEditPage && <button onClick={() => setItemFormFor(t.id)} style={{ marginTop: 8 }}>新增檢驗項目</button>}
        </div>
      ))}
      {editing && <TemplateFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
      {itemFormFor && (
        <ItemFormModal
          initial={{ dataType: '合格判定' }}
          onCancel={() => setItemFormFor(null)}
          onSave={async (data) => {
            await addItem({ ...data, templateId: itemFormFor, updatedAt: nowIso() });
            await logChange('檢驗範本項目', '新增', `${templates.find((t) => t.id === itemFormFor)?.name || ''} / ${data.itemName}`, user?.email);
            setItemFormFor(null);
          }}
        />
      )}
      {editingItem && (
        <ItemFormModal
          initial={editingItem}
          onCancel={() => setEditingItem(null)}
          onSave={async (data) => {
            const { id, templateId, ...rest } = data;
            await updateItem(id, { ...rest, updatedAt: nowIso() });
            await logChange('檢驗範本項目', '編輯', `${templates.find((t) => t.id === templateId)?.name || ''} / ${rest.itemName}`, user?.email);
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}

function TemplateFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯範本' : '新增範本'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>範本名稱<input required value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>適用對象<input value={form.appliesTo || ''} onChange={(e) => setForm({ ...form, appliesTo: e.target.value })} /></label>
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

function ItemFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial || { dataType: '合格判定' });
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{form.id ? '編輯檢驗項目' : '新增檢驗項目'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>檢驗項目<input required value={form.itemName || ''} onChange={(e) => setForm({ ...form, itemName: e.target.value })} /></label>
            <label>
              資料型態
              <select value={form.dataType} onChange={(e) => setForm({ ...form, dataType: e.target.value })}>
                {DATA_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              標準值/規格
              <input value={form.spec || ''} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder="例如 >=90、5~10、合格" />
            </label>
          </div>
          <div className="row-actions">
            <button type="submit" className="primary">{form.id ? '儲存' : '新增'}</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
