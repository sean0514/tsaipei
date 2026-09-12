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

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' }, { key: 'currentStage', label: '目前進度' }, { key: 'notes', label: '備註' }];

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// Ported from studentCompanyName/matchPositionLabel in apps-script/Index.html —
// used both as the group header and each row's position sub-label.
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
  const parts = [p.projectCode, p.company, m.venue].filter(Boolean);
  return parts.join(' ') || '未指定客戶';
}

// Ported from progressPipelineHTML in apps-script/Index.html.
function ProgressPipeline({ stage }) {
  const idx = STAGES.indexOf(stage);
  return (
    <div className="pipeline">
      {STAGES.map((step, i) => (
        <span key={step} className={`pip-step${idx >= 0 && i <= idx ? ' done' : ''}`}>{step}</span>
      ))}
    </div>
  );
}

export default function ApplicationProgressPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'applicationProgress', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_applicationProgress');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_applicationProgress', CSV_FIELDS, { entityLabel: '申辦進度追蹤', requiredKeys: ['studentId'], canEdit: canEditPage });
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);
  const searchQuery = q.trim().toLowerCase();

  const filteredRows = rows.filter((r) => !searchQuery || `${studentFullLabel(studentById(r.studentId))} ${studentCompanyLabel(r.studentId, ctx)}`.toLowerCase().includes(searchQuery));
  // 先分成已入台／未入台兩大類，再各自依客戶/專案分組（跟原本一致）。
  const arrived = filteredRows.filter((r) => r.currentStage === '入台');
  const notArrived = filteredRows.filter((r) => r.currentStage !== '入台');

  function groupByCompany(items) {
    const byCompany = {};
    items.forEach((r) => {
      const company = studentCompanyLabel(r.studentId, ctx);
      (byCompany[company] ||= []).push(r);
    });
    return Object.keys(byCompany).sort((a, b) => a.localeCompare(b)).map((company) => ({
      company,
      items: byCompany[company].slice().sort((a, b) =>
        studentFullLabel(studentById(a.studentId)).localeCompare(studentFullLabel(studentById(b.studentId)))
      ),
    }));
  }

  // 進度到達「入台」時自動建立在台簽證追蹤、在台關懷紀錄空白紀錄，跟原本
  // Apps Script 版的 ensureInTaiwanVisaForStudent 一致 —— 住宿安排的自動建立
  // 只發生在「新增/更新在台簽證追蹤」那一步（見 InTaiwanVisaPage.jsx 的
  // afterVisaSave），這裡不重複建立。
  async function afterStageChange(studentId, stage) {
    if (stage !== '入台') return;
    if (!(await existsForStudent('tsaipei_inTaiwanVisa', studentId))) {
      await addDoc(collection(db, 'tsaipei_inTaiwanVisa'), { studentId });
    }
    if (!(await existsForStudent('tsaipei_inTaiwanCare', studentId))) {
      await addDoc(collection(db, 'tsaipei_inTaiwanCare'), { studentId, status: '良好' });
    }
  }

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add(data);
    }
    await afterStageChange(data.studentId, data.currentStage);
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>申辦進度追蹤</h2>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({ currentStage: STAGES[0] })}>新增進度紀錄</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      <input placeholder="搜尋學生或客戶" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        filteredRows.length === 0 ? <p className="muted">尚無進度紀錄。學生「確認錄取」後會自動建立，也可以點選「新增進度紀錄」手動加入。</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <ArrivalSection
              title="未入台"
              groups={groupByCompany(notArrived)}
              canEditPage={canEditPage}
              ctx={ctx}
              studentById={studentById}
              onEdit={setEditing}
              onRemove={remove}
            />
            <ArrivalSection
              title="已入台"
              groups={groupByCompany(arrived)}
              canEditPage={canEditPage}
              ctx={ctx}
              studentById={studentById}
              onEdit={setEditing}
              onRemove={remove}
            />
          </div>
        )
      )}
      {editing && (
        <ProgressFormModal
          initial={editing}
          students={students}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function ArrivalSection({ title, groups, canEditPage, ctx, studentById, onEdit, onRemove }) {
  const total = groups.reduce((sum, g) => sum + g.items.length, 0);
  return (
    <div>
      <h3 style={{ margin: '0 0 12px' }}>{title} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {total} 位學生</span></h3>
      {groups.length === 0 ? (
        <p className="muted">目前沒有符合的學生。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groups.map(({ company, items }) => (
            <div className="card" key={company}>
              <h4 style={{ marginTop: 0 }}>{company} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{items.length} 位學生</span></h4>
              {items.map((r) => (
                <div key={r.id} className="progress-row">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{studentFullLabel(studentById(r.studentId))}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{studentCompanyLabel(r.studentId, ctx)}</div>
                    </div>
                    {canEditPage && (
                      <div className="row-actions">
                        <button onClick={() => onEdit(r)}>編輯</button>
                        <button className="danger" onClick={() => onRemove(r.id)}>刪除</button>
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <ProgressPipeline stage={r.currentStage} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressFormModal({ initial, students, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯進度紀錄' : '新增進度紀錄'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <label>
            學生
            <select required disabled={!!initial.id} value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })} style={{ marginBottom: 16 }}>
              <option value="" disabled>請選擇學生</option>
              {students.map((s) => <option key={s.id} value={s.id}>{studentFullLabel(s)}</option>)}
            </select>
          </label>
          <label>
            目前進度
            <select value={form.currentStage || STAGES[0]} onChange={(e) => setForm({ ...form, currentStage: e.target.value })} style={{ marginBottom: 16 }}>
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>
            備註
            <textarea rows={3} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ marginBottom: 16 }} />
          </label>
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
