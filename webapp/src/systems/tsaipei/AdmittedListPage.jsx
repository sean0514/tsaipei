import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { DOC_TYPES } from './InternshipDocsPage';
import Tag from '../../components/Tag';
import { ADMITTED_TAG } from '../../lib/tags';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const STATUSES = ['通過二面', '確認錄取'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'matchId', label: '媒合ID' }, { key: 'admitDate', label: '錄取日期' },
  { key: 'status', label: '狀態' }, { key: 'notes', label: '備註' },
];

export default function AdmittedListPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'matching', role, overrides);
  const { rows, loading, update, remove } = useCollection('tsaipei_admittedList');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: positions } = useCollection('tsaipei_positions');
  const [editing, setEditing] = useState(null);
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_admittedList', CSV_FIELDS, { entityLabel: '錄取名單', requiredKeys: ['matchId'], canEdit: canEditPage });

  function matchLabel(matchId) {
    const m = matches.find((x) => x.id === matchId);
    if (!m) return '(未設定)';
    const s = students.find((x) => x.id === m.studentId)?.chineseName || '?';
    const p = positions.find((x) => x.id === m.positionId);
    return `${s} · ${p ? `${p.projectCode} ${p.company}` : '?'}`;
  }

  // 狀態變成「確認錄取」時自動建立實習文件追蹤整組清單、申辦進度追蹤紀錄；
  // 從「確認錄取」改回「通過二面」時自動刪除該學生的實習文件追蹤整組紀錄
  // （不可逆，跟原本 Apps Script 版行為一致）。
  async function handleSave(data) {
    const prevStatus = editing?.status;
    const { id, ...rest } = data;
    await update(id, rest);

    const match = matches.find((m) => m.id === rest.matchId);
    const studentId = match?.studentId;

    if (studentId && rest.status === '確認錄取' && prevStatus !== '確認錄取') {
      await Promise.all(DOC_TYPES.map((docType) =>
        addDoc(collection(db, 'tsaipei_internshipDocs'), { studentId, docType, status: '未提供' })
      ));
      await addDoc(collection(db, 'tsaipei_applicationProgress'), { studentId, currentStage: '學生錄取' });
    } else if (studentId && prevStatus === '確認錄取' && rest.status === '通過二面') {
      const snap = await getDocs(query(collection(db, 'tsaipei_internshipDocs'), where('studentId', '==', studentId)));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>錄取名單</h2>
        <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
      </div>
      <div className="card">
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>媒合</th><th>錄取日期</th><th>狀態</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{matchLabel(r.matchId)}</td>
                  <td>{r.admitDate || '—'}</td>
                  <td><Tag value={r.status} map={ADMITTED_TAG} /></td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <AdmittedFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function AdmittedFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>編輯錄取名單</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              錄取日期
              <input type="date" value={form.admitDate || ''} onChange={(e) => setForm({ ...form, admitDate: e.target.value })} />
            </label>
            <label>
              狀態
              <select value={form.status || '通過二面'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
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
