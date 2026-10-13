import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { ADMITTED_TAG } from '../../lib/tags';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import StatusSections from '../../components/StatusSections';
import SegmentedControl from '../../components/SegmentedControl';
import { t } from '../../lib/i18n';

// 跟 systems/tsaipei/AdmittedListPage.jsx 一樣，需要 InternshipDocsPage 的
// DOC_TYPES 清單；在越南系統該分頁還沒複製過來前，先在這裡本地維護同一份
// 清單（之後複製 InternshipDocsPage 時維持一致）。
const DOC_TYPES = ['語言能力證明', '在學證明', '延畢證明', '夜間實習同意書', '護照影本', '其他'];

const STATUSES = ['通過二面', '確認錄取'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'matchId', label: '媒合ID' }, { key: 'admitDate', label: '錄取日期' },
  { key: 'status', label: '狀態' }, { key: 'notes', label: '備註' }, { key: 'confirmedClosed', label: '結案' },
];

// 複製自 systems/tsaipei/AdmittedListPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function AdmittedListPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'admitted', role, overrides);
  const { rows, loading, update, remove } = useCollection('vietnam_admittedList');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: students } = useCollection('vietnam_students');
  const { rows: positions } = useCollection('vietnam_positions');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_admittedList', CSV_FIELDS, { entityLabel: '錄取名單', requiredKeys: ['matchId'], canEdit: canEditPage });

  function matchLabel(matchId) {
    const m = matches.find((x) => x.id === matchId);
    if (!m) return '(未設定)';
    const st = students.find((x) => x.id === m.studentId);
    const s = st?.chineseName || st?.originalName || '?';
    const p = positions.find((x) => x.id === m.positionId);
    return `${s} · ${p ? `${p.projectCode} ${p.company}` : '?'}`;
  }

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows
    .filter((r) => !r.confirmedClosed)
    .filter((r) => !searchQuery || matchLabel(r.matchId).toLowerCase().includes(searchQuery));

  async function handleSave(data) {
    const prevStatus = editing?.status;
    const { id, ...rest } = data;
    try {
      await update(id, rest);

      const match = matches.find((m) => m.id === rest.matchId);
      const studentId = match?.studentId;

      if (studentId && rest.status === '確認錄取' && prevStatus !== '確認錄取') {
        const existingDocs = await getDocs(query(collection(db, 'vietnam_internshipDocs'), where('studentId', '==', studentId)));
        if (existingDocs.empty) {
          await Promise.all(DOC_TYPES.map((docType) =>
            addDoc(collection(db, 'vietnam_internshipDocs'), { studentId, docType, status: '未提供' })
          ));
        }
        const existingProgress = await getDocs(query(collection(db, 'vietnam_applicationProgress'), where('studentId', '==', studentId)));
        if (existingProgress.empty) {
          await addDoc(collection(db, 'vietnam_applicationProgress'), { studentId, admittedDate: rest.admitDate || '' });
        }
      } else if (studentId && prevStatus === '確認錄取' && rest.status === '通過二面') {
        const snap = await getDocs(query(collection(db, 'vietnam_internshipDocs'), where('studentId', '==', studentId)));
        await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      }
      setEditing(null);
    } catch (err) {
      alert(`存檔失敗：${err.message || err}`);
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('錄取名單', lang)}</h2>
          <div className="page-desc">{t('記錄最終確定錄取的學生（二面進度標記「通過」會自動加入此清單）', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「媒合紀錄ID」欄位）；上傳後會完全取代目前所有錄取名單資料，請先下載備份再匯入。', lang)}</p>}
      <input placeholder={t('搜尋學生姓名或公司/職務', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <StatusSections
          statuses={STATUSES}
          tagMap={ADMITTED_TAG}
          rows={filteredRows}
          colSpan={canEditPage ? 3 : 2}
          headerCells={<><th>{t('媒合', lang)}</th><th>{t('錄取日期', lang)}</th>{canEditPage && <th></th>}</>}
          renderRow={(r) => (
            <tr key={r.id}>
              <td>{matchLabel(r.matchId)}</td>
              <td>{r.admitDate || '—'}</td>
              {canEditPage && (
                <td className="row-actions">
                  <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                  <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                  <button onClick={() => update(r.id, { confirmedClosed: true })}>{t('結案', lang)}</button>
                </td>
              )}
            </tr>
          )}
        />
      )}
      {editing && <AdmittedFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function AdmittedFormModal({ initial, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('編輯錄取名單', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <label>
            {t('錄取日期', lang)}
            <input type="date" value={form.admitDate || ''} onChange={(e) => setForm({ ...form, admitDate: e.target.value })} style={{ marginBottom: 16 }} />
          </label>
          <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-muted)' }}>{t('狀態', lang)}</div>
          <SegmentedControl name="admitted-status" options={STATUSES} value={form.status || '通過二面'} onChange={(v) => setForm({ ...form, status: v })} />
          <label>
            {t('備註', lang)}
            <textarea rows={3} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ marginBottom: 16 }} />
          </label>
          <div className="row-actions">
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
