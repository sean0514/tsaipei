import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const STATUSES = ['媒合中', '已媒合', '取消'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'workerId', label: '人員ID' }, { key: 'employerId', label: '雇主ID' },
  { key: 'status', label: '狀態' }, { key: 'matchDate', label: '媒合日期' }, { key: 'notes', label: '備註' },
];

export default function MatchesPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'matching', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('yujian_matches');
  const { rows: workers } = useCollection('yujian_workers');
  const { rows: employers } = useCollection('yujian_employers');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('yujian_matches', CSV_FIELDS, { entityLabel: '媒合紀錄', requiredKeys: ['workerId', 'employerId'], canEdit: canEditPage });

  const workerName = (id) => { const w = workers.find((x) => x.id === id); return w?.chineseName || w?.originalName || '(未設定)'; };
  const employerName = (id) => employers.find((x) => x.id === id)?.employerName || '(未設定)';

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows.filter((r) => !searchQuery || `${workerName(r.workerId)} ${employerName(r.employerId)}`.toLowerCase().includes(searchQuery));

  // 狀態變成「已媒合」時自動建立一筆二面進度（待安排），比照境外實習生系統
  // 媒合紀錄→二面進度的自動連動。
  async function handleSave(data) {
    const wasMatched = editing?.status === '已媒合';
    let matchId = data.id;
    if (matchId) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      const ref = await add({ status: '媒合中', ...data });
      matchId = ref.id;
    }
    if (data.status === '已媒合' && !wasMatched) {
      await addDoc(collection(db, 'yujian_secondInterviews'), { matchId, status: '待安排' });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>媒合紀錄</h2>
          <div className="page-desc">記錄看護/家事人員與雇主家庭的配對狀態{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增媒合</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「人員ID」「雇主ID」欄位）；上傳後會完全取代目前所有媒合紀錄，請先下載備份再匯入。</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <input placeholder="搜尋人員或雇主" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>人員</th><th>雇主</th><th>狀態</th><th>媒合日期</th><th>備註</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{workerName(r.workerId)}</td>
                  <td>{employerName(r.employerId)}</td>
                  <td>{r.status || '—'}</td>
                  <td>{r.matchDate || '—'}</td>
                  <td>{r.notes || '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={canEditPage ? 6 : 5} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <MatchFormModal initial={editing} workers={workers} employers={employers} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function MatchFormModal({ initial, workers, employers, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯媒合紀錄' : '新增媒合紀錄'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              人員
              <select required value={form.workerId || ''} onChange={(e) => setForm({ ...form, workerId: e.target.value })}>
                <option value="" disabled>請選擇</option>
                {workers.map((w) => <option key={w.id} value={w.id}>{w.chineseName || w.originalName}</option>)}
              </select>
            </label>
            <label>
              雇主
              <select required value={form.employerId || ''} onChange={(e) => setForm({ ...form, employerId: e.target.value })}>
                <option value="" disabled>請選擇</option>
                {employers.map((e2) => <option key={e2.id} value={e2.id}>{e2.employerName}</option>)}
              </select>
            </label>
            <label>
              狀態
              <select value={form.status || '媒合中'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>
              媒合日期
              <input type="date" value={form.matchDate || ''} onChange={(e) => setForm({ ...form, matchDate: e.target.value })} />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              備註
              <input value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
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
