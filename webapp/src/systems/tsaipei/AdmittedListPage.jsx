import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { DOC_TYPES } from './InternshipDocsPage';
import { ADMITTED_TAG } from '../../lib/tags';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import StatusSections from '../../components/StatusSections';
import SegmentedControl from '../../components/SegmentedControl';

const STATUSES = ['通過二面', '確認錄取'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'matchId', label: '媒合ID' }, { key: 'admitDate', label: '錄取日期' },
  { key: 'status', label: '狀態' }, { key: 'notes', label: '備註' },
];

export default function AdmittedListPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'matching', role, overrides);
  const { rows, loading, update, remove } = useCollection('tsaipei_admittedList');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: positions } = useCollection('tsaipei_positions');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_admittedList', CSV_FIELDS, { entityLabel: '錄取名單', requiredKeys: ['matchId'], canEdit: canEditPage });

  function matchLabel(matchId) {
    const m = matches.find((x) => x.id === matchId);
    if (!m) return '(未設定)';
    const st = students.find((x) => x.id === m.studentId);
    const s = st?.chineseName || st?.originalName || '?';
    const p = positions.find((x) => x.id === m.positionId);
    return `${s} · ${p ? `${p.projectCode} ${p.company}` : '?'}`;
  }

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows.filter((r) => !searchQuery || matchLabel(r.matchId).toLowerCase().includes(searchQuery));

  // 狀態變成「確認錄取」時自動建立實習文件追蹤整組清單、申辦進度追蹤紀錄；
  // 從「確認錄取」改回「通過二面」時自動刪除該學生的實習文件追蹤整組紀錄
  // （不可逆，跟原本 Apps Script 版行為一致）。
  async function handleSave(data) {
    const prevStatus = editing?.status;
    const { id, ...rest } = data;
    try {
      await update(id, rest);

      const match = matches.find((m) => m.id === rest.matchId);
      const studentId = match?.studentId;

      if (studentId && rest.status === '確認錄取' && prevStatus !== '確認錄取') {
        // 先確認這位學生還沒有實習文件追蹤紀錄，避免重複切換狀態時建立出
        // 好幾組重複的文件清單。
        const existingDocs = await getDocs(query(collection(db, 'tsaipei_internshipDocs'), where('studentId', '==', studentId)));
        if (existingDocs.empty) {
          await Promise.all(DOC_TYPES.map((docType) =>
            addDoc(collection(db, 'tsaipei_internshipDocs'), { studentId, docType, status: '未提供' })
          ));
        }
        const existingProgress = await getDocs(query(collection(db, 'tsaipei_applicationProgress'), where('studentId', '==', studentId)));
        if (existingProgress.empty) {
          await addDoc(collection(db, 'tsaipei_applicationProgress'), { studentId, currentStage: '學生錄取' });
        }
      } else if (studentId && prevStatus === '確認錄取' && rest.status === '通過二面') {
        const snap = await getDocs(query(collection(db, 'tsaipei_internshipDocs'), where('studentId', '==', studentId)));
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
          <h2>錄取名單</h2>
          <div className="page-desc">記錄最終確定錄取的學生（二面進度標記「通過」會自動加入此清單）{!canEditPage && '（唯讀）'}</div>
        </div>
        <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「媒合紀錄ID」欄位）；上傳後會完全取代目前所有錄取名單資料，請先下載備份再匯入。</p>}
      <input placeholder="搜尋學生姓名或公司/職務" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <StatusSections
          statuses={STATUSES}
          tagMap={ADMITTED_TAG}
          rows={filteredRows}
          colSpan={canEditPage ? 3 : 2}
          headerCells={<><th>媒合</th><th>錄取日期</th>{canEditPage && <th></th>}</>}
          renderRow={(r) => (
            <tr key={r.id}>
              <td>{matchLabel(r.matchId)}</td>
              <td>{r.admitDate || '—'}</td>
              {canEditPage && (
                <td className="row-actions">
                  <button onClick={() => setEditing(r)}>編輯</button>
                  <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                </td>
              )}
            </tr>
          )}
        />
      )}
      {editing && <AdmittedFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function AdmittedFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>編輯錄取名單</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <label>
            錄取日期
            <input type="date" value={form.admitDate || ''} onChange={(e) => setForm({ ...form, admitDate: e.target.value })} style={{ marginBottom: 16 }} />
          </label>
          <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-muted)' }}>狀態</div>
          <SegmentedControl name="admitted-status" options={STATUSES} value={form.status || '通過二面'} onChange={(v) => setForm({ ...form, status: v })} />
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
