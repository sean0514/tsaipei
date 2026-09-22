import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import StatusSections from '../../components/StatusSections';
import SegmentedControl from '../../components/SegmentedControl';
import { SECOND_INTERVIEW_TAG } from '../../lib/tags';

const STATUSES = ['待安排', '已安排', '通過', '未通過'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'matchId', label: '媒合ID' }, { key: 'date', label: '面談日期' },
  { key: 'method', label: '面談方式' }, { key: 'status', label: '進度狀態' }, { key: 'notes', label: '備註' },
];

export default function SecondInterviewsPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'matching', role, overrides);
  const { rows, loading, update, remove } = useCollection('yujian_secondInterviews');
  const { rows: matches } = useCollection('yujian_matches');
  const { rows: workers } = useCollection('yujian_workers');
  const { rows: employers } = useCollection('yujian_employers');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('yujian_secondInterviews', CSV_FIELDS, { entityLabel: '二面進度', requiredKeys: ['matchId'], canEdit: canEditPage });

  function matchLabel(matchId) {
    const m = matches.find((x) => x.id === matchId);
    if (!m) return '(未設定)';
    const w = workers.find((x) => x.id === m.workerId);
    const e = employers.find((x) => x.id === m.employerId);
    return `${w?.chineseName || w?.originalName || '?'} · ${e?.employerName || '?'}`;
  }

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows.filter((r) => !searchQuery || matchLabel(r.matchId).toLowerCase().includes(searchQuery));

  // 狀態變成「通過」時自動建立錄取名單（通過二面），比照境外實習生系統。
  async function handleSave(data) {
    const { id, ...rest } = data;
    await update(id, rest);
    if (data.status === '通過') {
      const existing = await getDocs(query(collection(db, 'yujian_admittedList'), where('matchId', '==', data.matchId)));
      if (existing.empty) {
        await addDoc(collection(db, 'yujian_admittedList'), { matchId: data.matchId, status: '通過二面', notes: '（系統依二面進度通過自動建立）' });
      }
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>二面進度</h2>
          <div className="page-desc">依進度狀態自動分類，追蹤已媒合人員的第二輪面談進度{!canEditPage && '（唯讀）'}</div>
        </div>
        <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「媒合紀錄ID」欄位）；上傳後會完全取代目前所有二面進度資料，請先下載備份再匯入。</p>}
      <input placeholder="搜尋人員姓名或雇主" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <StatusSections
          statuses={STATUSES}
          tagMap={SECOND_INTERVIEW_TAG}
          rows={filteredRows}
          sortKey="date"
          colSpan={canEditPage ? 4 : 3}
          headerCells={<><th>媒合</th><th>面談日期</th><th>面談方式</th>{canEditPage && <th></th>}</>}
          renderRow={(r) => (
            <tr key={r.id}>
              <td>{matchLabel(r.matchId)}</td>
              <td>{r.date || '—'}</td>
              <td>{r.method || '—'}</td>
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
      {editing && <SecondInterviewFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function SecondInterviewFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>編輯二面進度</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              面談日期
              <input type="date" value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>
              面談方式
              <input value={form.method || ''} onChange={(e) => setForm({ ...form, method: e.target.value })} />
            </label>
          </div>
          <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-muted)' }}>進度狀態</div>
          <SegmentedControl name="second-status" options={STATUSES} value={form.status || '待安排'} onChange={(v) => setForm({ ...form, status: v })} />
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
