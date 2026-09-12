import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, getDocs, query, updateDoc, doc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

async function existsForStudent(collectionName, studentId) {
  const snap = await getDocs(query(collection(db, collectionName), where('studentId', '==', studentId)));
  return !snap.empty;
}

// Ported from addInTaiwanVisa/updateInTaiwanVisa/syncStudentDatesFromVisa_ in
// apps-script/Code.gs: every save also makes sure the student has an
// InTaiwanCare and HousingRecords row, and pushes the entry/exit dates back
// onto the student record (the Students list/dashboard read from there).
async function afterVisaSave(studentId, row) {
  if (!studentId) return;
  if (!(await existsForStudent('tsaipei_inTaiwanCare', studentId))) {
    await addDoc(collection(db, 'tsaipei_inTaiwanCare'), { studentId, status: '良好' });
  }
  if (!(await existsForStudent('tsaipei_housingRecords', studentId))) {
    await addDoc(collection(db, 'tsaipei_housingRecords'), { studentId });
  }
  await updateDoc(doc(db, 'tsaipei_students', studentId), {
    firstEntryDate: row.firstEntryDate || '',
    firstExitDate: row.firstExitDate || '',
    secondEntryDate: row.secondEntryDate || '',
    secondExitDate: row.secondExitDate || '',
  });
}

const FIELDS = [
  { key: 'firstEntryDate', label: '第一次入台時間', type: 'date' },
  { key: 'firstExitDate', label: '第一次離台時間', type: 'date' },
  { key: 'visaRenewalDate', label: '在台期間換發簽證時間', type: 'date' },
  { key: 'secondEntryDate', label: '第二次入台時間', type: 'date' },
  { key: 'secondExitDate', label: '第二次離台時間', type: 'date' },
  { key: 'visaRenewalDate2', label: '在台期間換發簽證時間2', type: 'date' },
];
const CSV_FIELDS = [{ key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' }, ...FIELDS, { key: 'confirmedDeparture', label: '確認離台' }];

export default function InTaiwanVisaPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'inTaiwanTracking', role, overrides);
  const { rows, loading, update, remove } = useCollection('tsaipei_inTaiwanVisa');
  const { rows: students } = useCollection('tsaipei_students');
  const [editing, setEditing] = useState(null);
  const [showDeparted, setShowDeparted] = useState(false);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_inTaiwanVisa', CSV_FIELDS, { entityLabel: '在台簽證追蹤', requiredKeys: ['studentId'], canEdit: canEditPage });

  const studentName = (id) => students.find((s) => s.id === id)?.chineseName || '(未知)';
  const query = q.trim().toLowerCase();
  const visible = rows.filter((r) => (showDeparted || r.confirmedDeparture !== true) && (!query || studentName(r.studentId).toLowerCase().includes(query)));

  async function handleSave(data) {
    const { id, ...rest } = data;
    await update(id, rest);
    await afterVisaSave(rest.studentId, rest);
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>在台簽證追蹤</h2>
        <div className="row-actions">
          <label className="muted"><input type="checkbox" checked={showDeparted} onChange={(e) => setShowDeparted(e.target.checked)} /> 顯示已確認離台</label>
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      <div className="card">
        <input placeholder="搜尋學生" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>學生</th>{FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}<th>確認離台</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td>{studentName(r.studentId)}</td>
                  {FIELDS.map((f) => <td key={f.key}>{r[f.key] || '—'}</td>)}
                  <td>
                    {canEditPage ? (
                      <input type="checkbox" checked={!!r.confirmedDeparture} onChange={(e) => update(r.id, { confirmedDeparture: e.target.checked })} />
                    ) : (r.confirmedDeparture ? '是' : '否')}
                  </td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={FIELDS.length + 3} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <VisaFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function VisaFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>編輯在台簽證追蹤</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input type={f.type} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
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
