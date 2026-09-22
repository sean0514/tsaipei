import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const FIELDS = [
  { key: 'paymentDate', label: '付款時間', type: 'date' },
  { key: 'company', label: '單位名稱', required: true },
  { key: 'studentId', label: '學生', type: 'student' },
  { key: 'amount', label: '金額', type: 'number' },
  { key: 'notes', label: '備註' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'paid', label: '是否已付款' }];

export default function ForeignPaymentPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'bonus', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_foreignPayments');
  const { rows: students } = useCollection('tsaipei_students');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_foreignPayments', CSV_FIELDS, { entityLabel: '國外付款紀錄', requiredKeys: ['company'], canEdit: canEditPage });

  const studentName = (id) => { const s = students.find((x) => x.id === id); return s?.chineseName || s?.originalName || ''; };

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows.filter((r) => !searchQuery || `${r.company || ''} ${studentName(r.studentId)}`.toLowerCase().includes(searchQuery));
  const groups = { 未付款: [], 已付款: [] };
  filtered.forEach((r) => groups[r.paid === '是' ? '已付款' : '未付款'].push(r));
  [groups.未付款, groups.已付款].forEach((list) => list.sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add(data);
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>國外付款紀錄</h2>
          <div className="page-desc">依已付款／未付款分類{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增紀錄</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有國外付款紀錄，請先下載備份再匯入。</p>}
      <input placeholder="搜尋單位名稱或學生" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {['未付款', '已付款'].map((label) => (
            <div className="card" key={label}>
              <h3 style={{ marginTop: 0 }}>{label}（{groups[label].length}）</h3>
              <div className="table-wrap"><table>
                <thead><tr><th>付款時間</th><th>單位名稱</th><th>學生</th><th>金額</th><th>備註</th>{canEditPage && <th></th>}</tr></thead>
                <tbody>
                  {groups[label].map((r) => (
                    <tr key={r.id}>
                      <td>{r.paymentDate || '—'}</td>
                      <td>{r.company || '—'}</td>
                      <td>{studentName(r.studentId) || '—'}</td>
                      <td>{r.amount ? Number(r.amount).toLocaleString() : '—'}</td>
                      <td>{r.notes || '—'}</td>
                      {canEditPage && (
                        <td className="row-actions">
                          {label === '未付款' && <button onClick={() => update(r.id, { paid: '是' })}>標記已付款</button>}
                          {label === '已付款' && <button onClick={() => update(r.id, { paid: '否' })}>取消已付款</button>}
                          <button onClick={() => setEditing(r)}>編輯</button>
                          <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {groups[label].length === 0 && <tr><td colSpan={canEditPage ? 6 : 5} className="muted">沒有資料</td></tr>}
                </tbody>
              </table></div>
            </div>
          ))}
        </div>
      )}
      {editing && <ForeignPaymentFormModal initial={editing} students={students} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function ForeignPaymentFormModal({ initial, students, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯付款紀錄' : '新增付款紀錄'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => f.key === 'studentId' ? (
              <label key={f.key}>
                學生
                <select value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                  <option value="">（未指定）</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.chineseName || s.originalName}</option>)}
                </select>
              </label>
            ) : (
              <label key={f.key}>
                {f.label}
                <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
            <label>
              是否已付款
              <select value={form.paid === '是' ? '是' : '否'} onChange={(e) => setForm({ ...form, paid: e.target.value })}>
                <option value="否">否</option>
                <option value="是">是</option>
              </select>
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
