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
import { t } from '../../lib/i18n';

// Ported 1:1 from apps-script/Index.html STUDENT_STATUS.
const STUDENT_STATUS = ['媒合中', '待面試', '已面試', '送審中', '補件中', '企業用印', '收到函文', '辦理簽證中', '已入台實習', '已完成', '取消'];

// Full schema ported from apps-script/Code.gs SHEET_FIELDS.Students.
const FIELDS = [
  { key: 'chineseName', label: '中文姓名' },
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
const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'confirmedClosed', label: '結案' }];

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

// 複製自 systems/tsaipei/StudentsPage.jsx，collection 字首改成 vietnam_，
// 介面文字（標題/按鈕/欄位標籤/表格欄位）包上 t(...) 依語言切換顯示；下拉
// 選單的選項值（國籍/性別等）維持中文儲存，不在這個分頁翻譯顯示文字。
export default function StudentsPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'students', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('vietnam_students');
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {...} = editing
  const [q, setQ] = useState('');

  const sorted = [...rows].sort((a, b) => {
    const at = a.createdAt?.toMillis?.() ?? 0;
    const bt = b.createdAt?.toMillis?.() ?? 0;
    if (at !== bt) return bt - at;
    return (a.chineseName || '').localeCompare(b.chineseName || '');
  });
  const filtered = sorted
    .filter((r) => !r.confirmedClosed)
    .filter((r) => !q || [r.chineseName, r.originalName, r.school, r.nationality].some((v) => v?.includes(q)));
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_students', CSV_FIELDS, { entityLabel: '學生資料', canEdit: canEditPage });

  async function handleSave(data) {
    try {
      if (data.id) {
        const { id, ...rest } = data;
        await update(id, rest);
      } else {
        const ref = await add({ ...data, createdAt: serverTimestamp() });
        await addDoc(collection(db, 'vietnam_matches'), {
          studentId: ref.id, positionId: '', status: '媒合中', matchDate: '', notes: '（系統依學生建檔自動建立）', createdAt: serverTimestamp(),
        });
      }
      setEditing(null);
    } catch (err) {
      alert(`存檔失敗：${err.message || err}`);
    }
  }

  async function handleDelete(studentId) {
    if (!window.confirm('確定要刪除這位學生嗎？')) return;
    try {
      const matchesSnap = await getDocs(query(collection(db, 'vietnam_matches'), where('studentId', '==', studentId)));
      const matchIds = matchesSnap.docs.map((d) => d.id);
      const dependentSnaps = await Promise.all([
        matchIds.length ? getDocs(query(collection(db, 'vietnam_secondInterviews'), where('matchId', 'in', matchIds.slice(0, 30)))) : null,
        matchIds.length ? getDocs(query(collection(db, 'vietnam_admittedList'), where('matchId', 'in', matchIds.slice(0, 30)))) : null,
        getDocs(query(collection(db, 'vietnam_internshipDocs'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'vietnam_applicationProgress'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'vietnam_housingRecords'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'vietnam_inTaiwanVisa'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'vietnam_inTaiwanCare'), where('studentId', '==', studentId))),
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
          <h2>{t('學生資料', lang)}</h2>
          <div className="page-desc">{t('管理來台實習之國際學生基本資料與狀態', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({ status: STUDENT_STATUS[0] })}>+ {t('新增學生', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」欄位需與「下載完整資料」的 CSV 欄位一致；上傳後會完全取代目前所有學生資料，請先下載備份再匯入。', lang)}</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <input placeholder={t('搜尋姓名/學校/國籍', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>{t('姓名', lang)} / {t('國籍', lang)}</th><th>{t('學校', lang)} / {t('系所', lang)}</th><th>{t('電話', lang)}</th><th>{t('入境', lang)} / {t('離境', lang)}</th><th>{t('文件', lang)}</th><th>{t('狀態', lang)}</th>
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
                      <td>
                        <div className="row-actions">
                          <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                          <button className="danger" onClick={() => handleDelete(r.id)}>{t('刪除', lang)}</button>
                          <button onClick={() => update(r.id, { confirmedClosed: true })}>{t('結案', lang)}</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={7} className="muted">{t('沒有資料', lang)}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && (
        <StudentFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />
      )}
    </div>
  );
}

function StudentFormModal({ initial, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯學生', lang) : t('新增學生', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {t(f.label, lang)}
                {f.key === 'status' ? (
                  <select value={form.status || STUDENT_STATUS[0]} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {STUDENT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : f.options ? (
                  <select value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    {f.options.map((o) => <option key={o} value={o}>{o || t('請選擇', lang)}</option>)}
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
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
