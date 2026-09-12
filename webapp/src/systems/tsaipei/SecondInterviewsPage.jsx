import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import Tag from '../../components/Tag';
import { SECOND_INTERVIEW_TAG } from '../../lib/tags';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const STATUSES = ['待安排', '已安排', '通過', '未通過'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'matchId', label: '媒合ID' }, { key: 'date', label: '二面日期' },
  { key: 'method', label: '面試方式' }, { key: 'status', label: '進度狀態' }, { key: 'notes', label: '備註' },
];

export default function SecondInterviewsPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'matching', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_secondInterviews');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: positions } = useCollection('tsaipei_positions');
  const [editing, setEditing] = useState(null);
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_secondInterviews', CSV_FIELDS, { entityLabel: '二面進度', requiredKeys: ['matchId'], canEdit: canEditPage });

  function matchLabel(matchId) {
    const m = matches.find((x) => x.id === matchId);
    if (!m) return '(未設定)';
    const s = students.find((x) => x.id === m.studentId)?.chineseName || '?';
    const p = positions.find((x) => x.id === m.positionId);
    return `${s} · ${p ? `${p.projectCode} ${p.company}` : '?'}`;
  }

  // 二面進度狀態變成「通過」時自動建立錄取名單（通過二面）。
  async function handleSave(data) {
    const wasPassed = editing?.status === '通過';
    let id = data.id;
    if (id) {
      const { id: _id, ...rest } = data;
      await update(id, rest);
    } else {
      const ref = await add(data);
      id = ref.id;
    }
    if (data.status === '通過' && !wasPassed) {
      await addDoc(collection(db, 'tsaipei_admittedList'), { matchId: data.matchId, status: '通過二面' });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>二面進度</h2>
        <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
      </div>
      <div className="card">
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead><tr><th>媒合</th><th>二面日期</th><th>面試方式</th><th>進度狀態</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{matchLabel(r.matchId)}</td>
                  <td>{r.date || '—'}</td>
                  <td>{r.method || '—'}</td>
                  <td><Tag value={r.status} map={SECOND_INTERVIEW_TAG} /></td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {editing && <SecondInterviewFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function SecondInterviewFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>編輯二面進度</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              二面日期
              <input type="date" value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>
              面試方式
              <input value={form.method || ''} onChange={(e) => setForm({ ...form, method: e.target.value })} />
            </label>
            <label>
              進度狀態
              <select value={form.status || '待安排'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
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
