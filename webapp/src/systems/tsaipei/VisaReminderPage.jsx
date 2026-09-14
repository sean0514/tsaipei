import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { STAGES } from './ApplicationProgressPage';

async function existsForStudent(collectionName, studentId) {
  const snap = await getDocs(query(collection(db, collectionName), where('studentId', '==', studentId)));
  return !snap.empty;
}

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// Ported from studentCompanyName/matchPositionLabel in apps-script/Index.html.
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

// 學生「確認錄取」後（見 AdmittedListPage.jsx）會自動建立一筆申辦進度追蹤
// 紀錄，本頁就是把還沒走到最後一步「入台」（視為完成）的那些紀錄，依客戶
// 整理成提醒清單；一旦進度更新到「入台」就會自動從這裡消失。
export default function VisaReminderPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'applicationProgress', role, overrides);
  const { rows, loading, update } = useCollection('tsaipei_applicationProgress');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);
  const searchQuery = q.trim().toLowerCase();

  const pending = rows
    .filter((r) => r.currentStage !== '入台')
    .filter((r) => !searchQuery || `${studentFullLabel(studentById(r.studentId))} ${studentCompanyLabel(r.studentId, ctx)}`.toLowerCase().includes(searchQuery));

  const byCompany = {};
  pending.forEach((r) => {
    const company = studentCompanyLabel(r.studentId, ctx);
    (byCompany[company] ||= []).push(r);
  });
  const companies = Object.keys(byCompany).sort((a, b) => a.localeCompare(b)).map((company) => ({
    company,
    items: byCompany[company].slice().sort((a, b) =>
      studentFullLabel(studentById(a.studentId)).localeCompare(studentFullLabel(studentById(b.studentId)))
    ),
  }));

  // 進度到達「入台」時自動建立在台簽證追蹤、在台關懷紀錄空白紀錄，跟
  // ApplicationProgressPage.jsx 的 afterStageChange 一致。
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
    const { id, ...rest } = data;
    await update(id, rest);
    await afterStageChange(data.studentId, data.currentStage);
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>辦理簽證提醒</h2>
          <div className="page-desc">學生確認錄取後自動加入，依客戶分類；申辦進度追蹤走到「入台」（視為完成）前都會持續顯示在這裡{!canEditPage && '（唯讀）'}</div>
        </div>
      </div>
      <input placeholder="搜尋學生或客戶" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        companies.length === 0 ? <p className="muted">目前沒有待辦理簽證的學生。</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {companies.map(({ company, items }) => (
              <div className="card" key={company}>
                <h3 style={{ marginTop: 0 }}>{company} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{items.length} 位學生</span></h3>
                {items.map((r) => (
                  <div key={r.id} className="progress-row">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 600 }}>{studentFullLabel(studentById(r.studentId))}</div>
                      {canEditPage && (
                        <div className="row-actions">
                          <button onClick={() => setEditing(r)}>更新進度</button>
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
        )
      )}
      {editing && (
        <ReminderFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />
      )}
    </div>
  );
}

function ReminderFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>更新申辦進度</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
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
