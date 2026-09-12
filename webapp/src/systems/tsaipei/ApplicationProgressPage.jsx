import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

async function existsForStudent(collectionName, studentId) {
  const snap = await getDocs(query(collection(db, collectionName), where('studentId', '==', studentId)));
  return !snap.empty;
}

export const STAGES = [
  '學生錄取', 'MOU簽署-學校端用印', 'MOU簽署-企業端用印', '收集學生資料', '收集企業資料',
  '撰寫計劃書', '企業用印', '經濟部/交通部審核', '發函後寄國外', '辦理簽證',
  '住宿安排', '預約體檢公司', '入台',
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' }, { key: 'currentStage', label: '目前進度' }];

export default function ApplicationProgressPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'applicationProgress', role, overrides);
  const { rows, loading, update } = useCollection('tsaipei_applicationProgress');
  const { rows: students } = useCollection('tsaipei_students');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_applicationProgress', CSV_FIELDS, { entityLabel: '申辦進度追蹤', requiredKeys: ['studentId'], canEdit: canEditPage });
  const [q, setQ] = useState('');

  const studentName = (id) => students.find((s) => s.id === id)?.chineseName || '(未知)';
  const query = q.trim().toLowerCase();
  const filteredRows = rows.filter((r) => !query || studentName(r.studentId).toLowerCase().includes(query));

  // 進度到達「入台」時自動建立在台簽證追蹤、在台關懷紀錄空白紀錄，跟原本
  // Apps Script 版的 ensureInTaiwanVisaForStudent 一致 —— 住宿安排的自動建立
  // 只發生在「新增/更新在台簽證追蹤」那一步（見 InTaiwanVisaPage.jsx 的
  // afterVisaSave），這裡不重複建立。
  async function handleStageChange(row, stage) {
    await update(row.id, { currentStage: stage });
    if (stage !== '入台') return;
    const studentId = row.studentId;
    if (!(await existsForStudent('tsaipei_inTaiwanVisa', studentId))) {
      await addDoc(collection(db, 'tsaipei_inTaiwanVisa'), { studentId });
    }
    if (!(await existsForStudent('tsaipei_inTaiwanCare', studentId))) {
      await addDoc(collection(db, 'tsaipei_inTaiwanCare'), { studentId, status: '良好' });
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>申辦進度追蹤</h2>
        <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
      </div>
      <div className="card">
        <input placeholder="搜尋學生" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>學生</th><th>目前進度</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filteredRows.map((r) => {
                const idx = STAGES.indexOf(r.currentStage);
                return (
                  <tr key={r.id}>
                    <td>{studentName(r.studentId)}</td>
                    <td>
                      {canEditPage ? (
                        <select value={r.currentStage || STAGES[0]} onChange={(e) => handleStageChange(r, e.target.value)}>
                          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (r.currentStage || '—')}
                      <span className="muted" style={{ marginLeft: 8 }}>{idx >= 0 ? `${idx + 1}/${STAGES.length}` : ''}</span>
                    </td>
                    {canEditPage && <td></td>}
                  </tr>
                );
              })}
              {filteredRows.length === 0 && <tr><td colSpan={3} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
