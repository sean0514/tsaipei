import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';

// Core fields shown here; the full schema (apps-script/Code.gs SHEET_FIELDS.Students)
// has ~29 fields (language-proof docs, visa dates, etc.) — add them to FIELDS
// below following the same {key,label} pattern as more of this module is ported.
const FIELDS = [
  { key: 'chineseName', label: '中文姓名', required: true },
  { key: 'originalName', label: '原始姓名' },
  { key: 'school', label: '就讀學校' },
  { key: 'nationality', label: '國籍' },
  { key: 'gender', label: '性別' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: '電話' },
  { key: 'startDate', label: '實習開始日', type: 'date' },
  { key: 'endDate', label: '實習結束日', type: 'date' },
  { key: 'status', label: '狀態' },
  { key: 'notes', label: '備註' },
];

export default function StudentsPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'students', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_students', { order: ['chineseName', 'asc'] });
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {...} = editing
  const [q, setQ] = useState('');

  const filtered = rows.filter((r) => !q || [r.chineseName, r.originalName, r.school, r.nationality].some((v) => v?.includes(q)));

  // 新增學生存檔後自動在「媒合紀錄」建立一筆「媒合中」的空白紀錄（職缺待補），
  // 沿用原本 Apps Script 版的行為。
  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      const ref = await add(data);
      await addDoc(collection(db, 'tsaipei_matches'), { studentId: ref.id, positionId: '', status: '媒合中' });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>學生資料</h2>
        {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增學生</button>}
      </div>
      <div className="card">
        <input placeholder="搜尋姓名/學校/國籍" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead>
              <tr>
                {FIELDS.slice(0, 6).map((f) => <th key={f.key}>{f.label}</th>)}
                <th>狀態</th>
                {canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  {FIELDS.slice(0, 6).map((f) => <td key={f.key}>{r[f.key] || '—'}</td>)}
                  <td>{r.status || '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {editing && (
        <StudentFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />
      )}
    </div>
  );
}

function StudentFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯學生' : '新增學生'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  type={f.type || 'text'}
                  required={f.required}
                  value={form[f.key] || ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
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
