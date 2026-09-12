import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import Tag from '../../components/Tag';
import { INTERNSHIP_DOC_TAG } from '../../lib/tags';
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

export default function InternshipDocsPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'internshipDocs', role, overrides);
  const { rows, loading, update, remove } = useCollection('tsaipei_internshipDocs');
  const { rows: students } = useCollection('tsaipei_students');
  const [studentFilter, setStudentFilter] = useState('');
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_internshipDocs', CSV_FIELDS, { entityLabel: '實習文件追蹤', requiredKeys: ['studentId', 'docType'], canEdit: canEditPage });

  const studentName = (id) => students.find((s) => s.id === id)?.chineseName || '(未知)';
  const searchQuery = q.trim().toLowerCase();
  const byStudent = {};
  rows
    .filter((r) => !studentFilter || r.studentId === studentFilter)
    .filter((r) => !searchQuery || studentName(r.studentId).toLowerCase().includes(searchQuery))
    .forEach((r) => { (byStudent[r.studentId] ||= []).push(r); });

  // 依學生建檔時間排序，新進學生的文件清單排在最上面；沒有 createdAt 的既有
  // 學生排在後面，維持原本順序。
  const studentIds = Object.keys(byStudent).sort((a, b) => {
    const at = students.find((s) => s.id === a)?.createdAt?.toMillis?.() ?? 0;
    const bt = students.find((s) => s.id === b)?.createdAt?.toMillis?.() ?? 0;
    return bt - at;
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

  return (
    <div className="content">
      <div className="page-header">
        <h2>實習文件追蹤</h2>
        <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
      </div>
      <div className="card">
        <div className="row-actions" style={{ marginBottom: 12 }}>
          <input placeholder="搜尋學生" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          <select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}>
            <option value="">全部學生</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.chineseName}</option>)}
          </select>
        </div>
        {loading ? <p className="muted">載入中…</p> : (
          studentIds.length === 0 ? <p className="muted">沒有資料</p> :
          studentIds.map((studentId) => {
            const docs = byStudent[studentId];
            const allDone = docs.every((d) => d.status === '已核准' || d.status === '不適用');
            return (
              <div key={studentId} style={{ marginBottom: 20 }}>
                <div className="row-actions" style={{ marginBottom: 6 }}>
                  <h4 style={{ margin: 0 }}>{studentName(studentId)} {allDone && <span className="muted">（已完成繳交）</span>}</h4>
                  {canEditPage && !allDone && <button onClick={() => confirmAll(studentId, docs)}>全部核准</button>}
                </div>
                <div className="table-wrap"><table>
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
                              onChange={(v) => handleUpdate(d, { status: v })}
                              compact
                            />
                          ) : <Tag value={d.status} map={INTERNSHIP_DOC_TAG} />}
                        </td>
                        <td>
                          {d.docType === '延畢證明' && (
                            canEditPage ? (
                              <select value={d.extensionApplicable || ''} onChange={(e) => handleUpdate(d, { extensionApplicable: e.target.value })}>
                                {EXTENSION_OPTIONS.map((o) => <option key={o} value={o}>{o || '未設定'}</option>)}
                              </select>
                            ) : (d.extensionApplicable || '—')
                          )}
                          {d.docType === '語言能力證明' && (
                            canEditPage ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <select value={d.langProofType || ''} onChange={(e) => handleUpdate(d, { langProofType: e.target.value })}>
                                  {['', '華語', '多益', '雅思'].map((o) => <option key={o} value={o}>{o || '未提供'}</option>)}
                                </select>
                                <select value={d.langProofLevel || ''} onChange={(e) => handleUpdate(d, { langProofLevel: e.target.value })}>
                                  {['', 'A1', 'A2', 'B1'].map((o) => <option key={o} value={o}>{o || '未提供'}</option>)}
                                </select>
                              </div>
                            ) : ([d.langProofType, d.langProofLevel].filter(Boolean).join(' / ') || '—')
                          )}
                          {!['延畢證明', '語言能力證明'].includes(d.docType) && '—'}
                        </td>
                        <td>
                          {canEditPage ? (
                            <input type="date" value={d.receivedDate || ''} onChange={(e) => handleUpdate(d, { receivedDate: e.target.value })} />
                          ) : (d.receivedDate || '—')}
                        </td>
                        {canEditPage && <td><button className="danger" onClick={() => remove(d.id)}>刪除</button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
