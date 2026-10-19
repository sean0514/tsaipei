import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const CURRENCIES = ['台幣', '美金'];

const STATUSES = ['待審核', '已核准', '已匯款', '退回'];
// 已匯款之後的「封存」只開放財務人員（跟系統管理員）能按，跟日常支出
// 申請／國外補助申請／郵資費用紀錄同一套規則。
const ARCHIVE_ROLES = ['系統管理員', '財務人員'];

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
    .filter((r) => !searchQuery || `${r.company || ''} ${studentName(r.studentId)}`.toLowerCase().includes(searchQuery));

  const groups = { 待審核: [], 已核准: [], 已匯款: [], 退回: [] };
  filtered.forEach((r) => groups[STATUSES.includes(r.status) ? r.status : '待審核'].push(r));
  STATUSES.forEach((s) => groups[s].sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ currency: '台幣', status: '待審核', ...data });
    }
    setEditing(null);
  }

  // 複製成新的一筆待審核紀錄，不帶 id/status，其他欄位照抄。
  function handleDuplicate(r) {
    const { id, status, ...rest } = r;
    setEditing({ ...rest });
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>國外付款紀錄</h2>
          <div className="page-desc">依待審核／已核准／已匯款／退回分類；「國外補助申請」核准後會自動帶入一筆對應紀錄；已核准的紀錄可以按「結案」歸檔，已匯款的紀錄可以按「封存」歸檔（僅財務人員／系統管理員），結案或封存後從列表隱藏（資料還在，下載完整資料時仍會包含）{!canEditPage && '（唯讀）'}</div>
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
          {STATUSES.map((status) => (
            <div className="card" key={status}>
              <h3 style={{ marginTop: 0 }}>{status} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[status].length} 筆</span></h3>
              <div className="table-wrap"><table>
                <thead><tr><th>單位名稱</th><th>付款時間</th><th>學生</th><th>金額</th><th>國外回款1</th><th>國外回款2</th><th>國外回款3</th><th>剩餘金額</th><th>備註</th>{canEditPage && <th></th>}</tr></thead>
                <tbody>
                  {groups[status].map((r) => (
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
                          {status === '待審核' && (
                            <>
                              <button onClick={() => update(r.id, { status: '已核准' })}>已核准</button>
                              <button onClick={() => update(r.id, { status: '已匯款' })}>已匯款</button>
                              <button onClick={() => update(r.id, { status: '退回' })}>退回</button>
                            </>
                          )}
                          {status === '已核准' && (
                            <>
                              <button onClick={() => update(r.id, { status: '已匯款' })}>已匯款</button>
                              <button onClick={() => update(r.id, { status: '待審核' })}>退回(回到待審核)</button>
                            </>
                          )}
                          {status === '已匯款' && (
                            <button onClick={() => update(r.id, { status: '已核准' })}>退回(回到已核准)</button>
                          )}
                          {status === '退回' && STATUSES.filter((s) => s !== status).map((s) => (
                            <button key={s} onClick={() => update(r.id, { status: s })}>{s}</button>
                          ))}
                          <button onClick={() => setEditing(r)}>編輯</button>
                          {(status === '待審核' || status === '退回') && <button onClick={() => handleDuplicate(r)}>複製</button>}
                          {status === '已核准' && <button onClick={() => update(r.id, { confirmedClosed: true })}>結案</button>}
                          {status === '已匯款' && canArchive() && <button onClick={() => update(r.id, { archived: true })}>封存</button>}
                          <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {groups[status].length === 0 && <tr><td colSpan={canEditPage ? 10 : 9} className="muted">沒有資料</td></tr>}
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
