import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';

const STATUSES = ['媒合中', '已媒合', '取消'];

export default function MatchesPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'matching', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_matches');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: positions } = useCollection('tsaipei_positions');
  const [editing, setEditing] = useState(null);

  const studentName = (id) => students.find((s) => s.id === id)?.chineseName || '(未設定)';
  const positionLabel = (id) => {
    const p = positions.find((x) => x.id === id);
    return p ? `${p.projectCode} ${p.company}` : '(未設定)';
  };

  // 媒合紀錄狀態改成「已媒合」時：媒合日期若空則帶入今天，並自動建立一筆
  // 二面進度（待安排），如同原本 Apps Script 版的自動連動邏輯。
  async function handleSave(data) {
    const wasMatched = editing?.status === '已媒合';
    const payload = { ...data };
    if (payload.status === '已媒合' && !payload.matchDate) {
      payload.matchDate = new Date().toISOString().slice(0, 10);
    }
    let matchId = data.id;
    if (matchId) {
      const { id, ...rest } = payload;
      await update(id, rest);
    } else {
      const ref = await add(payload);
      matchId = ref.id;
    }
    if (payload.status === '已媒合' && !wasMatched) {
      await addDoc(collection(db, 'tsaipei_secondInterviews'), { matchId, status: '待安排' });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>媒合紀錄</h2>
        {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增媒合</button>}
      </div>
      <div className="card">
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead>
              <tr><th>學生</th><th>職缺</th><th>實習場域</th><th>狀態</th><th>媒合日期</th>{canEditPage && <th></th>}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{studentName(r.studentId)}</td>
                  <td>{positionLabel(r.positionId)}</td>
                  <td>{r.venue || '—'}</td>
                  <td>{r.status || '—'}</td>
                  <td>{r.matchDate || '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {editing && (
        <MatchFormModal initial={editing} students={students} positions={positions} onCancel={() => setEditing(null)} onSave={handleSave} />
      )}
    </div>
  );
}

function MatchFormModal({ initial, students, positions, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯媒合紀錄' : '新增媒合紀錄'}</h3>
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
              職缺
              <select required value={form.positionId || ''} onChange={(e) => setForm({ ...form, positionId: e.target.value })}>
                <option value="" disabled>請選擇</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.projectCode} {p.company}</option>)}
              </select>
            </label>
            <label>
              實習場域
              <input value={form.venue || ''} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
            </label>
            <label>
              狀態
              <select value={form.status || '媒合中'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>
              媒合日期
              <input type="date" value={form.matchDate || ''} onChange={(e) => setForm({ ...form, matchDate: e.target.value })} />
            </label>
            <label>
              備註
              <input value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
