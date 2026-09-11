import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';

const DATA_TYPES = ['合格判定', '數值', '文字'];

export default function QcTemplatesPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'qc', role, overrides);
  const { rows: templates, loading, add, update, remove } = useCollection('foodfactory_qcTemplates');
  const { rows: items, add: addItem, remove: removeItem } = useCollection('foodfactory_qcTemplateItems');
  const [editing, setEditing] = useState(null);
  const [itemFormFor, setItemFormFor] = useState(null);

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
        <h2>品質/食安 · 檢驗範本</h2>
        {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增範本</button>}
      </div>
      {loading ? <p className="muted">載入中…</p> : templates.map((t) => (
        <div className="card" key={t.id} style={{ marginBottom: 16 }}>
          <div className="page-header" style={{ marginBottom: 8 }}>
            <div><strong>{t.name}</strong><span className="muted" style={{ marginLeft: 8 }}>適用對象：{t.appliesTo || '—'}</span></div>
            {canEditPage && (
              <div className="row-actions">
                <button onClick={() => setEditing(t)}>編輯範本</button>
                <button className="danger" onClick={() => remove(t.id)}>刪除範本</button>
              </div>
            )}
          </div>
          <table>
            <thead><tr><th>檢驗項目</th><th>標準值/規格</th><th>資料型態</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {items.filter((it) => it.templateId === t.id).map((it) => (
                <tr key={it.id}>
                  <td>{it.itemName}</td><td>{it.spec || '—'}</td><td>{it.dataType}</td>
                  {canEditPage && <td><button className="danger" onClick={() => removeItem(it.id)}>刪除</button></td>}
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
          onCancel={() => setItemFormFor(null)}
          onSave={async (data) => { await addItem({ ...data, templateId: itemFormFor }); setItemFormFor(null); }}
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

function ItemFormModal({ onCancel, onSave }) {
  const [form, setForm] = useState({ dataType: '合格判定' });
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>新增檢驗項目</h3>
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
            <button type="submit" className="primary">新增</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
