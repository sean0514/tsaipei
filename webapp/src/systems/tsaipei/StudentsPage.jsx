import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, deleteDoc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import Tag from '../../components/Tag';
import { STUDENT_TAG } from '../../lib/tags';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

// Ported 1:1 from apps-script/Index.html STUDENT_STATUS.
const STUDENT_STATUS = ['媒合中', '待面試', '已面試', '送審中', '補件中', '企業用印', '收到函文', '辦理簽證中', '已入台實習', '已完成', '取消'];

// Full schema ported from apps-script/Code.gs SHEET_FIELDS.Students.
const FIELDS = [
  { key: 'chineseName', label: '中文姓名', required: true },
  { key: 'originalName', label: '原始姓名(護照名稱)' },
  { key: 'school', label: '就讀學校' },
  { key: 'department1', label: '系所1' },
  { key: 'department2', label: '系所2' },
  { key: 'nationality', label: '國籍', options: ['', '越南', '印尼', '泰國', '菲律賓', '台灣'] },
  { key: 'gender', label: '性別', options: ['', '男', '女'] },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: '電話' },
  { key: 'startDate', label: '實習開始日', type: 'date' },
  { key: 'endDate', label: '實習結束日', type: 'date' },
  { key: 'langProofType', label: '語言能力證明類別', options: ['', '華語', '多益', '雅思'] },
  { key: 'langProofLevel', label: '語言能力證明等級', options: ['', 'A1', 'A2', 'B1'] },
  { key: 'langProofStatus', label: '語言能力證明狀態', options: ['未收到', '已收到'] },
  { key: 'enrollStart', label: '在學證明_入學年月' },
  { key: 'enrollEnd', label: '在學證明_畢業年月' },
  { key: 'enrollProofStatus', label: '在學證明狀態', options: ['未收到', '已收到'] },
  { key: 'passportCopy', label: '護照影本', options: ['未收到', '已收到'] },
  { key: 'passportNumber', label: '護照號碼' },
  { key: 'otherDocs', label: '其他文件' },
  { key: 'extensionNeeded', label: '是否延畢', options: ['無', '有'] },
  { key: 'extensionProof', label: '延畢證明（須載明實習結束後返國辦理畢業手續）', options: ['未收到', '已收到'] },
  { key: 'nightInternshipDoc', label: '夜間實習同意書', options: ['未收到', '已收到', '不適用'] },
  { key: 'firstEntryDate', label: '第一次入境日期', type: 'date' },
  { key: 'firstExitDate', label: '第一次離境日期', type: 'date' },
  { key: 'secondEntryDate', label: '第二次入境日期', type: 'date' },
  { key: 'secondExitDate', label: '第二次離境日期', type: 'date' },
  { key: 'status', label: '狀態' },
  { key: 'notes', label: '備註' },
  { key: 'sourceSupplier', label: '學生來源(國外供應商)' },
];
const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

// Ported from docChecklist/docSummary in apps-script/Index.html — 5-item
// checklist of document fields stored directly on the student record.
function docSummary(s) {
  const list = [
    s.langProofStatus === '已收到',
    s.enrollProofStatus === '已收到',
    s.passportCopy === '已收到',
    s.extensionNeeded === '無' || s.extensionProof === '已收到',
    s.nightInternshipDoc === '已收到' || s.nightInternshipDoc === '不適用',
  ];
  const done = list.filter(Boolean).length;
  return { done, total: list.length, complete: done === list.length };
}

export default function StudentsPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'students', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_students');
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {...} = editing
  const [q, setQ] = useState('');

  // 依使用者要求：新增的學生排在最上面。既有（遷移進來、沒有 createdAt）的
  // 學生沒有時間戳記可比較，維持原本用中文姓名排序；新增的學生一律浮到最上面。
  const sorted = [...rows].sort((a, b) => {
    const at = a.createdAt?.toMillis?.() ?? 0;
    const bt = b.createdAt?.toMillis?.() ?? 0;
    if (at !== bt) return bt - at;
    return (a.chineseName || '').localeCompare(b.chineseName || '');
  });
  const filtered = sorted.filter((r) => !q || [r.chineseName, r.originalName, r.school, r.nationality].some((v) => v?.includes(q)));
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_students', CSV_FIELDS, { entityLabel: '學生資料', canEdit: canEditPage });

  // 新增學生存檔後自動在「媒合紀錄」建立一筆「媒合中」的空白紀錄（職缺待補），
  // 沿用原本 Apps Script 版的行為。
  async function handleSave(data) {
    try {
      if (data.id) {
        const { id, ...rest } = data;
        await update(id, rest);
      } else {
        const ref = await add({ ...data, createdAt: serverTimestamp() });
        await addDoc(collection(db, 'tsaipei_matches'), {
          studentId: ref.id, positionId: '', status: '媒合中', matchDate: '', notes: '（系統依學生建檔自動建立）', createdAt: serverTimestamp(),
        });
      }
      setEditing(null);
    } catch (err) {
      alert(`存檔失敗：${err.message || err}`);
    }
  }

  // Ported from deleteStudent() in apps-script/Code.gs: cascade-delete every
  // record that references this student before removing the student itself.
  async function handleDelete(studentId) {
    if (!window.confirm('確定要刪除這位學生嗎？')) return;
    try {
      const matchesSnap = await getDocs(query(collection(db, 'tsaipei_matches'), where('studentId', '==', studentId)));
      const matchIds = matchesSnap.docs.map((d) => d.id);
      const dependentSnaps = await Promise.all([
        matchIds.length ? getDocs(query(collection(db, 'tsaipei_secondInterviews'), where('matchId', 'in', matchIds.slice(0, 30)))) : null,
        matchIds.length ? getDocs(query(collection(db, 'tsaipei_admittedList'), where('matchId', 'in', matchIds.slice(0, 30)))) : null,
        getDocs(query(collection(db, 'tsaipei_internshipDocs'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'tsaipei_applicationProgress'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'tsaipei_housingRecords'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'tsaipei_inTaiwanVisa'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'tsaipei_inTaiwanCare'), where('studentId', '==', studentId))),
      ]);
      const refs = [
        ...matchesSnap.docs.map((d) => d.ref),
        ...dependentSnaps.flatMap((snap) => (snap ? snap.docs.map((d) => d.ref) : [])),
      ];
      for (let i = 0; i < refs.length; i += 450) {
        const batch = writeBatch(db);
        refs.slice(i, i + 450).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
      await remove(studentId);
    } catch (err) {
      alert(`刪除失敗：${err.message || err}`);
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>學生資料</h2>
          <div className="page-desc">管理來台實習之國際學生基本資料與狀態{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({ status: STUDENT_STATUS[0] })}>+ 新增學生</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」欄位需與「下載完整資料」的 CSV 欄位一致；上傳後會完全取代目前所有學生資料，請先下載備份再匯入。</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <input placeholder="搜尋姓名/學校/國籍" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>姓名 / 國籍</th><th>學校 / 系所</th><th>電話</th><th>入境 / 離境</th><th>文件</th><th>狀態</th>
                {canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const doc = docSummary(r);
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.chineseName}{r.originalName ? `（${r.originalName}）` : ''}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{r.nationality || '—'}</div>
                    </td>
                    <td>
                      {r.school || '—'}
                      <div className="muted" style={{ fontSize: 12 }}>{[r.department1, r.department2].filter(Boolean).join(' / ')}</div>
                    </td>
                    <td>{r.phone || '—'}</td>
                    <td>{r.firstEntryDate || '—'} ~ {r.firstExitDate || '—'}</td>
                    <td><span className={`tag ${doc.complete ? 'tag-green' : 'tag-amber'}`}>{doc.done}/{doc.total}</span></td>
                    <td><Tag value={r.status} map={STUDENT_TAG} /></td>
                    {canEditPage && (
                      <td className="row-actions">
                        <button onClick={() => setEditing(r)}>編輯</button>
                        <button className="danger" onClick={() => handleDelete(r.id)}>刪除</button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={7} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && (
        <StudentFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />
      )}
    </div>
  );
}

function StudentFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯學生' : '新增學生'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                {f.key === 'status' ? (
                  <select value={form.status || STUDENT_STATUS[0]} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {STUDENT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : f.options ? (
                  <select value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    {f.options.map((o) => <option key={o} value={o}>{o || '請選擇'}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.type || 'text'}
                    required={f.required}
                    value={form[f.key] || ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
                )}
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
