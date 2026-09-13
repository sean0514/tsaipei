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

// Ported from studentProjectCompanyKey/matchPositionLabel in apps-script/Index.html.
function studentCompanyLabel(studentId, { matches, admittedList, positions }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  if (!m) return '未指定客戶';
  const p = positions.find((pp) => pp.id === m.positionId);
  if (!p) return '未指定客戶';
  return [p.projectCode, p.company, m.venue].filter(Boolean).join(' ') || '未指定客戶';
}

function VisaTable({ rows, canEditPage, studentName, onEdit, onRemove, onToggleDeparture }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>學生</th>{FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}<th>確認離台</th>{canEditPage && <th></th>}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{studentName(r.studentId)}</td>
              {FIELDS.map((f) => <td key={f.key}>{r[f.key] || '—'}</td>)}
              <td>
                {canEditPage ? (
                  <input type="checkbox" checked={!!r.confirmedDeparture} onChange={(e) => onToggleDeparture(r.id, e.target.checked)} />
                ) : (r.confirmedDeparture ? '是' : '否')}
              </td>
              {canEditPage && (
                <td className="row-actions">
                  <button onClick={() => onEdit(r)}>編輯</button>
                  <button className="danger" onClick={() => onRemove(r.id)}>刪除</button>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={FIELDS.length + (canEditPage ? 3 : 2)} className="muted">沒有資料</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function InTaiwanVisaPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'inTaiwanTracking', role, overrides);
  const { rows, loading, update, remove } = useCollection('tsaipei_inTaiwanVisa');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const [editing, setEditing] = useState(null);
  const [showDeparted, setShowDeparted] = useState(false);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_inTaiwanVisa', CSV_FIELDS, { entityLabel: '在台簽證追蹤', requiredKeys: ['studentId'], canEdit: canEditPage });

  const ctx = { matches, admittedList, positions };
  const studentName = (id) => { const s = students.find((x) => x.id === id); return s?.chineseName || s?.originalName || '(未知)'; };
  const searchQuery = q.trim().toLowerCase();
  const visible = rows.filter((r) => (showDeparted || r.confirmedDeparture !== true) && (!searchQuery || `${studentName(r.studentId)} ${studentCompanyLabel(r.studentId, ctx)}`.toLowerCase().includes(searchQuery)));

  // 已離台：第二次離台時間已到期（今天或之前）就自動歸類，不用手動維護；
  // 在台中：其餘的，依客戶分類顯示。
  const today = new Date().toISOString().slice(0, 10);
  const departed = visible.filter((r) => r.secondExitDate && r.secondExitDate <= today);
  const inTaiwan = visible.filter((r) => !(r.secondExitDate && r.secondExitDate <= today));

  const byCompany = {};
  inTaiwan.forEach((r) => {
    const company = studentCompanyLabel(r.studentId, ctx);
    (byCompany[company] ||= []).push(r);
  });
  const companies = Object.keys(byCompany).sort((a, b) => a.localeCompare(b));

  async function handleSave(data) {
    const { id, ...rest } = data;
    await update(id, rest);
    await afterVisaSave(rest.studentId, rest);
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>在台簽證追蹤</h2>
          <div className="page-desc">依在台中／已離台分類，在台中的學生再依客戶分組；「已離台」在第二次離台時間到期後自動列入{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          <label className="muted"><input type="checkbox" checked={showDeparted} onChange={(e) => setShowDeparted(e.target.checked)} /> 顯示已確認離台</label>
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「學生ID」欄位）；上傳後會完全取代目前所有在台簽證追蹤資料，請先下載備份再匯入。</p>}
      <input placeholder="搜尋學生或客戶" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>在台中 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {inTaiwan.length} 位學生</span></h3>
            {companies.length === 0 ? <p className="muted">目前沒有在台中的學生。</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {companies.map((company) => (
                  <div className="card" key={company}>
                    <h4 style={{ marginTop: 0 }}>{company} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{byCompany[company].length} 位學生</span></h4>
                    <VisaTable
                      rows={byCompany[company]}
                      canEditPage={canEditPage}
                      studentName={studentName}
                      onEdit={setEditing}
                      onRemove={remove}
                      onToggleDeparture={(id, checked) => update(id, { confirmedDeparture: checked })}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>已離台 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {departed.length} 位學生</span></h3>
            <div className="card">
              <VisaTable
                rows={departed}
                canEditPage={canEditPage}
                studentName={studentName}
                onEdit={setEditing}
                onRemove={remove}
                onToggleDeparture={(id, checked) => update(id, { confirmedDeparture: checked })}
              />
            </div>
          </div>
        </div>
      )}
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
