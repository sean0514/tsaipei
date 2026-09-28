import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
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

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>在職/離職概況</h2>
          <div className="page-desc">依在職與離職分類，追蹤派駐客戶的員工狀態{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增紀錄</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「求職者ID」欄位）；上傳後會完全取代目前所有在職/離職紀錄，請先下載備份再匯入。</p>}
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
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯在職/離職紀錄' : '新增在職/離職紀錄'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              求職者
              <select required value={form.jobSeekerId || ''} onChange={(e) => setForm({ ...form, jobSeekerId: e.target.value })}>
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
