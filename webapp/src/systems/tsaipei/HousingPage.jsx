import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';

const PAYERS = ['學生自付', '廠商代付'];

export default function HousingPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'housing', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_housingRecords');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: dormitories } = useCollection('tsaipei_dormitories');
  const [editing, setEditing] = useState(null);

  const studentName = (id) => students.find((s) => s.id === id)?.chineseName || '(未知)';
  const today = new Date().toISOString().slice(0, 10);

  function classify(r) {
    if (r.completed) return null;
    if (!r.checkIn) return '未安排';
    if (r.checkOut && r.checkOut < today) return '已離宿';
    return '住宿中';
  }

  const groups = { 未安排: [], 住宿中: [], 已離宿: [] };
  rows.forEach((r) => { const c = classify(r); if (c) groups[c].push(r); });

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
        <h2>住宿安排</h2>
        {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增住宿</button>}
      </div>
      {Object.entries(groups).map(([label, list]) => (
        <div className="card" key={label} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>{label}（{list.length}）</h3>
          <table>
            <thead><tr><th>學生</th><th>宿舍名稱</th><th>付款方式</th><th>入住日</th><th>退宿日</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>{studentName(r.studentId)}</td>
                  <td>{r.type || '—'}</td>
                  <td>{r.payer || '—'}</td>
                  <td>{r.checkIn || '—'}</td>
                  <td>{r.checkOut || '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      {label === '已離宿' && <button onClick={() => update(r.id, { completed: true })}>已完成</button>}
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        </div>
      ))}
      {editing && <HousingFormModal initial={editing} students={students} dormitories={dormitories} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function HousingFormModal({ initial, students, dormitories, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const dormNames = [...new Set(dormitories.map((d) => d.name).filter(Boolean))];
  if (form.type && !dormNames.includes(form.type)) dormNames.push(form.type);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯住宿' : '新增住宿'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              學生
              <select required value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                <option value="" disabled>請選擇</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.chineseName}</option>)}
              </select>
            </label>
            <label>
              宿舍名稱
              <select value={form.type || ''} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="">請選擇</option>
                {dormNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>
              付款方式
              <select value={form.payer || ''} onChange={(e) => setForm({ ...form, payer: e.target.value })}>
                <option value="">請選擇</option>
                {PAYERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label>
              入住日
              <input type="date" value={form.checkIn || ''} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} />
            </label>
            <label>
              退宿日
              <input type="date" value={form.checkOut || ''} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} />
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
