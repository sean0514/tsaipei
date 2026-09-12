import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import SegmentedControl from '../../components/SegmentedControl';

export const DOC_TYPES = ['語言能力證明', '在學證明', '延畢證明', '夜間實習同意書', '護照影本', '保險證明', '其他'];
const STATUSES = ['未提供', '已收到', '審核中', '已核准', '需補件', '不適用'];
const EXTENSION_OPTIONS = ['', '有延畢', '無延畢'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' }, { key: 'docType', label: '文件類型' },
  { key: 'status', label: '狀態' }, { key: 'extensionApplicable', label: '是否延畢' },
  { key: 'langProofType', label: '語言能力證明類別' }, { key: 'langProofLevel', label: '語言能力證明等級' },
  { key: 'receivedDate', label: '收件日期' }, { key: 'notes', label: '備註' },
];

const DOC_TYPE_TO_STUDENT_FIELD = { '在學證明': 'enrollProofStatus', '護照影本': 'passportCopy', '夜間實習同意書': 'nightInternshipDoc' };
const STUDENT_FIELDS_WITH_NA = { nightInternshipDoc: true };

// Ported from syncStudentDocField_ in apps-script/Code.gs: certain document
// types write a derived status back onto the student record.
async function syncStudentDocField(studentId, docType, status, extensionApplicable, langProofType, langProofLevel) {
  if (!studentId) return;
  const ref = doc(db, 'tsaipei_students', studentId);
  try {
    if (docType === '延畢證明') {
      const patch = {};
      if (extensionApplicable === '無延畢') { patch.extensionNeeded = '無'; patch.extensionProof = '未收到'; }
      else if (extensionApplicable === '有延畢') {
        patch.extensionNeeded = '有';
        if (status && status !== '未提供' && status !== '不適用') patch.extensionProof = '已收到';
      } else if (status === '不適用') { patch.extensionNeeded = '無'; patch.extensionProof = '未收到'; }
      else if (status && status !== '未提供') { patch.extensionNeeded = '有'; patch.extensionProof = '已收到'; }
      else patch.extensionProof = '未收到';
      await updateDoc(ref, patch);
      return;
    }
    if (docType === '語言能力證明') {
      const patch = {};
      if (langProofType) patch.langProofType = langProofType;
      if (langProofLevel) patch.langProofLevel = langProofLevel;
      patch.langProofStatus = (status && status !== '未提供' && status !== '不適用') ? '已收到' : '未收到';
      await updateDoc(ref, patch);
      return;
    }
    const field = DOC_TYPE_TO_STUDENT_FIELD[docType];
    if (!field) return;
    let value;
    if (status === '不適用' && STUDENT_FIELDS_WITH_NA[field]) value = '不適用';
    else if (status && status !== '未提供' && status !== '不適用') value = '已收到';
    else value = '未收到';
    await updateDoc(ref, { [field]: value });
  } catch {
    // 找不到對應學生（可能已被刪除），略過同步
  }
}

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// Ported from studentPositionLabel in apps-script/Index.html.
function studentPositionLabel(studentId, { matches, admittedList, positions }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  if (!m) return '—';
  const p = positions.find((pp) => pp.id === m.positionId);
  if (!p) return m.positionId ? '(職缺已刪除)' : '尚未指定職缺';
  return [p.projectCode, p.company, m.venue].filter(Boolean).join(' ');
}

// Ported from submittedText/overallStatusTag/completionDate in apps-script/Index.html.
function submittedText(docs) {
  const names = docs.filter((d) => d.status !== '未提供').map((d) => d.docType);
  return names.length ? names.join('、') : '（尚未繳交）';
}
function overallStatusTag(docs) {
  const total = docs.length;
  const collected = docs.filter((d) => d.status !== '未提供').length;
  if (collected === 0) return <span className="tag tag-grey">尚未開始</span>;
  if (collected < total) return <span className="tag tag-amber">收集中 {collected}/{total}</span>;
  return <span className="tag tag-blue">已收齊，待確認完成</span>;
}
function completionDate(docs) {
  const dates = docs.map((d) => d.receivedDate).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : '—';
}

export default function InternshipDocsPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'internshipDocs', role, overrides);
  const { rows, loading, update, remove } = useCollection('tsaipei_internshipDocs');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const [q, setQ] = useState('');
  const [managing, setManaging] = useState(null); // studentId being managed, or null

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);
  const searchQuery = q.trim().toLowerCase();
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_internshipDocs', CSV_FIELDS, { entityLabel: '實習文件追蹤', requiredKeys: ['studentId', 'docType'], canEdit: canEditPage });

  const byStudent = {};
  rows.forEach((r) => { (byStudent[r.studentId] ||= []).push(r); });

  // 依學生建檔時間排序，新進學生排在最上面；沒有 createdAt 的既有學生依姓名排序。
  let studentIds = Object.keys(byStudent).sort((a, b) => {
    const at = studentById(a)?.createdAt?.toMillis?.() ?? 0;
    const bt = studentById(b)?.createdAt?.toMillis?.() ?? 0;
    if (at !== bt) return bt - at;
    return studentFullLabel(studentById(a)).localeCompare(studentFullLabel(studentById(b)));
  });
  if (searchQuery) {
    studentIds = studentIds.filter((sid) => `${studentFullLabel(studentById(sid))} ${studentPositionLabel(sid, ctx)}`.toLowerCase().includes(searchQuery));
  }

  // 依狀態分類：全部文件都「已核准」才算已完成，其餘（含尚未開始/部分收齊/不適用）都算處理中，
  // 跟原本 renderInternshipDocs 的 allApproved 判斷一致。
  const inProgress = [];
  const completed = [];
  studentIds.forEach((sid) => {
    const docs = byStudent[sid];
    const allApproved = docs.length > 0 && docs.every((d) => d.status === '已核准');
    (allApproved ? completed : inProgress).push(sid);
  });

  async function handleUpdate(d, patch) {
    await update(d.id, patch);
    const merged = { ...d, ...patch };
    await syncStudentDocField(merged.studentId, merged.docType, merged.status, merged.extensionApplicable, merged.langProofType, merged.langProofLevel);
  }

  // Ported from confirmAllDocsForStudent in apps-script/Code.gs.
  async function confirmAll(studentId, docs) {
    const today = new Date().toISOString().slice(0, 10);
    await Promise.all(docs.map((d) => handleUpdate(d, { status: '已核准', receivedDate: d.receivedDate || today })));
  }

  function StudentRow({ sid, showCompletionDate }) {
    const docs = byStudent[sid];
    return (
      <tr>
        <td>
          <div style={{ fontWeight: 600 }}>{studentFullLabel(studentById(sid))}</div>
          <div className="muted" style={{ fontSize: 12 }}>{studentPositionLabel(sid, ctx)}</div>
        </td>
        <td>{submittedText(docs)}</td>
        {showCompletionDate && <td>{completionDate(docs)}</td>}
        <td>{showCompletionDate ? <span className="tag tag-green">已完成</span> : overallStatusTag(docs)}</td>
        {canEditPage && (
          <td className="row-actions">
            <button onClick={() => setManaging(sid)}>管理</button>
            <button className="danger" onClick={() => Promise.all(docs.map((d) => remove(d.id)))}>刪除</button>
          </td>
        )}
      </tr>
    );
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>實習文件追蹤</h2>
        <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
      </div>
      <input placeholder="搜尋學生或客戶/職務" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>處理中 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {inProgress.length} 位學生</span></h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>學生</th><th>已繳交文件</th><th>狀態</th>{canEditPage && <th></th>}</tr></thead>
                <tbody>
                  {inProgress.map((sid) => <StudentRow key={sid} sid={sid} />)}
                  {inProgress.length === 0 && <tr><td colSpan={canEditPage ? 4 : 3} className="muted">目前沒有處理中的學生。</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>已完成 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {completed.length} 位學生</span></h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>學生</th><th>已繳交文件</th><th>完成日期</th><th>狀態</th>{canEditPage && <th></th>}</tr></thead>
                <tbody>
                  {completed.map((sid) => <StudentRow key={sid} sid={sid} showCompletionDate />)}
                  {completed.length === 0 && <tr><td colSpan={canEditPage ? 5 : 4} className="muted">目前沒有已完成的學生。</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {managing && (
        <DocsManageModal
          studentId={managing}
          docs={byStudent[managing] || []}
          studentLabel={studentFullLabel(studentById(managing))}
          canEditPage={canEditPage}
          onUpdate={handleUpdate}
          onConfirmAll={confirmAll}
          onRemove={remove}
          onClose={() => setManaging(null)}
        />
      )}
    </div>
  );
}

function DocsManageModal({ studentId, docs, studentLabel, canEditPage, onUpdate, onConfirmAll, onRemove, onClose }) {
  const allDone = docs.every((d) => d.status === '已核准' || d.status === '不適用');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 640 }}>
        <div className="row-actions" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{studentLabel} {allDone && <span className="muted">（已完成繳交）</span>}</h3>
          {canEditPage && !allDone && <button className="primary" onClick={() => onConfirmAll(studentId, docs)}>全部核准</button>}
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>文件類型</th><th>狀態</th><th>額外資訊</th><th>收件日期</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>{d.docType}</td>
                  <td>
                    {canEditPage ? (
                      <SegmentedControl
                        name={`doc-status-${d.id}`}
                        options={STATUSES}
                        value={d.status || '未提供'}
                        onChange={(v) => onUpdate(d, { status: v })}
                        compact
                      />
                    ) : <span className="tag">{d.status}</span>}
                  </td>
                  <td>
                    {d.docType === '延畢證明' && (
                      canEditPage ? (
                        <select value={d.extensionApplicable || ''} onChange={(e) => onUpdate(d, { extensionApplicable: e.target.value })}>
                          {EXTENSION_OPTIONS.map((o) => <option key={o} value={o}>{o || '未設定'}</option>)}
                        </select>
                      ) : (d.extensionApplicable || '—')
                    )}
                    {d.docType === '語言能力證明' && (
                      canEditPage ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <select value={d.langProofType || ''} onChange={(e) => onUpdate(d, { langProofType: e.target.value })}>
                            {['', '華語', '多益', '雅思'].map((o) => <option key={o} value={o}>{o || '未提供'}</option>)}
                          </select>
                          <select value={d.langProofLevel || ''} onChange={(e) => onUpdate(d, { langProofLevel: e.target.value })}>
                            {['', 'A1', 'A2', 'B1'].map((o) => <option key={o} value={o}>{o || '未提供'}</option>)}
                          </select>
                        </div>
                      ) : ([d.langProofType, d.langProofLevel].filter(Boolean).join(' / ') || '—')
                    )}
                    {!['延畢證明', '語言能力證明'].includes(d.docType) && '—'}
                  </td>
                  <td>
                    {canEditPage ? (
                      <input type="date" value={d.receivedDate || ''} onChange={(e) => onUpdate(d, { receivedDate: e.target.value })} />
                    ) : (d.receivedDate || '—')}
                  </td>
                  {canEditPage && <td><button className="danger" onClick={() => onRemove(d.id)}>刪除</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button onClick={onClose}>關閉</button>
        </div>
      </div>
    </div>
  );
}
