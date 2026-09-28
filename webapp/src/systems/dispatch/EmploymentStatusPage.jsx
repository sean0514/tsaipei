import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { EMPLOYMENT_STATUS_TAG } from '../../lib/tags';
import Tag from '../../components/Tag';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const STATUSES = ['在職', '離職'];

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'jobSeekerId', label: '求職者ID' }, { key: 'client', label: '客戶/派駐單位' },
  { key: 'position', label: '職務' }, { key: 'startDate', label: '到職日' }, { key: 'endDate', label: '離職日' },
  { key: 'salary', label: '底薪' }, { key: 'status', label: '狀態' }, { key: 'notes', label: '備註' },
];

export default function EmploymentStatusPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'employmentStatus', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('dispatch_employmentStatus');
  const { rows: jobSeekers } = useCollection('dispatch_jobSeekers');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('dispatch_employmentStatus', CSV_FIELDS, { entityLabel: '在職/離職概況', requiredKeys: ['jobSeekerId'], canEdit: canEditPage });

  function jobSeekerName(id) {
    const s = jobSeekers.find((x) => x.id === id);
    return s?.chineseName || '(未設定)';
  }

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows.filter((r) => !searchQuery || `${jobSeekerName(r.jobSeekerId)} ${r.client || ''}`.toLowerCase().includes(searchQuery));
  const active = filtered.filter((r) => r.status !== '離職');
  const departed = filtered.filter((r) => r.status === '離職');

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ status: '在職', ...data });
    }
    setEditing(null);
  }

  // 「同步求職者資訊」：求職者資訊的狀態為在職/離職時，理論上手動存檔會
  // 自動同步過來（見 JobSeekersPage.jsx），但用 CSV 批次匯入求職者資料時
  // 不會觸發那個邏輯——這裡把目前所有「在職」「離職」的求職者，依求職者ID
  // 一次性 upsert 到這個集合，補齊/更新漏掉的紀錄。
  function employmentPayloadFor(jobSeeker) {
    return {
      jobSeekerId: jobSeeker.id, client: jobSeeker.client || '', position: jobSeeker.branch || '',
      startDate: jobSeeker.startDate || '',
      endDate: jobSeeker.status === '離職' ? (jobSeeker.lastWorkDate || jobSeeker.insuranceEndDate || '') : '',
      status: jobSeeker.status,
    };
  }
  const employedJobSeekers = jobSeekers.filter((s) => s.status === '在職' || s.status === '離職');
  const byJobSeekerId = {};
  rows.forEach((r) => { if (r.jobSeekerId && !byJobSeekerId[r.jobSeekerId]) byJobSeekerId[r.jobSeekerId] = r; });
  const outOfSync = employedJobSeekers.filter((s) => {
    const existing = byJobSeekerId[s.id];
    const payload = employmentPayloadFor(s);
    if (!existing) return true;
    return Object.keys(payload).some((k) => (existing[k] || '') !== (payload[k] || ''));
  });

  async function handleSyncFromJobSeekers() {
    if (outOfSync.length === 0) return;
    if (!window.confirm(`將依「求職者資訊」目前的在職/離職狀態，新增或更新 ${outOfSync.length} 筆紀錄，確定要繼續嗎？`)) return;
    for (let i = 0; i < outOfSync.length; i += 450) {
      const batch = writeBatch(db);
      outOfSync.slice(i, i + 450).forEach((s) => {
        const payload = employmentPayloadFor(s);
        const existing = byJobSeekerId[s.id];
        batch.set(existing ? doc(db, 'dispatch_employmentStatus', existing.id) : doc(collection(db, 'dispatch_employmentStatus')), payload, { merge: true });
      });
      await batch.commit();
    }
    alert(`已同步 ${outOfSync.length} 筆資料。`);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>在職/離職概況</h2>
          <div className="page-desc">依在職與離職分類，追蹤派駐客戶的員工狀態{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增紀錄</button>}
          {canEditPage && outOfSync.length > 0 && (
            <button onClick={handleSyncFromJobSeekers}>同步求職者資訊（{outOfSync.length}）</button>
          )}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「求職者ID」欄位）；上傳後會完全取代目前所有在職/離職紀錄，請先下載備份再匯入。「求職者資訊」的狀態改為在職/離職時會自動同步過來；若是用 CSV 批次匯入求職者資料，請按「同步求職者資訊」一次補齊。</p>}
      <input placeholder="搜尋姓名或客戶" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card" style={{ overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>在職 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{active.length} 人</span></h3>
            <EmploymentTable items={active} canEditPage={canEditPage} jobSeekerName={jobSeekerName} onEdit={setEditing} onRemove={remove} />
          </div>
          <div className="card" style={{ overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>離職 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{departed.length} 人</span></h3>
            <EmploymentTable items={departed} canEditPage={canEditPage} jobSeekerName={jobSeekerName} onEdit={setEditing} onRemove={remove} />
          </div>
        </div>
      )}
      {editing && <EmploymentFormModal initial={editing} jobSeekers={jobSeekers} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function EmploymentTable({ items, canEditPage, jobSeekerName, onEdit, onRemove }) {
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>姓名</th><th>客戶/派駐單位</th><th>職務</th><th>到職日</th><th>離職日</th><th>狀態</th>{canEditPage && <th></th>}</tr></thead>
      <tbody>
        {items.map((r) => (
          <tr key={r.id}>
            <td>{jobSeekerName(r.jobSeekerId)}</td>
            <td>{r.client || '—'}</td>
            <td>{r.position || '—'}</td>
            <td>{r.startDate || '—'}</td>
            <td>{r.endDate || '—'}</td>
            <td><Tag value={r.status} map={EMPLOYMENT_STATUS_TAG} /></td>
            {canEditPage && (
              <td className="row-actions">
                <button onClick={() => onEdit(r)}>編輯</button>
                <button className="danger" onClick={() => onRemove(r.id)}>刪除</button>
              </td>
            )}
          </tr>
        ))}
        {items.length === 0 && <tr><td colSpan={canEditPage ? 7 : 6} className="muted">沒有資料</td></tr>}
      </tbody>
    </table></div>
  );
}

function EmploymentFormModal({ initial, jobSeekers, onCancel, onSave }) {
  const [form, setForm] = useState(initial);

  // 選擇求職者時，客戶/派駐單位、到職日同步帶入求職者資訊（仍可手動修改）。
  function handleJobSeekerChange(id) {
    const s = jobSeekers.find((x) => x.id === id);
    setForm({ ...form, jobSeekerId: id, client: s?.client || form.client, startDate: s?.startDate || form.startDate });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯在職/離職紀錄' : '新增在職/離職紀錄'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              求職者
              <select required value={form.jobSeekerId || ''} onChange={(e) => handleJobSeekerChange(e.target.value)}>
                <option value="" disabled>請選擇</option>
                {jobSeekers.map((s) => <option key={s.id} value={s.id}>{s.chineseName}</option>)}
              </select>
            </label>
            <label>
              客戶/派駐單位
              <input value={form.client || ''} onChange={(e) => setForm({ ...form, client: e.target.value })} />
            </label>
            <label>
              職務
              <input value={form.position || ''} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </label>
            <label>
              到職日
              <input type="date" value={form.startDate || ''} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </label>
            <label>
              離職日
              <input type="date" value={form.endDate || ''} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </label>
            <label>
              底薪
              <input type="number" value={form.salary || ''} onChange={(e) => setForm({ ...form, salary: e.target.value })} />
            </label>
            <label>
              狀態
              <select value={form.status || '在職'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
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
