import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';

async function existsForStudent(collectionName, studentId) {
  const snap = await getDocs(query(collection(db, collectionName), where('studentId', '==', studentId)));
  return !snap.empty;
}

export const STAGES = [
  '學生錄取', 'MOU簽署-學校端用印', 'MOU簽署-企業端用印', '收集學生資料', '收集企業資料',
  '撰寫計劃書', '企業用印', '經濟部/交通部審核', '發函後寄國外', '辦理簽證',
  '住宿安排', '預約體檢公司', '入台',
];

export default function ApplicationProgressPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'applicationProgress', role, overrides);
  const { rows, loading, update } = useCollection('tsaipei_applicationProgress');
  const { rows: students } = useCollection('tsaipei_students');

  const studentName = (id) => students.find((s) => s.id === id)?.chineseName || '(未知)';

  // 進度到達「入台」時自動建立在台簽證追蹤空白紀錄，接著連鎖建立在台關懷紀錄、
  // 住宿安排空白紀錄（若尚未存在），跟原本 Apps Script 版一致。
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
    if (!(await existsForStudent('tsaipei_housingRecords', studentId))) {
      await addDoc(collection(db, 'tsaipei_housingRecords'), { studentId });
    }
  }

  return (
    <div className="content">
      <div className="page-header"><h2>申辦進度追蹤</h2></div>
      <div className="card">
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead><tr><th>學生</th><th>目前進度</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {rows.map((r) => {
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
              {rows.length === 0 && <tr><td colSpan={3} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
