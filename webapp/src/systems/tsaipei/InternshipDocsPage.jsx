import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import SegmentedControl from '../../components/SegmentedControl';
import {
  AGENCY_OPTIONS, certificateLangFor, guessApprovalAgency, totalInternshipDays,
  TEMPLATE_FILE_BY_LANG, LANG_LABEL, downloadInternshipCertificate,
} from '../../lib/internshipCertificate';
import {
  VISIT_METHODS, WORK_ITEMS, WORK_RATING_OPTIONS, LIFE_ITEMS, LIFE_RATING_OPTIONS,
  RESULT_OPTIONS, blankRatings, blankNotes, downloadMonthlyVisitRecord,
} from '../../lib/monthlyVisitRecord';

export const DOC_TYPES = ['語言能力證明', '在學證明', '延畢證明', '夜間實習同意書', '實習契約', '實習證明書', '護照影本', '其他'];
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

// 實習證明書要用到的「公司名稱/函文編號/產業別」來自這個學生實際媒合到的
// 實習單位，跟 studentPositionLabel 同一套比對邏輯，只是回傳完整物件。
function studentPosition(studentId, { matches, admittedList, positions }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  if (!m) return null;
  return positions.find((pp) => pp.id === m.positionId) || null;
}

// 每月訪視紀錄表要用到的「實習分店」，match 上才有(positions 只有公司層級)，
// 跟 studentPosition 同一套比對邏輯，回傳對應的 match。
function studentMatch(studentId, { matches, admittedList }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  return m || null;
}

// 跟 DashboardPage 同一套「有第二次入台/離台就用第二次，否則用第一次」
// 判斷，實習證明書預設帶入這個區間。
function effectiveEntryDate(s) {
  return s?.secondEntryDate || s?.firstEntryDate || '';
}
function effectiveExitDate(s) {
  return s?.secondExitDate || s?.firstExitDate || '';
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
  const { rows, loading, add, update, remove } = useCollection('tsaipei_internshipDocs');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { rows: applicationProgress } = useCollection('tsaipei_applicationProgress');
  const { rows: visitRecords, add: addVisit, update: updateVisit, remove: removeVisit } = useCollection('tsaipei_monthlyVisitRecords');
  const [q, setQ] = useState('');
  const [managing, setManaging] = useState(null); // studentId being managed, or null
  const [generatingCert, setGeneratingCert] = useState(null); // studentId generating a certificate for, or null
  const [visiting, setVisiting] = useState(null); // studentId managing monthly visit records for, or null
  const [backfilling, setBackfilling] = useState(false);

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

  // 處理中的學生依客戶分類顯示（依使用者要求）。
  const inProgressByCompany = {};
  inProgress.forEach((sid) => {
    const company = studentPositionLabel(sid, ctx);
    (inProgressByCompany[company] ||= []).push(sid);
  });
  const inProgressCompanies = Object.keys(inProgressByCompany).sort((a, b) => a.localeCompare(b));

  // 補齊：DOC_TYPES 新增文件類型（例如「實習契約」）時，只有之後新確認錄取
  // 的學生會自動帶出這筆待收項目（見 AdmittedListPage.jsx 的 existingDocs.empty
  // 判斷），既有已經在追蹤中的學生不會回溯新增，所以才會「看不到」。這裡
  // 讓管理者手動幫目前名單裡還沒有這筆文件的學生補上一筆「未提供」。
  async function handleBackfillDocType(docType) {
    const missing = studentIds.filter((sid) => !byStudent[sid].some((d) => d.docType === docType));
    if (!missing.length) { alert(`目前名單裡的學生都已經有「${docType}」這筆文件了。`); return; }
    if (!window.confirm(`確定要幫 ${missing.length} 位學生補上「${docType}」這筆待收文件嗎？`)) return;
    setBackfilling(true);
    try {
      await Promise.all(missing.map((sid) => add({ studentId: sid, docType, status: '未提供' })));
      alert(`已幫 ${missing.length} 位學生補上「${docType}」。`);
    } catch (err) {
      alert(`補齊失敗：${err.message || err}`);
    } finally {
      setBackfilling(false);
    }
  }

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
          <td>
            <div className="row-actions">
              <button onClick={() => setManaging(sid)}>管理</button>
              <button onClick={() => setVisiting(sid)}>每月訪視紀錄</button>
              <button className="danger" onClick={() => Promise.all(docs.map((d) => remove(d.id)))}>刪除</button>
            </div>
          </td>
        )}
      </tr>
    );
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>實習文件追蹤</h2>
          <div className="page-desc">追蹤每位學生的實習相關文件收件狀況（學生確認錄取後會自動加入此清單）；每位學生另有「每月訪視紀錄」可按月填寫訪視內容並下載紀錄表{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button onClick={() => handleBackfillDocType('實習契約')} disabled={backfilling}>{backfilling ? '補齊中…' : '幫既有學生補上「實習契約」'}</button>}
          {canEditPage && <button onClick={() => handleBackfillDocType('實習證明書')} disabled={backfilling}>{backfilling ? '補齊中…' : '幫既有學生補上「實習證明書」'}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「學生ID」欄位）；上傳後會完全取代目前所有文件追蹤資料，請先下載備份再匯入。</p>}
      <input placeholder="搜尋學生或客戶/職務" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>處理中 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {inProgress.length} 位學生</span></h3>
            {inProgress.length === 0 ? (
              <p className="muted">目前沒有處理中的學生。</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {inProgressCompanies.map((company) => (
                  <div className="card" key={company}>
                    <h4 style={{ marginTop: 0 }}>{company} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{inProgressByCompany[company].length} 位學生</span></h4>
                    <div className="table-wrap sticky-header">
                      <table>
                        <thead><tr><th>學生</th><th>已繳交文件</th><th>狀態</th>{canEditPage && <th></th>}</tr></thead>
                        <tbody>
                          {inProgressByCompany[company].map((sid) => <StudentRow key={sid} sid={sid} />)}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>已完成 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {completed.length} 位學生</span></h3>
            <div className="table-wrap sticky-header">
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
          onGenerateCertificate={(sid) => setGeneratingCert(sid)}
        />
      )}
      {generatingCert && (
        <CertificateGeneratorModal
          student={studentById(generatingCert)}
          studentLabel={studentFullLabel(studentById(generatingCert))}
          position={studentPosition(generatingCert, ctx)}
          progress={applicationProgress.find((r) => r.studentId === generatingCert) || null}
          onClose={() => setGeneratingCert(null)}
        />
      )}
      {visiting && (
        <MonthlyVisitModal
          student={studentById(visiting)}
          studentLabel={studentFullLabel(studentById(visiting))}
          position={studentPosition(visiting, ctx)}
          match={studentMatch(visiting, ctx)}
          records={visitRecords.filter((r) => r.studentId === visiting)}
          onAdd={(data) => addVisit({ studentId: visiting, ...data })}
          onUpdate={updateVisit}
          onRemove={removeVisit}
          onClose={() => setVisiting(null)}
        />
      )}
    </div>
  );
}

function DocsManageModal({ studentId, docs, studentLabel, canEditPage, onUpdate, onConfirmAll, onRemove, onClose, onGenerateCertificate }) {
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
                  {canEditPage && (
                    <td className="row-actions">
                      {d.docType === '實習證明書' && <button onClick={() => onGenerateCertificate(studentId)}>產生證明書</button>}
                      <button className="danger" onClick={() => onRemove(d.id)}>刪除</button>
                    </td>
                  )}
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

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function blankVisitForm() {
  return {
    visitDate: '', visitMethod: '', visitPersonnel: '',
    workRatings: blankRatings(WORK_ITEMS), workNotes: blankNotes(WORK_ITEMS),
    lifeRatings: blankRatings(LIFE_ITEMS), lifeNotes: blankNotes(LIFE_ITEMS),
    managerComment: '', studentComment: '',
    monthlyWorkDone: '', monthlyLearning: '', difficulties: '', nextMonthGoals: '',
    result: [], resultOther: '',
  };
}

function RatingTable({ title, items, options, group, notesGroup, values, notes, onRate, onNote }) {
  return (
    <div className="table-wrap" style={{ marginBottom: 12 }}>
      <table>
        <thead><tr><th>{title}</th>{options.map((o) => <th key={o}>{o}</th>)}<th>備註</th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item}>
              <td>{item}</td>
              {options.map((o) => (
                <td key={o}>
                  <input type="radio" name={`${group}-${item}`} checked={values[item] === o} onChange={() => onRate(group, item, o)} />
                </td>
              ))}
              <td><input value={notes[item] || ''} onChange={(e) => onNote(notesGroup, item, e.target.value)} style={{ width: 140 }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 每月訪視紀錄表：學生姓名/護照號碼/國籍/實習企業/分店/部門這些「跟月份
// 無關」的基本資料每次都直接讀目前的學生/實習單位資料（不逐月存一份），
// 切換月份只影響訪視內容本身；該月已經存過紀錄就帶入既有內容，沒有就是
// 空白表單，訪視日期預設今天。
function MonthlyVisitModal({ student, studentLabel, position, match, records, onAdd, onUpdate, onRemove, onClose }) {
  const header = {
    studentName: studentLabel,
    passportNumber: student?.passportNumber || '',
    nationality: student?.nationality || '',
    company: position?.company || '',
    venue: match?.venue || '',
    department: position?.title || '',
  };
  const existingMonths = records.map((r) => r.month).sort().reverse();

  const [month, setMonth] = useState(currentMonthStr());
  const [form, setForm] = useState(() => records.find((r) => r.month === month) || { ...blankVisitForm(), visitDate: new Date().toISOString().slice(0, 10) });
  const [loadedMonth, setLoadedMonth] = useState(month);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (month !== loadedMonth) {
    const existing = records.find((r) => r.month === month);
    setForm(existing || { ...blankVisitForm(), visitDate: new Date().toISOString().slice(0, 10) });
    setLoadedMonth(month);
  }

  const existing = records.find((r) => r.month === month);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setRating(group, item, value) {
    setForm((f) => ({ ...f, [group]: { ...f[group], [item]: value } }));
  }
  function setNote(group, item, value) {
    setForm((f) => ({ ...f, [group]: { ...f[group], [item]: value } }));
  }
  function toggleResult(option) {
    setForm((f) => ({ ...f, result: f.result.includes(option) ? f.result.filter((o) => o !== option) : [...f.result, option] }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { id: _id, studentId: _studentId, ...rest } = form;
      if (existing) await onUpdate(existing.id, { month, ...rest });
      else await onAdd({ month, ...rest });
    } catch (err) {
      alert(`儲存失敗：${err.message || err}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadMonthlyVisitRecord(`${studentLabel}_${month}_每月訪視紀錄表.docx`, { ...header, ...form });
    } catch (err) {
      alert(`產生失敗：${err.message || err}`);
    } finally {
      setDownloading(false);
    }
  }

  async function handleRemove() {
    if (!existing) return;
    if (!window.confirm(`確定要刪除 ${month} 這筆訪視紀錄嗎？`)) return;
    await onRemove(existing.id);
    setForm({ ...blankVisitForm(), visitDate: new Date().toISOString().slice(0, 10) });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 760 }}>
        <h3 style={{ marginTop: 0 }}>{studentLabel} · 每月訪視紀錄</h3>
        <p className="muted">國籍/護照號碼/實習企業/分店/部門直接讀取目前的學生與實習單位資料，自動帶入；已有紀錄的月份：{existingMonths.length ? existingMonths.join('、') : '（無）'}</p>
        <div className="row-actions" style={{ marginBottom: 12 }}>
          <label>
            月份
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          {existing && <span className="tag tag-blue">這個月已有紀錄</span>}
        </div>
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <label>學生姓名<input value={header.studentName} disabled /></label>
          <label>護照號碼<input value={header.passportNumber} disabled /></label>
          <label>國籍<input value={header.nationality} disabled /></label>
          <label>實習企業<input value={header.company} disabled /></label>
          <label>實習分店<input value={header.venue} disabled /></label>
          <label>實習部門<input value={header.department} disabled /></label>
          <label>
            訪視日期
            <input type="date" value={form.visitDate} onChange={(e) => setField('visitDate', e.target.value)} />
          </label>
          <label>
            訪視方式
            <select value={form.visitMethod} onChange={(e) => setField('visitMethod', e.target.value)}>
              <option value="">（未選擇）</option>
              {VISIT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label>
            訪視人員
            <input value={form.visitPersonnel} onChange={(e) => setField('visitPersonnel', e.target.value)} />
          </label>
        </div>

        <h4>實習狀況</h4>
        <RatingTable title="訪視項目" items={WORK_ITEMS} options={WORK_RATING_OPTIONS} group="workRatings" notesGroup="workNotes" values={form.workRatings} notes={form.workNotes} onRate={setRating} onNote={setNote} />
        <label>企業主管意見<textarea rows={2} value={form.managerComment} onChange={(e) => setField('managerComment', e.target.value)} style={{ width: '100%' }} /></label>

        <h4>生活適應情況</h4>
        <RatingTable title="訪視項目" items={LIFE_ITEMS} options={LIFE_RATING_OPTIONS} group="lifeRatings" notesGroup="lifeNotes" values={form.lifeRatings} notes={form.lifeNotes} onRate={setRating} onNote={setNote} />
        <label>學生意見<textarea rows={2} value={form.studentComment} onChange={(e) => setField('studentComment', e.target.value)} style={{ width: '100%' }} /></label>

        <h4>本月學習成果</h4>
        <div className="form-grid">
          <label style={{ gridColumn: '1 / -1' }}>本月完成之工作內容<textarea rows={2} value={form.monthlyWorkDone} onChange={(e) => setField('monthlyWorkDone', e.target.value)} style={{ width: '100%' }} /></label>
          <label style={{ gridColumn: '1 / -1' }}>本月學習收穫<textarea rows={2} value={form.monthlyLearning} onChange={(e) => setField('monthlyLearning', e.target.value)} style={{ width: '100%' }} /></label>
          <label style={{ gridColumn: '1 / -1' }}>遇到之困難<textarea rows={2} value={form.difficulties} onChange={(e) => setField('difficulties', e.target.value)} style={{ width: '100%' }} /></label>
          <label style={{ gridColumn: '1 / -1' }}>下月學習目標<textarea rows={2} value={form.nextMonthGoals} onChange={(e) => setField('nextMonthGoals', e.target.value)} style={{ width: '100%' }} /></label>
        </div>

        <h4>訪視結果</h4>
        <div style={{ marginBottom: 12 }}>
          {RESULT_OPTIONS.map((o) => (
            <label key={o} style={{ display: 'block' }}>
              <input type="checkbox" checked={form.result.includes(o)} onChange={() => toggleResult(o)} /> {o}
              {o === '其他' && form.result.includes('其他') && (
                <input value={form.resultOther} onChange={(e) => setField('resultOther', e.target.value)} style={{ marginLeft: 8, width: 240 }} />
              )}
            </label>
          ))}
        </div>

        <div className="row-actions" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <div className="row-actions">
            {existing && <button className="danger" onClick={handleRemove}>刪除這個月的紀錄</button>}
          </div>
          <div className="row-actions">
            <button className="primary" onClick={handleSave} disabled={saving}>{saving ? '儲存中…' : '儲存'}</button>
            <button onClick={handleDownload} disabled={downloading}>{downloading ? '產生中…' : '下載本月紀錄表'}</button>
            <button onClick={onClose}>關閉</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 實習證明書產生器：國籍決定要用哪個語言版本（越南/印尼各自有專屬範本，
// 其餘國籍統一用英文版），其餘欄位從學生資料/實習單位/申辦進度追蹤自動
// 帶入，沒有資料的欄位留空，產生出來的證明書會用底線標示方便補填。
function CertificateGeneratorModal({ student, studentLabel, position, progress, onClose }) {
  const [form, setForm] = useState(() => ({
    nationality: student?.nationality || '',
    studentNameEn: student?.originalName || '',
    passportNumber: student?.passportNumber || '',
    agency: guessApprovalAgency(position?.industry),
    approvalDate: progress?.ministryReviewDate || '',
    letterNo: position?.letterNo || '',
    startDate: effectiveEntryDate(student),
    endDate: effectiveExitDate(student),
    hotelName: position?.company || '',
    department: position?.title || '',
    issuingAuthority: position?.company || '',
  }));
  const [lang, setLang] = useState(certificateLangFor(student?.nationality));
  const [downloading, setDownloading] = useState(false);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const totalDays = totalInternshipDays(form.startDate, form.endDate);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadInternshipCertificate(`${studentLabel}_實習證明書_${LANG_LABEL[lang]}.docx`, lang, { ...form, totalDays });
    } catch (err) {
      alert(`產生失敗：${err.message || err}`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 640 }}>
        <h3 style={{ marginTop: 0 }}>{studentLabel} · 產生實習證明書</h3>
        <p className="muted">欄位已盡量從學生資料/實習單位/申辦進度追蹤自動帶入，請核對後再下載；核准函日期/文號若還沒登記，要自己補上。</p>
        <div className="form-grid">
          <label>
            證明書語言版本
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              {Object.keys(LANG_LABEL).map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
            </select>
          </label>
          <label>
            國籍
            <input value={form.nationality} onChange={(e) => setField('nationality', e.target.value)} />
          </label>
          <label>
            英文姓名(護照姓名)
            <input value={form.studentNameEn} onChange={(e) => setField('studentNameEn', e.target.value)} />
          </label>
          <label>
            護照號碼
            <input value={form.passportNumber} onChange={(e) => setField('passportNumber', e.target.value)} />
          </label>
          <label>
            核准機關
            <select value={form.agency} onChange={(e) => setField('agency', e.target.value)}>
              {AGENCY_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label>
            核准函日期
            <input type="date" value={form.approvalDate} onChange={(e) => setField('approvalDate', e.target.value)} />
          </label>
          <label>
            核准函文號
            <input value={form.letterNo} onChange={(e) => setField('letterNo', e.target.value)} />
          </label>
          <label>
            實習起日
            <input type="date" value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} />
          </label>
          <label>
            實習迄日
            <input type="date" value={form.endDate} onChange={(e) => setField('endDate', e.target.value)} />
          </label>
          <label>
            旅館/公司名稱
            <input value={form.hotelName} onChange={(e) => setField('hotelName', e.target.value)} />
          </label>
          <label>
            部門/職務
            <input value={form.department} onChange={(e) => setField('department', e.target.value)} />
          </label>
          <label>
            發證單位
            <input value={form.issuingAuthority} onChange={(e) => setField('issuingAuthority', e.target.value)} />
          </label>
        </div>
        <p className="muted">共計 {totalDays != null ? `${totalDays} 天` : '—(請填實習起訖日)'}</p>
        <div className="row-actions" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <a href={TEMPLATE_FILE_BY_LANG[lang]} target="_blank" rel="noreferrer">下載空白範例範本（{LANG_LABEL[lang]}）</a>
          <div className="row-actions">
            <button className="primary" onClick={handleDownload} disabled={downloading}>{downloading ? '產生中…' : '下載已帶入資料的證明書'}</button>
            <button onClick={onClose}>關閉</button>
          </div>
        </div>
      </div>
    </div>
  );
}
