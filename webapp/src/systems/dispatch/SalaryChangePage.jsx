import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const STATUSES = ['待審核', '已核准', '退回'];

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'jobSeekerId', label: '求職者ID' }, { key: 'client', label: '客戶/派駐單位' },
  { key: 'currentSalary', label: '原薪資' }, { key: 'newSalary', label: '調整後薪資' }, { key: 'effectiveDate', label: '生效日期' },
  { key: 'reason', label: '異動原因' }, { key: 'notes', label: '備註' }, { key: 'status', label: '審核狀態' },
];

export default function SalaryChangePage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'applicationForms', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('dispatch_salaryChanges');
  const { rows: jobSeekers } = useCollection('dispatch_jobSeekers');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('dispatch_salaryChanges', CSV_FIELDS, { entityLabel: '薪資異動', requiredKeys: ['jobSeekerId'], canEdit: canEditPage });

  function jobSeekerName(id) {
    const s = jobSeekers.find((x) => x.id === id);
    return s?.chineseName || '(未設定)';
  }

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows.filter((r) => !searchQuery || `${jobSeekerName(r.jobSeekerId)} ${r.client || ''}`.toLowerCase().includes(searchQuery));
  const groups = { 待審核: [], 已核准: [], 退回: [] };
  filtered.forEach((r) => groups[STATUSES.includes(r.status) ? r.status : '待審核'].push(r));
  STATUSES.forEach((s) => groups[s].sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || '')));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ status: '待審核', ...data });
    }
    setEditing(null);
  }

  // 核准時把調整後薪資同步寫回「在職/離職概況」的底薪欄位（依求職者ID找對應紀錄）。
  async function handleStatusChange(r, status) {
    await update(r.id, { status });
    if (status === '已核准' && r.jobSeekerId) {
      const existing = await getDocs(query(collection(db, 'dispatch_employmentStatus'), where('jobSeekerId', '==', r.jobSeekerId)));
      if (!existing.empty) {
        const batch = writeBatch(db);
        existing.docs.forEach((d) => batch.update(d.ref, { salary: r.newSalary || '' }));
        await batch.commit();
      }
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>薪資異動</h2>
          <div className="page-desc">依待審核／已核准／退回分類，核准後自動同步底薪到在職/離職概況{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增薪資異動申請</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「求職者ID」欄位）；上傳後會完全取代目前所有薪資異動紀錄，請先下載備份再匯入。核准後會自動把調整後薪資同步到「在職/離職概況」的底薪欄位。</p>}
      <input placeholder="搜尋求職者或客戶" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {STATUSES.map((status) => (
            <div className="card" key={status}>
              <h3 style={{ marginTop: 0 }}>{status}（{groups[status].length}）</h3>
              <div className="table-wrap"><table>
                <thead><tr><th>求職者</th><th>客戶/派駐單位</th><th>原薪資</th><th>調整後薪資</th><th>生效日期</th><th>異動原因</th>{canEditPage && <th></th>}</tr></thead>
                <tbody>
                  {groups[status].map((r) => (
                    <tr key={r.id}>
                      <td>{jobSeekerName(r.jobSeekerId)}</td>
                      <td>{r.client || '—'}</td>
                      <td>{r.currentSalary ? Number(r.currentSalary).toLocaleString() : '—'}</td>
                      <td>{r.newSalary ? Number(r.newSalary).toLocaleString() : '—'}</td>
                      <td>{r.effectiveDate || '—'}</td>
                      <td>{r.reason || '—'}</td>
                      {canEditPage && (
                        <td className="row-actions">
                          {STATUSES.filter((s) => s !== status).map((s) => (
                            <button key={s} onClick={() => handleStatusChange(r, s)}>{s}</button>
                          ))}
                          <button onClick={() => setEditing(r)}>編輯</button>
                          <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {groups[status].length === 0 && <tr><td colSpan={canEditPage ? 7 : 6} className="muted">沒有資料</td></tr>}
                </tbody>
              </table></div>
            </div>
          ))}
        </div>
      )}
      {editing && <SalaryChangeFormModal initial={editing} jobSeekers={jobSeekers} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function SalaryChangeFormModal({ initial, jobSeekers, onCancel, onSave }) {
  const [form, setForm] = useState(initial);

  // 選擇求職者時，客戶/派駐單位同步帶入求職者資訊的廠商名稱（仍可手動修改）。
  function handleJobSeekerChange(id) {
    const s = jobSeekers.find((x) => x.id === id);
    setForm({ ...form, jobSeekerId: id, client: s?.client || form.client });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯薪資異動申請' : '新增薪資異動申請'}</h3>
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
              原薪資
              <input type="number" value={form.currentSalary || ''} onChange={(e) => setForm({ ...form, currentSalary: e.target.value })} />
            </label>
            <label>
              調整後薪資
              <input type="number" required value={form.newSalary || ''} onChange={(e) => setForm({ ...form, newSalary: e.target.value })} />
            </label>
            <label>
              生效日期
              <input type="date" value={form.effectiveDate || ''} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              異動原因
              <input value={form.reason || ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
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
