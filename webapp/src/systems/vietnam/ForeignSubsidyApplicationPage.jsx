import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { exportEntityCSV } from '../../lib/csv';
import { t } from '../../lib/i18n';

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

const SYNCED_STATUSES = ['已核准', '已匯款'];
async function syncApprovedPayment(app) {
  if (!SYNCED_STATUSES.includes(app.status)) return;
  const snap = await getDocs(query(collection(db, 'vietnam_foreignPayments'), where('sourceApplicationId', '==', app.id)));
  const payload = {
    sourceApplicationId: app.id,
    company: app.sourceSupplier || '',
    studentId: app.studentId || '',
    amount: app.amount || '',
    currency: app.currency || '台幣',
    twdAmount: app.currency === '美金' ? (app.twdAmount || '') : '',
    paymentDate: app.remittanceDate || '',
    notes: app.purpose || '',
  };
  if (snap.empty) {
    await addDoc(collection(db, 'vietnam_foreignPayments'), { ...payload, paid: '否' });
  } else {
    await updateDoc(snap.docs[0].ref, payload);
  }
}

const STATUSES = ['待審核', '已核准', '已匯款', '退回'];
const CURRENCIES = ['台幣', '美金'];

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'applicant', label: '申請人' }, { key: 'sourceSupplier', label: '學生來源(國外供應商)' }, { key: 'studentId', label: '學生ID' },
  { key: 'school', label: '就讀學校' }, { key: 'internshipCompany', label: '實習單位' },
  { key: 'remittanceDate', label: '匯款日期' }, { key: 'purpose', label: '用途說明' }, { key: 'currency', label: '幣別' }, { key: 'amount', label: '金額' }, { key: 'twdAmount', label: '台幣金額' },
  { key: 'notes', label: '備註' }, { key: 'status', label: '審核狀態' },
];

// 複製自 systems/tsaipei/ForeignSubsidyApplicationPage.jsx，collection
// 字首改成 vietnam_，介面文字包上 t(...)。
export default function ForeignSubsidyApplicationPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'foreignSubsidyApplication', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('vietnam_foreignSubsidyApplications');
  const { rows: students } = useCollection('vietnam_students');
  const { rows: users } = useCollection('vietnam_users');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: positions } = useCollection('vietnam_positions');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [month, setMonth] = useState(currentMonthStr());
  const [backfilling, setBackfilling] = useState(false);
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_foreignSubsidyApplications', CSV_FIELDS, { entityLabel: '國外補助申請', requiredKeys: ['purpose'], canEdit: canEditPage });

  async function handleBackfillSync() {
    const targets = rows.filter((r) => SYNCED_STATUSES.includes(r.status));
    if (!targets.length) { alert('沒有已核准或已匯款的申請需要同步。'); return; }
    if (!window.confirm(`確定要重新同步 ${targets.length} 筆已核准/已匯款的申請到國外付款紀錄嗎？`)) return;
    setBackfilling(true);
    try {
      for (const r of targets) await syncApprovedPayment(r);
      alert(`已同步 ${targets.length} 筆申請。`);
    } catch (err) {
      alert(`同步失敗：${err.message || err}`);
    } finally {
      setBackfilling(false);
    }
  }

  const studentName = (id) => { const s = students.find((x) => x.id === id); return s?.chineseName || s?.originalName || ''; };
  const schoolName = (r) => r.school || students.find((x) => x.id === r.studentId)?.school || '';
  const companyForStudent = (id) => {
    const m = matches.find((mm) => mm.studentId === id);
    return m ? positions.find((p) => p.id === m.positionId)?.company || '' : '';
  };
  const companyName = (r) => r.internshipCompany || companyForStudent(r.studentId);

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
          <h2>{t('國外補助申請', lang)}</h2>
          <div className="page-desc">{t('依待審核／已核准／已匯款／退回分類', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增申請', lang)}</button>}
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button onClick={handleDownloadMonth}>{t('下載此月份資料', lang)}</button>
          {canEditPage && <button onClick={handleBackfillSync} disabled={backfilling}>{backfilling ? t('同步中…', lang) : t('補同步國外付款紀錄', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有國外補助申請紀錄，請先下載備份再匯入。「下載此月份資料」依「匯款日期」篩選。「補同步國外付款紀錄」會把所有已核准/已匯款的申請重新同步一次到國外付款紀錄(修正舊版只在剛核准那一刻同步、之後轉已匯款就不再同步的問題)。', lang)}</p>}
      <input placeholder={t('搜尋申請人、學生、學生來源或用途說明', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {STATUSES.map((status) => (
            <div className="card" key={status}>
              <h3 style={{ marginTop: 0 }}>{status}（{groups[status].length}）</h3>
              <div className="table-wrap"><table>
                <thead><tr><th>{t('申請人', lang)}</th><th>{t('學生來源', lang)}</th><th>{t('學生', lang)}</th><th>{t('就讀學校', lang)}</th><th>{t('實習單位', lang)}</th><th>{t('匯款日期', lang)}</th><th>{t('用途說明', lang)}</th><th>{t('金額', lang)}</th><th>{t('備註', lang)}</th>{canEditPage && <th></th>}</tr></thead>
                <tbody>
                  {groups[status].map((r) => (
                    <tr key={r.id}>
                      <td>{r.applicant || '—'}</td>
                      <td>{r.sourceSupplier || '—'}</td>
                      <td>{studentName(r.studentId) || '—'}</td>
                      <td>{schoolName(r) || '—'}</td>
                      <td>{companyName(r) || '—'}</td>
                      <td>{r.remittanceDate || '—'}</td>
                      <td>{r.purpose || '—'}</td>
                      <td>
                        {r.amount ? `${r.currency || '台幣'} ${Number(r.amount).toLocaleString()}` : '—'}
                        {r.currency === '美金' && r.twdAmount ? `（台幣 ${Number(r.twdAmount).toLocaleString()}）` : ''}
                      </td>
                      <td>{r.notes || '—'}</td>
                      {canEditPage && (
                        <td className="row-actions">
                          {STATUSES.filter((s) => s !== status).map((s) => (
                            <button key={s} onClick={async () => { await update(r.id, { status: s }); await syncApprovedPayment({ ...r, status: s }); }}>{s}</button>
                          ))}
                          <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                          <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {groups[status].length === 0 && <tr><td colSpan={canEditPage ? 10 : 9} className="muted">{t('沒有資料', lang)}</td></tr>}
                </tbody>
              </table></div>
            </div>
          ))}
        </div>
      )}
      {editing && <ForeignSubsidyFormModal initial={editing} students={students} users={users} positions={positions} matches={matches} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function ForeignSubsidyFormModal({ initial, students, users, positions, matches, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const sources = [...new Set(students.map((s) => s.sourceSupplier).filter(Boolean))].sort();
  const schools = [...new Set(students.map((s) => s.school).filter(Boolean))].sort();
  const companies = [...new Set(positions.map((p) => p.company).filter(Boolean))].sort();
  const applicantOptions = [...new Set(users.map((u) => u.displayName || u.email).filter(Boolean))].sort();

  function companyForStudent(studentId) {
    const m = matches.find((mm) => mm.studentId === studentId);
    return m ? positions.find((p) => p.id === m.positionId)?.company || '' : '';
  }

  const matchingStudents = students.filter((s) =>
    s.id === form.studentId ||
    (
      (!form.sourceSupplier || s.sourceSupplier === form.sourceSupplier) &&
      (!form.school || s.school === form.school) &&
      (!form.internshipCompany || companyForStudent(s.id) === form.internshipCompany)
    )
  );

  function handleSourceChange(source) {
    const stillMatches = students.find((s) => s.id === form.studentId)?.sourceSupplier === source;
    setForm({ ...form, sourceSupplier: source, studentId: stillMatches ? form.studentId : '' });
  }

  function handleSchoolChange(school) {
    const stillMatches = students.find((s) => s.id === form.studentId)?.school === school;
    setForm({ ...form, school, studentId: stillMatches ? form.studentId : '' });
  }

  function handleCompanyChange(company) {
    const stillMatches = companyForStudent(form.studentId) === company;
    setForm({ ...form, internshipCompany: company, studentId: stillMatches ? form.studentId : '' });
  }

  function handleStudentChange(studentId) {
    const s = students.find((x) => x.id === studentId);
    setForm({ ...form, studentId, school: s?.school || form.school, internshipCompany: companyForStudent(studentId) || form.internshipCompany });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯申請', lang) : t('新增申請', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('申請人', lang)}
              <select value={form.applicant || ''} onChange={(e) => setForm({ ...form, applicant: e.target.value })}>
                <option value="">{t('請選擇', lang)}</option>
                {applicantOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label>
              {t('學生來源(國外供應商)', lang)}
              <select value={form.sourceSupplier || ''} onChange={(e) => handleSourceChange(e.target.value)}>
                <option value="">{t('（不限）', lang)}</option>
                {sources.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>
              {t('學生名字', lang)}
              <select required value={form.studentId || ''} onChange={(e) => handleStudentChange(e.target.value)}>
                <option value="" disabled>{t('請選擇', lang)}</option>
                {matchingStudents.map((s) => <option key={s.id} value={s.id}>{s.chineseName || s.originalName}</option>)}
              </select>
            </label>
            <label>
              {t('就讀學校', lang)}
              <select value={form.school || ''} onChange={(e) => handleSchoolChange(e.target.value)}>
                <option value="">{t('（不限）', lang)}</option>
                {schools.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>
              {t('實習單位', lang)}
              <select value={form.internshipCompany || ''} onChange={(e) => handleCompanyChange(e.target.value)}>
                <option value="">{t('（不限）', lang)}</option>
                {companies.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              {t('匯款日期', lang)}
              <input type="date" value={form.remittanceDate || ''} onChange={(e) => setForm({ ...form, remittanceDate: e.target.value })} />
            </label>
            <label>
              {t('幣別', lang)}
              <select value={form.currency || '台幣'} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              {t('金額', lang)}
              <input type="number" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            {form.currency === '美金' && (
              <label>
                {t('台幣金額', lang)}
                <input type="number" value={form.twdAmount || ''} onChange={(e) => setForm({ ...form, twdAmount: e.target.value })} />
              </label>
            )}
            <label style={{ gridColumn: 'span 2' }}>
              {t('用途說明', lang)}
              <input required value={form.purpose || ''} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              {t('備註', lang)}
              <input value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
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
