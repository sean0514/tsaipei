import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';

// apps-script/Code.gs SHEET_FIELDS.Positions — role-assignment fields
// (bizDev..dormManager2) omitted for now; add them the same way once the
// 內部獎金計算 module that reads them gets ported.
const FIELDS = [
  { key: 'projectCode', label: '專案編號', required: true },
  { key: 'company', label: '公司名稱', required: true },
  { key: 'industry', label: '產業別' },
  { key: 'title', label: '職務名稱' },
  { key: 'description', label: '職務內容' },
  { key: 'stipendAmount', label: '實習津貼金額', type: 'number' },
  { key: 'boardDeduction', label: '膳宿費扣款金額', type: 'number' },
  { key: 'specialNotes', label: '特殊備註' },
];

export default function PositionsPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'matching', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_positions', { order: ['projectCode', 'asc'] });
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');

  const open = rows.filter((r) => r.closed !== '是' && (!q || [r.projectCode, r.company, r.title].some((v) => v?.includes(q))));
  const closed = rows.filter((r) => r.closed === '是');

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ ...data, closed: '' });
    }
    setEditing(null);
  }

  function copyAsNew(row) {
    const { id, ...rest } = row;
    setEditing({ ...rest, id: undefined });
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>實習單位</h2>
        {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增職缺</button>}
      </div>
      <div className="card">
        <input placeholder="搜尋專案編號/公司/職務" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead>
              <tr>
                {FIELDS.slice(0, 4).map((f) => <th key={f.key}>{f.label}</th>)}
                {canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {open.map((r) => (
                <tr key={r.id}>
                  {FIELDS.slice(0, 4).map((f) => <td key={f.key}>{r[f.key] || '—'}</td>)}
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button onClick={() => copyAsNew(r)}>複製</button>
                      <button onClick={() => update(r.id, { closed: '是' })}>已結案</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {open.length === 0 && <tr><td colSpan={5} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {closed.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>已結案</h3>
          <table>
            <thead><tr>{FIELDS.slice(0, 4).map((f) => <th key={f.key}>{f.label}</th>)}{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {closed.map((r) => (
                <tr key={r.id}>
                  {FIELDS.slice(0, 4).map((f) => <td key={f.key}>{r[f.key] || '—'}</td>)}
                  {canEditPage && <td><button onClick={() => update(r.id, { closed: '' })}>取消已結案</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <PositionFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function PositionFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯職缺' : '新增職缺'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
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
