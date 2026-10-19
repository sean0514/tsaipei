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

// 已核准／已匯款自動在「國外付款紀錄」帶入/同步一筆待付款紀錄，單位名稱
// 直接用學生來源(國外供應商)，方便該頁依供應商分類、對帳。用
// sourceApplicationId 找對應的付款紀錄：還沒有就新增（預設未付款），已經
// 有就更新欄位內容——這樣已核准後才修改申請內容（金額、學生來源…）也會
// 同步過去，但不會動使用者自己在國外付款紀錄那邊維護的「是否已付款」狀態。
// 已核准、已匯款都要同步(不是只有「剛好等於已核准」那個瞬間)，因為申請
// 核准後很快就會進一步轉成已匯款，只同步已核准會讓已經撥款的申請完全沒
// 同步到國外付款紀錄，公司損益的國外付款支出也會跟著漏算。
const SYNCED_STATUSES = ['已核准', '已匯款'];
async function syncApprovedPayment(app) {
  if (!SYNCED_STATUSES.includes(app.status)) return;
  const snap = await getDocs(query(collection(db, 'tsaipei_foreignPayments'), where('sourceApplicationId', '==', app.id)));
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
    await addDoc(collection(db, 'tsaipei_foreignPayments'), { ...payload, status: '待審核' });
  } else {
    await updateDoc(snap.docs[0].ref, payload);
  }
}

const STATUSES = ['待審核', '已核准', '已匯款', '退回'];
// 已匯款之後的「封存」只開放財務人員（跟系統管理員）能按，跟日常支出
// 申請同一套規則。
const ARCHIVE_ROLES = ['系統管理員', '財務人員'];

const CURRENCIES = ['台幣', '美金'];

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'applicant', label: '申請人' }, { key: 'sourceSupplier', label: '學生來源(國外供應商)' }, { key: 'studentId', label: '學生ID' },
  { key: 'school', label: '就讀學校' }, { key: 'internshipCompany', label: '實習單位' },
  { key: 'remittanceDate', label: '匯款日期' }, { key: 'purpose', label: '用途說明' }, { key: 'currency', label: '幣別' }, { key: 'amount', label: '金額' }, { key: 'twdAmount', label: '台幣金額' },
  { key: 'notes', label: '備註' }, { key: 'status', label: '審核狀態' }, { key: 'confirmedClosed', label: '結案' }, { key: 'archived', label: '封存' },
];

export default function ForeignSubsidyApplicationPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'foreignSubsidyApplication', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_foreignSubsidyApplications');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: users } = useCollection('tsaipei_users');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: positions } = useCollection('tsaipei_positions');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [month, setMonth] = useState(currentMonthStr());
  const [backfilling, setBackfilling] = useState(false);
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_foreignSubsidyApplications', CSV_FIELDS, { entityLabel: '國外補助申請', requiredKeys: ['purpose'], canEdit: canEditPage });

  // 補同步：這次修正之前，只有狀態「剛好轉成已核准」那個瞬間才會同步到
  // 國外付款紀錄，已核准後很快又轉成已匯款的申請都沒同步到。掃一次所有
  // 已核准／已匯款的申請，全部重新同步一次(syncApprovedPayment 本身是
  // upsert，同步過的紀錄不會重複建立)。
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

  const canArchive = () => canEditPage && ARCHIVE_ROLES.includes(role);

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows
    .filter((r) => !r.confirmedClosed && !r.archived)
    .filter((r) => !searchQuery || `${r.applicant || ''} ${studentName(r.studentId)} ${r.sourceSupplier || ''} ${r.purpose || ''}`.toLowerCase().includes(searchQuery));
  const groups = { 待審核: [], 已核准: [], 已匯款: [], 退回: [] };
  filtered.forEach((r) => groups[STATUSES.includes(r.status) ? r.status : '待審核'].push(r));
  STATUSES.forEach((s) => groups[s].sort((a, b) => (b.remittanceDate || '').localeCompare(a.remittanceDate || '')));

  // 複製成新的一筆待審核申請，不帶 id/status，其他欄位（申請人、學生、
  // 匯款日期、金額…）都照抄，存檔時 handleSave 的 add() 會自動補上
  // status: '待審核'，方便同一位學生每月申請時不用重新選一次。
  function handleDuplicate(r) {
    const { id, status, ...rest } = r;
    setEditing({ ...rest });
  }

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
          <div className="page-desc">依待審核／已核准／已匯款／退回分類；已核准的申請可以按「結案」歸檔，已匯款的申請可以按「封存」歸檔（僅財務人員／系統管理員），結案或封存後從列表隱藏（資料還在，下載完整資料時仍會包含）{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增申請</button>}
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button onClick={handleDownloadMonth}>下載此月份資料</button>
          {canEditPage && <button onClick={handleBackfillSync} disabled={backfilling}>{backfilling ? '同步中…' : '補同步國外付款紀錄'}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有國外補助申請紀錄，請先下載備份再匯入。「下載此月份資料」依「匯款日期」篩選。「補同步國外付款紀錄」會把所有已核准/已匯款的申請重新同步一次到國外付款紀錄(修正舊版只在剛核准那一刻同步、之後轉已匯款就不再同步的問題)。</p>}
      <input placeholder="搜尋申請人、學生、學生來源或用途說明" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {STATUSES.map((status) => (
            <div className="card" key={status}>
              <h3 style={{ marginTop: 0 }}>{status}（{groups[status].length}）</h3>
              <div className="table-wrap"><table>
                <thead><tr><th>申請人</th><th>學生來源</th><th>學生</th><th>就讀學校</th><th>實習單位</th><th>匯款日期</th><th>用途說明</th><th>金額</th><th>備註</th>{canEditPage && <th></th>}</tr></thead>
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
                          {status === '待審核' && (
                            <>
                              <button onClick={async () => { await update(r.id, { status: '已核准' }); await syncApprovedPayment({ ...r, status: '已核准' }); }}>已核准</button>
                              <button onClick={async () => { await update(r.id, { status: '已匯款' }); await syncApprovedPayment({ ...r, status: '已匯款' }); }}>已匯款</button>
                              <button onClick={() => update(r.id, { status: '退回' })}>退回</button>
                            </>
                          )}
                          {status === '已核准' && (
                            <>
                              <button onClick={async () => { await update(r.id, { status: '已匯款' }); await syncApprovedPayment({ ...r, status: '已匯款' }); }}>已匯款</button>
                              <button onClick={() => update(r.id, { status: '待審核' })}>退回(回到待審核)</button>
                            </>
                          )}
                          {status === '已匯款' && (
                            <button onClick={() => update(r.id, { status: '已核准' })}>退回(回到已核准)</button>
                          )}
                          {status === '退回' && STATUSES.filter((s) => s !== status).map((s) => (
                            <button key={s} onClick={async () => { await update(r.id, { status: s }); await syncApprovedPayment({ ...r, status: s }); }}>{s}</button>
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
      {editing && <ForeignSubsidyFormModal initial={editing} students={students} users={users} positions={positions} matches={matches} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function ForeignSubsidyFormModal({ initial, students, users, positions, matches, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const sources = [...new Set(students.map((s) => s.sourceSupplier).filter(Boolean))].sort();
  const schools = [...new Set(students.map((s) => s.school).filter(Boolean))].sort();
  const companies = [...new Set(positions.map((p) => p.company).filter(Boolean))].sort();
  const applicantOptions = [...new Set(users.map((u) => u.displayName || u.email).filter(Boolean))].sort();

  function companyForStudent(studentId) {
    const m = matches.find((mm) => mm.studentId === studentId);
    return m ? positions.find((p) => p.id === m.positionId)?.company || '' : '';
  }

  // 編輯既有申請時，目前選的學生就算跟現在的學生來源/就讀學校/實習單位篩選
  // 條件對不上（例如學生資料後來改過），也要留在清單裡，不然下拉選單會顯示
  // 空白（studentId 有值，但選項裡找不到對應的 option）。
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
              <select required value={form.studentId || ''} onChange={(e) => handleStudentChange(e.target.value)}>
                <option value="" disabled>請選擇</option>
                {matchingStudents.map((s) => <option key={s.id} value={s.id}>{s.chineseName || s.originalName}</option>)}
              </select>
            </label>
            <label>
              就讀學校
              <select value={form.school || ''} onChange={(e) => handleSchoolChange(e.target.value)}>
                <option value="">（不限）</option>
                {schools.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>
              實習單位
              <select value={form.internshipCompany || ''} onChange={(e) => handleCompanyChange(e.target.value)}>
                <option value="">（不限）</option>
                {companies.map((c) => <option key={c} value={c}>{c}</option>)}
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
            {form.currency === '美金' && (
              <label>
                台幣金額
                <input type="number" value={form.twdAmount || ''} onChange={(e) => setForm({ ...form, twdAmount: e.target.value })} />
              </label>
            )}
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
