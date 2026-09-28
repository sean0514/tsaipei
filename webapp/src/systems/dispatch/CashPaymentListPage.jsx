import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'jobSeekerId', label: '求職者ID' }, { key: 'client', label: '客戶/派駐單位' },
  { key: 'amount', label: '金額' }, { key: 'payDate', label: '發放日期' }, { key: 'notes', label: '備註' }, { key: 'reviewStatus', label: '審核狀態' },
];

export default function CashPaymentListPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'applicationForms', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('dispatch_cashPaymentList');
  const { rows: jobSeekers } = useCollection('dispatch_jobSeekers');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('dispatch_cashPaymentList', CSV_FIELDS, { entityLabel: '領現名單', requiredKeys: ['jobSeekerId'], canEdit: canEditPage });

  function jobSeeker(id) {
    return jobSeekers.find((x) => x.id === id);
  }
  function jobSeekerName(id) {
    return jobSeeker(id)?.chineseName || '(未設定)';
  }

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows.filter((r) => !searchQuery || `${jobSeekerName(r.jobSeekerId)} ${r.client || ''}`.toLowerCase().includes(searchQuery));
  // 尚未核准之前一律放在「審核中」；核准後再依求職者目前的在職/離職狀態分類。
  const pending = filtered.filter((r) => r.reviewStatus !== '已核准');
  const approved = filtered.filter((r) => r.reviewStatus === '已核准');
  const active = approved.filter((r) => jobSeeker(r.jobSeekerId)?.status !== '離職');
  const departed = approved.filter((r) => jobSeeker(r.jobSeekerId)?.status === '離職');

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ reviewStatus: '審核中', ...data });
    }
    setEditing(null);
  }

  async function handleApprove(id) {
    await update(id, { reviewStatus: '已核准' });
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>領現名單</h2>
          <div className="page-desc">現金發放申請，尚未核准前列於審核中，核准後依在職/離職分類{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增領現申請</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「求職者ID」欄位）；上傳後會完全取代目前所有領現名單資料，請先下載備份再匯入。</p>}
      <input placeholder="搜尋姓名或客戶" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card" style={{ overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>審核中 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{pending.length} 筆</span></h3>
            <CashPaymentTable items={pending} canEditPage={canEditPage} jobSeekerName={jobSeekerName} onEdit={setEditing} onRemove={remove} onApprove={handleApprove} showApprove />
          </div>
          <div className="card" style={{ overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>在職 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{active.length} 筆</span></h3>
            <CashPaymentTable items={active} canEditPage={canEditPage} jobSeekerName={jobSeekerName} onEdit={setEditing} onRemove={remove} />
          </div>
          <div className="card" style={{ overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>離職 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{departed.length} 筆</span></h3>
            <CashPaymentTable items={departed} canEditPage={canEditPage} jobSeekerName={jobSeekerName} onEdit={setEditing} onRemove={remove} />
          </div>
        </div>
      )}
      {editing && <CashPaymentFormModal initial={editing} jobSeekers={jobSeekers} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function CashPaymentTable({ items, canEditPage, jobSeekerName, onEdit, onRemove, onApprove, showApprove }) {
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>姓名</th><th>客戶/派駐單位</th><th>金額</th><th>發放日期</th><th>備註</th>{canEditPage && <th></th>}</tr></thead>
      <tbody>
        {items.map((r) => (
          <tr key={r.id}>
            <td>{jobSeekerName(r.jobSeekerId)}</td>
            <td>{r.client || '—'}</td>
            <td>{r.amount ? Number(r.amount).toLocaleString() : '—'}</td>
            <td>{r.payDate || '—'}</td>
            <td>{r.notes || '—'}</td>
            {canEditPage && (
              <td className="row-actions">
                <button onClick={() => onEdit(r)}>編輯</button>
                <button className="danger" onClick={() => onRemove(r.id)}>刪除</button>
                {showApprove && <button onClick={() => onApprove(r.id)}>核准</button>}
              </td>
            )}
          </tr>
        ))}
        {items.length === 0 && <tr><td colSpan={canEditPage ? 6 : 5} className="muted">沒有資料</td></tr>}
      </tbody>
    </table></div>
  );
}

function CashPaymentFormModal({ initial, jobSeekers, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯領現申請' : '新增領現申請'}</h3>
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
              金額
              <input type="number" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            <label>
              發放日期
              <input type="date" value={form.payDate || ''} onChange={(e) => setForm({ ...form, payDate: e.target.value })} />
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
