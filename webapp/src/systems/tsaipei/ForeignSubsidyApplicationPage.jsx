import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { exportEntityCSV } from '../../lib/csv';

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

// 核准後自動在「國外付款紀錄」帶入/同步一筆待付款紀錄，單位名稱直接用學生
// 來源(國外供應商)，方便該頁依供應商分類、對帳。用 sourceApplicationId 找
// 對應的付款紀錄：還沒有就新增（預設未付款），已經有就更新欄位內容——這樣
// 已核准後才修改申請內容（金額、學生來源…）也會同步過去，但不會動使用者
// 自己在國外付款紀錄那邊維護的「是否已付款」狀態。
async function syncApprovedPayment(app) {
  if (app.status !== '已核准') return;
  const snap = await getDocs(query(collection(db, 'tsaipei_foreignPayments'), where('sourceApplicationId', '==', app.id)));
  const payload = {
    sourceApplicationId: app.id,
    company: app.sourceSupplier || '',
    studentId: app.studentId || '',
    amount: app.amount || '',
    currency: app.currency || '台幣',
    paymentDate: app.remittanceDate || '',
    notes: app.purpose || '',
  };
  if (snap.empty) {
    await addDoc(collection(db, 'tsaipei_foreignPayments'), { ...payload, paid: '否' });
  } else {
    await updateDoc(snap.docs[0].ref, payload);
  }
}

const STATUSES = ['待審核', '已核准', '已匯款', '退回'];

const CURRENCIES = ['台幣', '美金'];

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'applicant', label: '申請人' }, { key: 'sourceSupplier', label: '學生來源(國外供應商)' }, { key: 'studentId', label: '學生ID' },
  { key: 'remittanceDate', label: '匯款日期' }, { key: 'purpose', label: '用途說明' }, { key: 'currency', label: '幣別' }, { key: 'amount', label: '金額' },
  { key: 'notes', label: '備註' }, { key: 'status', label: '審核狀態' },
];

export default function ForeignSubsidyApplicationPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'applicationForms', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_foreignSubsidyApplications');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: users } = useCollection('tsaipei_users');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [month, setMonth] = useState(currentMonthStr());
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_foreignSubsidyApplications', CSV_FIELDS, { entityLabel: '國外補助申請', requiredKeys: ['purpose'], canEdit: canEditPage });

  const studentName = (id) => { const s = students.find((x) => x.id === id); return s?.chineseName || s?.originalName || ''; };

  function handleDownloadMonth() {
    const monthRows = rows.filter((r) => (r.remittanceDate || '').slice(0, 7) === month);
    exportEntityCSV(monthRows, CSV_FIELDS, `國外補助申請_${month}`);
  }

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows.filter((r) => !searchQuery || `${r.applicant || ''} ${studentName(r.studentId)} ${r.sourceSupplier || ''} ${r.purpose || ''}`.toLowerCase().includes(searchQuery));
  const groups = { 待審核: [], 已核准: [], 已匯款: [], 退回: [] };
  filtered.forEach((r) => groups[STATUSES.includes(r.status) ? r.status : '待審核'].push(r));
  STATUSES.forEach((s) => groups[s].sort((a, b) => (b.remittanceDate || '').localeCompare(a.remittanceDate || '')));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
      await syncApprovedPayment({ ...rest, id });
    } else {
      await add({ status: '待審核', currency: '台幣', ...data });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>國外補助申請</h2>
          <div className="page-desc">依待審核／已核准／已匯款／退回分類{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增申請</button>}
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button onClick={handleDownloadMonth}>下載此月份資料</button>
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有國外補助申請紀錄，請先下載備份再匯入。「下載此月份資料」依「匯款日期」篩選。</p>}
      <input placeholder="搜尋申請人、學生、學生來源或用途說明" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {STATUSES.map((status) => (
            <div className="card" key={status}>
              <h3 style={{ marginTop: 0 }}>{status}（{groups[status].length}）</h3>
              <div className="table-wrap"><table>
                <thead><tr><th>申請人</th><th>學生來源</th><th>學生</th><th>匯款日期</th><th>用途說明</th><th>金額</th><th>備註</th>{canEditPage && <th></th>}</tr></thead>
                <tbody>
                  {groups[status].map((r) => (
                    <tr key={r.id}>
                      <td>{r.applicant || '—'}</td>
                      <td>{r.sourceSupplier || '—'}</td>
                      <td>{studentName(r.studentId) || '—'}</td>
                      <td>{r.remittanceDate || '—'}</td>
                      <td>{r.purpose || '—'}</td>
                      <td>{r.amount ? `${r.currency || '台幣'} ${Number(r.amount).toLocaleString()}` : '—'}</td>
                      <td>{r.notes || '—'}</td>
                      {canEditPage && (
                        <td className="row-actions">
                          {STATUSES.filter((s) => s !== status).map((s) => (
                            <button key={s} onClick={async () => { await update(r.id, { status: s }); await syncApprovedPayment({ ...r, status: s }); }}>{s}</button>
                          ))}
                          <button onClick={() => setEditing(r)}>編輯</button>
                          <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {groups[status].length === 0 && <tr><td colSpan={canEditPage ? 8 : 7} className="muted">沒有資料</td></tr>}
                </tbody>
              </table></div>
            </div>
          ))}
        </div>
      )}
      {editing && <ForeignSubsidyFormModal initial={editing} students={students} users={users} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function ForeignSubsidyFormModal({ initial, students, users, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const sources = [...new Set(students.map((s) => s.sourceSupplier).filter(Boolean))].sort();
  const applicantOptions = [...new Set(users.map((u) => u.displayName || u.email).filter(Boolean))].sort();
  const matchingStudents = form.sourceSupplier ? students.filter((s) => s.sourceSupplier === form.sourceSupplier) : students;

  function handleSourceChange(source) {
    const stillMatches = students.find((s) => s.id === form.studentId)?.sourceSupplier === source;
    setForm({ ...form, sourceSupplier: source, studentId: stillMatches ? form.studentId : '' });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯申請' : '新增申請'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              申請人
              <select value={form.applicant || ''} onChange={(e) => setForm({ ...form, applicant: e.target.value })}>
                <option value="">請選擇</option>
                {applicantOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label>
              學生來源(國外供應商)
              <select value={form.sourceSupplier || ''} onChange={(e) => handleSourceChange(e.target.value)}>
                <option value="">（不限）</option>
                {sources.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>
              學生名字
              <select required value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                <option value="" disabled>請選擇</option>
                {matchingStudents.map((s) => <option key={s.id} value={s.id}>{s.chineseName || s.originalName}</option>)}
              </select>
            </label>
            <label>
              匯款日期
              <input type="date" value={form.remittanceDate || ''} onChange={(e) => setForm({ ...form, remittanceDate: e.target.value })} />
            </label>
            <label>
              幣別
              <select value={form.currency || '台幣'} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              金額
              <input type="number" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              用途說明
              <input required value={form.purpose || ''} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              備註
              <input value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
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
