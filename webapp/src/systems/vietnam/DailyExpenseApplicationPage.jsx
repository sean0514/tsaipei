import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { exportEntityCSV } from '../../lib/csv';
import { NOT_BILLABLE } from '../../lib/bonus';
import { t } from '../../lib/i18n';

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

const STATUSES = ['待審核', '已核准', '已匯款', '退回'];
const ITEM_OPTIONS = ['體檢費', '機票費', '車資費用', '宿舍設備', '水費', '電費', '瓦斯費'];
const ITEM_CUSTOM = '__custom__';
const CURRENCIES = ['台幣', '美金'];
const INVOICE_OPTIONS = ['鈞羽發票', '供應商發票', '無須發票'];
const TYPES = ['支出', '收入'];
const DORM_ITEM = '宿舍設備';
const LOCKED_STATUSES = ['已核准', '已匯款'];
const LOCKED_EDIT_ROLES = ['系統管理員', '主管', '會計人員'];

const FIELDS = [
  { key: 'applicant', label: '申請人' },
  { key: 'billToCompany', label: '須請款(實習單位)' },
  { key: 'studentId', label: '學生姓名' },
  { key: 'item', label: '項目' },
  { key: 'date', label: '日期', type: 'date' },
  { key: 'purpose', label: '用途說明', required: true },
  { key: 'amount', label: '金額', type: 'number' },
  { key: 'invoiceType', label: '是否開立發票' },
  { key: 'notes', label: '備註' },
];

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'type', label: '類型' }, ...FIELDS, { key: 'dormId', label: '宿舍ID' },
  { key: 'currency', label: '幣別' }, { key: 'status', label: '審核狀態' }, { key: 'confirmedClosed', label: '結案' },
];

// 複製自 systems/tsaipei/DailyExpenseApplicationPage.jsx，collection 字首
// 改成 vietnam_，介面文字包上 t(...)。
export default function DailyExpenseApplicationPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'dailyExpenseApplication', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('vietnam_dailyExpenseApplications');
  const { rows: users } = useCollection('vietnam_users');
  const { rows: positions } = useCollection('vietnam_positions');
  const { rows: students } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: dormitories } = useCollection('vietnam_dormitories');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('全部');
  const [month, setMonth] = useState(currentMonthStr());
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_dailyExpenseApplications', CSV_FIELDS, { entityLabel: '日常支出申請', requiredKeys: ['purpose'], canEdit: canEditPage });

  const studentName = (id) => { const s = students.find((x) => x.id === id); return s?.chineseName || s?.originalName || ''; };
  const dormName = (id) => dormitories.find((d) => d.id === id)?.name || '';
  const canModify = (r) => canEditPage && (!LOCKED_STATUSES.includes(r.status) || LOCKED_EDIT_ROLES.includes(role));

  function handleDownloadMonth() {
    const monthRows = rows.filter((r) => (r.date || '').slice(0, 7) === month);
    exportEntityCSV(monthRows, CSV_FIELDS, `日常支出申請_${month}`);
  }

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows
    .filter((r) => !r.confirmedClosed)
    .filter((r) => typeFilter === '全部' || (r.type || '支出') === typeFilter)
    .filter((r) => !searchQuery || `${r.applicant || ''} ${r.item || ''} ${r.purpose || ''}`.toLowerCase().includes(searchQuery));
  const groups = { 待審核: [], 已核准: [], 已匯款: [], 退回: [] };
  filtered.forEach((r) => groups[STATUSES.includes(r.status) ? r.status : '待審核'].push(r));
  STATUSES.forEach((s) => groups[s].sort((a, b) => (b.date || '').localeCompare(a.date || '')));

  async function handleSave(data) {
    try {
      if (data.id) {
        const { id, ...rest } = data;
        await update(id, rest);
      } else {
        await add({ status: '待審核', currency: '台幣', type: '支出', ...data });
      }
      setEditing(null);
    } catch (err) {
      alert(`存檔失敗：${err.message || err}`);
    }
  }

  function handleDuplicate(r) {
    const { id, status, ...rest } = r;
    setEditing({ ...rest });
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('日常支出申請', lang)}</h2>
          <div className="page-desc">{t('依待審核／已核准／已匯款／退回分類；已核准／已匯款的申請可以按「結案」歸檔，結案後從列表隱藏（資料還在，下載完整資料時仍會包含）', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增申請', lang)}</button>}
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button onClick={handleDownloadMonth}>{t('下載此月份資料', lang)}</button>
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有日常支出申請紀錄，請先下載備份再匯入。「下載此月份資料」依「日期」篩選。', lang)}</p>}
      <div className="row-actions" style={{ marginBottom: 16 }}>
        <input placeholder={t('搜尋申請人、項目或用途說明', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="全部">{t('全部類型', lang)}</option>
          {TYPES.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
        </select>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {STATUSES.map((status) => (
            <div className="card" key={status}>
              <h3 style={{ marginTop: 0 }}>{status}（{groups[status].length}）</h3>
              <div className="table-wrap"><table>
                <thead><tr><th>{t('類型', lang)}</th><th>{t('申請人', lang)}</th><th>{t('須請款(實習單位)', lang)}</th><th>{t('學生姓名', lang)}</th><th>{t('項目', lang)}</th><th>{t('日期', lang)}</th><th>{t('用途說明', lang)}</th><th>{t('宿舍', lang)}</th><th>{t('金額', lang)}</th><th>{t('是否開立發票', lang)}</th><th>{t('備註', lang)}</th>{canEditPage && <th></th>}</tr></thead>
                <tbody>
                  {groups[status].map((r) => (
                    <tr key={r.id}>
                      <td>{r.type || '支出'}</td>
                      <td>{r.applicant || '—'}</td>
                      <td>{r.billToCompany || '—'}</td>
                      <td>{studentName(r.studentId) || '—'}</td>
                      <td>{r.item || '—'}</td>
                      <td>{r.date || '—'}</td>
                      <td>{r.purpose || '—'}</td>
                      <td>{r.item === DORM_ITEM ? (dormName(r.dormId) || '—') : '—'}</td>
                      <td>{r.amount ? `${r.currency || '台幣'} ${Number(r.amount).toLocaleString()}` : '—'}</td>
                      <td>{r.invoiceType || '—'}</td>
                      <td>{r.notes || '—'}</td>
                      {canEditPage && (
                        <td className="row-actions">
                          {canModify(r) && STATUSES.filter((s) => s !== status).map((s) => (
                            <button key={s} onClick={() => update(r.id, { status: s })}>{s}</button>
                          ))}
                          {canModify(r) && <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>}
                          {LOCKED_STATUSES.includes(status) ? (
                            canModify(r) && <button onClick={() => update(r.id, { confirmedClosed: true })}>{t('結案', lang)}</button>
                          ) : (
                            <button onClick={() => handleDuplicate(r)}>{t('複製', lang)}</button>
                          )}
                          {canModify(r) && <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>}
                        </td>
                      )}
                    </tr>
                  ))}
                  {groups[status].length === 0 && <tr><td colSpan={canEditPage ? 12 : 11} className="muted">{t('沒有資料', lang)}</td></tr>}
                </tbody>
              </table></div>
            </div>
          ))}
        </div>
      )}
      {editing && <DailyExpenseFormModal initial={editing} users={users} positions={positions} students={students} matches={matches} dormitories={dormitories} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function DailyExpenseFormModal({ initial, users, positions, students, matches, dormitories, onCancel, onSave, lang }) {
  const [form, setForm] = useState({ type: '支出', ...initial });
  const [itemCustom, setItemCustom] = useState(initial.item && !ITEM_OPTIONS.includes(initial.item));
  const isIncome = form.type === '收入';
  const applicantLabel = isIncome ? t('填表人', lang) : t('申請人', lang);
  const applicantOptions = [...new Set(users.map((u) => u.displayName || u.email).filter(Boolean))].sort();
  const companies = [...new Set(positions.map((p) => p.company).filter(Boolean))].sort();

  function companyForStudent(studentId) {
    const m = matches.find((mm) => mm.studentId === studentId);
    return m ? positions.find((p) => p.id === m.positionId)?.company || '' : '';
  }

  const billableCompany = form.billToCompany && form.billToCompany !== NOT_BILLABLE ? form.billToCompany : '';
  const matchingStudents = students.filter((s) => s.id === form.studentId || !billableCompany || companyForStudent(s.id) === billableCompany);

  function handleBillToCompanyChange(company) {
    const billable = company && company !== NOT_BILLABLE ? company : '';
    const stillMatches = !billable || companyForStudent(form.studentId) === billable;
    setForm({ ...form, billToCompany: company, studentId: stillMatches ? form.studentId : '' });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯申請', lang) : t('新增申請', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('類型', lang)}
              <select value={form.type || '支出'} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
              </select>
            </label>
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.key === 'applicant' ? applicantLabel : t(f.label, lang)}
                {f.key === 'applicant' ? (
                  <select value={form.applicant || ''} onChange={(e) => setForm({ ...form, applicant: e.target.value })}>
                    <option value="">{t('請選擇', lang)}</option>
                    {applicantOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.key === 'billToCompany' ? (
                  <select value={form.billToCompany || NOT_BILLABLE} onChange={(e) => handleBillToCompanyChange(e.target.value)}>
                    <option value={NOT_BILLABLE}>{NOT_BILLABLE}</option>
                    {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : f.key === 'studentId' ? (
                  <select value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                    <option value="">{t('（不限）', lang)}</option>
                    {matchingStudents.map((s) => <option key={s.id} value={s.id}>{s.chineseName || s.originalName}</option>)}
                  </select>
                ) : f.key === 'item' ? (
                  <>
                    <select
                      value={itemCustom ? ITEM_CUSTOM : (form.item || '')}
                      onChange={(e) => {
                        if (e.target.value === ITEM_CUSTOM) { setItemCustom(true); setForm({ ...form, item: '' }); }
                        else { setItemCustom(false); setForm({ ...form, item: e.target.value }); }
                      }}
                    >
                      <option value="">{t('請選擇', lang)}</option>
                      {ITEM_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      <option value={ITEM_CUSTOM}>{t('自行輸入…', lang)}</option>
                    </select>
                    {itemCustom && (
                      <input style={{ marginTop: 6 }} placeholder={t('自行輸入項目名稱', lang)} value={form.item || ''} onChange={(e) => setForm({ ...form, item: e.target.value })} />
                    )}
                    {form.item === DORM_ITEM && (
                      <select style={{ marginTop: 6 }} value={form.dormId || ''} onChange={(e) => setForm({ ...form, dormId: e.target.value })}>
                        <option value="">{t('請選擇宿舍', lang)}</option>
                        {dormitories.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    )}
                  </>
                ) : f.key === 'amount' ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select style={{ width: 90 }} value={form.currency || '台幣'} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="number" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  </div>
                ) : f.key === 'invoiceType' ? (
                  <select value={form.invoiceType || ''} onChange={(e) => setForm({ ...form, invoiceType: e.target.value })}>
                    <option value="">{t('請選擇', lang)}</option>
                    {INVOICE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
            {initial.id && (
              <label>
                {t('審核狀態', lang)}
                <select value={form.status || '待審核'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="row-actions">
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
