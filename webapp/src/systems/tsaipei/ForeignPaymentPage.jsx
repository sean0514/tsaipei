import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const CURRENCIES = ['台幣', '美金'];

// 「待審核／已核准／退回」這幾個狀態分類拿掉了（依使用者要求簡化），
// 這個頁面現在只會有一種狀態：已匯款——新增紀錄跟「國外補助申請」核准後
// 自動帶入的紀錄都直接是已匯款，不再需要審核流程。status 欄位還是留著
// 寫死成「已匯款」，CompanyProfitLossPage.jsx 的損益計算跟 CSV 欄位都還
// 看得到，不用動那邊的程式。
// 封存只開放會計/財務人員（跟系統管理員）能按，其他角色只能按「刪除」。
const ARCHIVE_ROLES = ['系統管理員', '會計人員', '財務人員'];

const FIELDS = [
  { key: 'paymentDate', label: '付款時間', type: 'date' },
  { key: 'company', label: '單位名稱', required: true },
  { key: 'studentId', label: '學生', type: 'student' },
  { key: 'currency', label: '幣別', type: 'currency' },
  { key: 'amount', label: '金額', type: 'number' },
  { key: 'twdAmount', label: '台幣金額(美金時填，公司損益需要台幣金額才能算進去)', type: 'number' },
  { key: 'foreignRefund1', label: '國外回款1', type: 'number' },
  { key: 'foreignRefund1Date', label: '國外回款1日期', type: 'date' },
  { key: 'foreignRefund2', label: '國外回款2', type: 'number' },
  { key: 'foreignRefund2Date', label: '國外回款2日期', type: 'date' },
  { key: 'foreignRefund3', label: '國外回款3', type: 'number' },
  { key: 'foreignRefund3Date', label: '國外回款3日期', type: 'date' },
  { key: 'notes', label: '備註' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'status', label: '審核狀態' }, { key: 'confirmedClosed', label: '結案' }, { key: 'archived', label: '封存' }];

export default function ForeignPaymentPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'foreignPayment', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_foreignPayments');
  const { rows: students } = useCollection('tsaipei_students');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_foreignPayments', CSV_FIELDS, { entityLabel: '國外付款紀錄', requiredKeys: ['company'], canEdit: canEditPage });

  const studentName = (id) => { const s = students.find((x) => x.id === id); return s?.chineseName || s?.originalName || ''; };

  // 剩餘金額：金額扣掉已經收到的國外回款1/2/3，方便一眼看出這筆付款還有多少
  // 沒收回來。
  const remainingAmount = (r) =>
    (Number(r.amount) || 0) - (Number(r.foreignRefund1) || 0) - (Number(r.foreignRefund2) || 0) - (Number(r.foreignRefund3) || 0);

  const canArchive = () => canEditPage && ARCHIVE_ROLES.includes(role);

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows
    .filter((r) => !r.confirmedClosed && !r.archived)
    .filter((r) => !searchQuery || `${r.company || ''} ${studentName(r.studentId)}`.toLowerCase().includes(searchQuery))
    .sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));

  // 封存（或舊資料裡可能殘留的「結案」）後從上面清單隱藏，「顯示已封存」
  // 收合區塊點開才會渲染，不用下載完整資料 CSV 再自己篩選。
  const archivedList = rows.filter((r) => r.archived || r.confirmedClosed).sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ currency: '台幣', status: '已匯款', ...data });
    }
    setEditing(null);
  }

  // 複製成新的一筆紀錄，不帶 id，其他欄位照抄。
  function handleDuplicate(r) {
    const { id, ...rest } = r;
    setEditing({ ...rest });
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>國外付款紀錄</h2>
          <div className="page-desc">「國外補助申請」核准後會自動帶入一筆對應紀錄；可以按「封存」歸檔（僅會計/財務人員／系統管理員），封存後從列表隱藏（資料還在，下載完整資料時仍會包含，也可以在下方「顯示已封存」查詢並解除封存）{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增紀錄</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有國外付款紀錄，請先下載備份再匯入。</p>}
      <div className="row-actions" style={{ marginBottom: 16 }}>
        <input placeholder="搜尋單位名稱或學生" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        <button onClick={() => setShowArchived(!showArchived)}>{showArchived ? '隱藏' : '顯示'}已封存（{archivedList.length}）</button>
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>已匯款 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{filtered.length} 筆</span></h3>
          <div className="table-wrap"><table>
            <thead><tr><th>單位名稱</th><th>付款時間</th><th>學生</th><th>金額</th><th>國外回款1</th><th>國外回款2</th><th>國外回款3</th><th>剩餘金額</th><th>備註</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{r.company || '—'}</td>
                  <td>{r.paymentDate || '—'}</td>
                  <td>{studentName(r.studentId) || '—'}</td>
                  <td>
                    {r.amount ? `${r.currency || '台幣'} ${Number(r.amount).toLocaleString()}` : '—'}
                    {r.currency === '美金' && r.twdAmount ? `（台幣 ${Number(r.twdAmount).toLocaleString()}）` : ''}
                  </td>
                  <td>{r.foreignRefund1 ? `${Number(r.foreignRefund1).toLocaleString()}${r.foreignRefund1Date ? `（${r.foreignRefund1Date}）` : ''}` : '—'}</td>
                  <td>{r.foreignRefund2 ? `${Number(r.foreignRefund2).toLocaleString()}${r.foreignRefund2Date ? `（${r.foreignRefund2Date}）` : ''}` : '—'}</td>
                  <td>{r.foreignRefund3 ? `${Number(r.foreignRefund3).toLocaleString()}${r.foreignRefund3Date ? `（${r.foreignRefund3Date}）` : ''}` : '—'}</td>
                  <td>{r.amount ? remainingAmount(r).toLocaleString() : '—'}</td>
                  <td>{r.notes || '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button onClick={() => handleDuplicate(r)}>複製</button>
                      {canArchive() && <button onClick={() => update(r.id, { archived: true })}>封存</button>}
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={canEditPage ? 10 : 9} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}
      {!loading && showArchived && (
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>已封存 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{archivedList.length} 筆</span></h3>
          <div className="table-wrap"><table>
            <thead><tr><th>單位名稱</th><th>付款時間</th><th>學生</th><th>金額</th><th>剩餘金額</th><th>備註</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {archivedList.map((r) => (
                <tr key={r.id}>
                  <td>{r.company || '—'}</td>
                  <td>{r.paymentDate || '—'}</td>
                  <td>{studentName(r.studentId) || '—'}</td>
                  <td>
                    {r.amount ? `${r.currency || '台幣'} ${Number(r.amount).toLocaleString()}` : '—'}
                    {r.currency === '美金' && r.twdAmount ? `（台幣 ${Number(r.twdAmount).toLocaleString()}）` : ''}
                  </td>
                  <td>{r.amount ? remainingAmount(r).toLocaleString() : '—'}</td>
                  <td>{r.notes || '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      {r.archived && canArchive() && <button onClick={() => update(r.id, { archived: false })}>解除封存</button>}
                      {r.confirmedClosed && <button onClick={() => update(r.id, { confirmedClosed: false })}>取消結案</button>}
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {archivedList.length === 0 && <tr><td colSpan={canEditPage ? 7 : 6} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
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
            {FIELDS.map((f) => {
              if (f.key === 'twdAmount' && form.currency !== '美金') return null;
              if (f.key === 'studentId') {
                return (
                  <label key={f.key}>
                    學生
                    <select value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                      <option value="">（未指定）</option>
                      {students.map((s) => <option key={s.id} value={s.id}>{s.chineseName || s.originalName}</option>)}
                    </select>
                  </label>
                );
              }
              if (f.type === 'currency') {
                return (
                  <label key={f.key}>
                    {f.label}
                    <select value={form.currency || '台幣'} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                );
              }
              return (
                <label key={f.key}>
                  {f.label}
                  <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                </label>
              );
            })}
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
