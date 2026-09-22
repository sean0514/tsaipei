import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { ADMITTED_TAG } from '../../lib/tags';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import StatusSections from '../../components/StatusSections';
import SegmentedControl from '../../components/SegmentedControl';
import { STAGES } from './ApplicationProgressPage';

const STATUSES = ['通過二面', '確認錄取'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'matchId', label: '媒合ID' }, { key: 'admitDate', label: '確認日期' },
  { key: 'status', label: '狀態' }, { key: 'notes', label: '備註' },
];

export default function AdmittedListPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'matching', role, overrides);
  const { rows, loading, update, remove } = useCollection('yujian_admittedList');
  const { rows: matches } = useCollection('yujian_matches');
  const { rows: workers } = useCollection('yujian_workers');
  const { rows: employers } = useCollection('yujian_employers');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('yujian_admittedList', CSV_FIELDS, { entityLabel: '錄取名單', requiredKeys: ['matchId'], canEdit: canEditPage });

  function matchLabel(matchId) {
    const m = matches.find((x) => x.id === matchId);
    if (!m) return '(未設定)';
    const w = workers.find((x) => x.id === m.workerId);
    const e = employers.find((x) => x.id === m.employerId);
    return `${w?.chineseName || w?.originalName || '?'} · ${e?.employerName || '?'}`;
  }

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows.filter((r) => !searchQuery || matchLabel(r.matchId).toLowerCase().includes(searchQuery));

  // 狀態變成「確認錄取」時自動建立申辦進度追蹤紀錄，比照境外實習生系統。
  async function handleSave(data) {
    const prevStatus = editing?.status;
    const { id, ...rest } = data;
    try {
      await update(id, rest);
      const match = matches.find((m) => m.id === rest.matchId);
      const workerId = match?.workerId;
      if (workerId && rest.status === '確認錄取' && prevStatus !== '確認錄取') {
        const existingProgress = await getDocs(query(collection(db, 'yujian_applicationProgress'), where('workerId', '==', workerId)));
        if (existingProgress.empty) {
          await addDoc(collection(db, 'yujian_applicationProgress'), { workerId, currentStage: STAGES[0] });
        }
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
          <div className="page-desc">記錄最終確定聘僱的人員（二面進度標記「通過」會自動加入此清單）{!canEditPage && '（唯讀）'}</div>
        </div>
        <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「媒合紀錄ID」欄位）；上傳後會完全取代目前所有錄取名單資料，請先下載備份再匯入。</p>}
      <input placeholder="搜尋人員姓名或雇主" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <StatusSections
          statuses={STATUSES}
          tagMap={ADMITTED_TAG}
          rows={filteredRows}
          colSpan={canEditPage ? 3 : 2}
          headerCells={<><th>媒合</th><th>確認日期</th>{canEditPage && <th></th>}</>}
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
            確認日期
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
