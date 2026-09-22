import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const STATUSES = ['待審核', '已核准', '已匯款', '退回'];

const FIELDS = [
  { key: 'date', label: '日期', type: 'date' },
  { key: 'purpose', label: '用途說明', required: true },
  { key: 'amount', label: '金額', type: 'number' },
  { key: 'notes', label: '備註' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' }, ...FIELDS, { key: 'status', label: '審核狀態' }];

export default function DailyExpenseApplicationPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'applicationForms', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_dailyExpenseApplications');
  const { rows: students } = useCollection('tsaipei_students');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_dailyExpenseApplications', CSV_FIELDS, { entityLabel: '日常支出申請', requiredKeys: ['purpose'], canEdit: canEditPage });

  const studentName = (id) => { const s = students.find((x) => x.id === id); return s?.chineseName || s?.originalName || ''; };

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows.filter((r) => !searchQuery || `${studentName(r.studentId)} ${r.purpose || ''}`.toLowerCase().includes(searchQuery));
  const groups = { 待審核: [], 已核准: [], 已匯款: [], 退回: [] };
  filtered.forEach((r) => groups[STATUSES.includes(r.status) ? r.status : '待審核'].push(r));
  STATUSES.forEach((s) => groups[s].sort((a, b) => (b.date || '').localeCompare(a.date || '')));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ status: '待審核', ...data });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>日常支出申請</h2>
          <div className="page-desc">依待審核／已核准／已匯款／退回分類{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增申請</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有日常支出申請紀錄，請先下載備份再匯入。</p>}
      <input placeholder="搜尋學生或用途說明" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {STATUSES.map((status) => (
            <div className="card" key={status}>
              <h3 style={{ marginTop: 0 }}>{status}（{groups[status].length}）</h3>
              <div className="table-wrap"><table>
                <thead><tr><th>日期</th><th>學生</th><th>用途說明</th><th>金額</th><th>備註</th>{canEditPage && <th></th>}</tr></thead>
                <tbody>
                  {groups[status].map((r) => (
                    <tr key={r.id}>
                      <td>{r.date || '—'}</td>
                      <td>{studentName(r.studentId) || '—'}</td>
                      <td>{r.purpose || '—'}</td>
                      <td>{r.amount ? Number(r.amount).toLocaleString() : '—'}</td>
                      <td>{r.notes || '—'}</td>
                      {canEditPage && (
                        <td className="row-actions">
                          {STATUSES.filter((s) => s !== status).map((s) => (
                            <button key={s} onClick={() => update(r.id, { status: s })}>{s}</button>
                          ))}
                          <button onClick={() => setEditing(r)}>編輯</button>
                          <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {groups[status].length === 0 && <tr><td colSpan={canEditPage ? 6 : 5} className="muted">沒有資料</td></tr>}
                </tbody>
              </table></div>
            </div>
          ))}
        </div>
      )}
      {editing && <DailyExpenseFormModal initial={editing} students={students} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function DailyExpenseFormModal({ initial, students, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯申請' : '新增申請'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              學生
              <select value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                <option value="">（未指定）</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.chineseName || s.originalName}</option>)}
              </select>
            </label>
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
            {initial.id && (
              <label>
                審核狀態
                <select value={form.status || '待審核'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            )}
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
