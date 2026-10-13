import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, getDocs, query, updateDoc, doc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { hasActiveHousingRecord } from '../../lib/housingRecords';
import { t } from '../../lib/i18n';

async function existsForStudent(collectionName, studentId) {
  const snap = await getDocs(query(collection(db, collectionName), where('studentId', '==', studentId)));
  return !snap.empty;
}

const FIRST_ENTRY_EXPENSE_ITEMS = [
  { item: '寢具費用', amount: 480 },
  { item: '鑰匙費用', amount: 300 },
  { item: '體檢費用', amount: 300 },
];

async function ensureFirstEntryExpenses(studentId, firstEntryDate) {
  if (!studentId || !firstEntryDate) return 0;
  const snap = await getDocs(query(collection(db, 'vietnam_dailyExpenseApplications'), where('studentId', '==', studentId)));
  const existingItems = new Set(snap.docs.map((d) => d.data().item));
  let created = 0;
  for (const { item, amount } of FIRST_ENTRY_EXPENSE_ITEMS) {
    if (existingItems.has(item)) continue;
    // eslint-disable-next-line no-await-in-loop
    await addDoc(collection(db, 'vietnam_dailyExpenseApplications'), {
      studentId, item, amount, type: '收入', status: '待審核', date: firstEntryDate, currency: '台幣',
    });
    created += 1;
  }
  return created;
}

async function afterVisaSave(studentId, row) {
  if (!studentId) return;
  if (!(await existsForStudent('vietnam_inTaiwanCare', studentId))) {
    await addDoc(collection(db, 'vietnam_inTaiwanCare'), { studentId, status: '良好' });
  }
  if (!(await hasActiveHousingRecord(studentId))) {
    await addDoc(collection(db, 'vietnam_housingRecords'), { studentId });
  }
  if (row.firstEntryDate) {
    await ensureFirstEntryExpenses(studentId, row.firstEntryDate);
  }
  await updateDoc(doc(db, 'vietnam_students', studentId), {
    firstEntryDate: row.firstEntryDate || '',
    firstExitDate: row.firstExitDate || '',
    secondEntryDate: row.secondEntryDate || '',
    secondExitDate: row.secondExitDate || '',
  });
}

const FIELDS = [
  { key: 'firstEntryDate', label: '第一次入台時間', type: 'date' },
  { key: 'firstExitDate', label: '第一次離台時間', type: 'date' },
  { key: 'visaRenewalDate', label: '在台期間換發簽證時間', type: 'date' },
  { key: 'secondEntryDate', label: '第二次入台時間', type: 'date' },
  { key: 'secondExitDate', label: '第二次離台時間', type: 'date' },
  { key: 'visaRenewalDate2', label: '在台期間換發簽證時間2', type: 'date' },
];
const CSV_FIELDS = [{ key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' }, ...FIELDS, { key: 'confirmedDeparture', label: '確認離台' }];

function studentCompanyLabel(studentId, { matches, admittedList, positions }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  if (!m) return '未指定客戶';
  const p = positions.find((pp) => pp.id === m.positionId);
  if (!p) return '未指定客戶';
  return [p.projectCode, p.company, m.venue].filter(Boolean).join(' ') || '未指定客戶';
}

function VisaTable({ rows, canEditPage, studentName, onEdit, onRemove, onToggleDeparture, lang }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>{t('學生', lang)}</th>{FIELDS.map((f) => <th key={f.key}>{t(f.label, lang)}</th>)}<th>{t('確認離台', lang)}</th>{canEditPage && <th></th>}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{studentName(r.studentId)}</td>
              {FIELDS.map((f) => <td key={f.key}>{r[f.key] || '—'}</td>)}
              <td>
                {canEditPage ? (
                  <input type="checkbox" checked={!!r.confirmedDeparture} onChange={(e) => onToggleDeparture(r.id, e.target.checked)} />
                ) : (r.confirmedDeparture ? '是' : '否')}
              </td>
              {canEditPage && (
                <td>
                  <div className="row-actions">
                    <button onClick={() => onEdit(r)}>{t('編輯', lang)}</button>
                    <button className="danger" onClick={() => onRemove(r.id)}>{t('刪除', lang)}</button>
                  </div>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={FIELDS.length + (canEditPage ? 3 : 2)} className="muted">{t('沒有資料', lang)}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// 複製自 systems/tsaipei/InTaiwanVisaPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function InTaiwanVisaPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'inTaiwanVisa', role, overrides);
  const { rows, loading, update, remove } = useCollection('vietnam_inTaiwanVisa');
  const { rows: students } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: positions } = useCollection('vietnam_positions');
  const [editing, setEditing] = useState(null);
  const [showDeparted, setShowDeparted] = useState(false);
  const [q, setQ] = useState('');
  const [backfilling, setBackfilling] = useState(false);
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_inTaiwanVisa', CSV_FIELDS, { entityLabel: '在台簽證追蹤', requiredKeys: ['studentId'], canEdit: canEditPage });

  const ctx = { matches, admittedList, positions };
  const studentName = (id) => { const s = students.find((x) => x.id === id); return s?.chineseName || s?.originalName || '(未知)'; };
  const searchQuery = q.trim().toLowerCase();
  const visible = rows.filter((r) => (showDeparted || r.confirmedDeparture !== true) && (!searchQuery || `${studentName(r.studentId)} ${studentCompanyLabel(r.studentId, ctx)}`.toLowerCase().includes(searchQuery)));

  const today = new Date().toISOString().slice(0, 10);
  const departed = visible.filter((r) => r.secondExitDate && r.secondExitDate <= today);
  const inTaiwan = visible.filter((r) => !(r.secondExitDate && r.secondExitDate <= today));

  const byCompany = {};
  inTaiwan.forEach((r) => {
    const company = studentCompanyLabel(r.studentId, ctx);
    (byCompany[company] ||= []).push(r);
  });
  const companies = Object.keys(byCompany).sort((a, b) => a.localeCompare(b));

  async function handleSave(data) {
    const { id, ...rest } = data;
    await update(id, rest);
    await afterVisaSave(rest.studentId, rest);
    setEditing(null);
  }

  async function handleBackfillFirstEntryExpenses() {
    const targets = rows.filter((r) => r.studentId && r.firstEntryDate);
    if (!targets.length) { alert('目前沒有已填寫第一次入台時間的學生。'); return; }
    if (!window.confirm(`即將檢查 ${targets.length} 位已填第一次入台時間的學生，幫還沒有寢具/鑰匙/體檢費用紀錄的人補上，確定要繼續嗎？`)) return;
    setBackfilling(true);
    try {
      let studentsCreated = 0;
      let itemsCreated = 0;
      for (const r of targets) {
        // eslint-disable-next-line no-await-in-loop
        const created = await ensureFirstEntryExpenses(r.studentId, r.firstEntryDate);
        if (created > 0) { studentsCreated += 1; itemsCreated += created; }
      }
      alert(studentsCreated > 0 ? `已幫 ${studentsCreated} 位學生補上共 ${itemsCreated} 筆費用。` : '所有學生都已經有這三筆費用了，沒有需要補的。');
    } catch (err) {
      alert(`補建立失敗：${err.message || err}`);
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('在台簽證追蹤', lang)}</h2>
          <div className="page-desc">{t('依在台中／已離台分類，在台中的學生再依客戶分組；「已離台」在第二次離台時間到期後自動列入；填寫第一次入台時間後會自動在日常支出申請待審核清單帶入寢具費用480/鑰匙費用300/體檢費用300（類型=收入）', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          <label className="muted"><input type="checkbox" checked={showDeparted} onChange={(e) => setShowDeparted(e.target.checked)} /> {t('顯示已確認離台', lang)}</label>
          {canEditPage && <button disabled={backfilling} onClick={handleBackfillFirstEntryExpenses}>{backfilling ? t('補建立中…', lang) : t('補建立入境費用', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「學生ID」欄位）；上傳後會完全取代目前所有在台簽證追蹤資料，請先下載備份再匯入。', lang)}</p>}
      <input placeholder={t('搜尋學生或客戶', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>{t('在台中', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{t('共', lang)} {inTaiwan.length} {t('位學生', lang)}</span></h3>
            {companies.length === 0 ? <p className="muted">{t('目前沒有在台中的學生。', lang)}</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {companies.map((company) => (
                  <div className="card" key={company}>
                    <h4 style={{ marginTop: 0 }}>{company} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{byCompany[company].length} {t('位學生', lang)}</span></h4>
                    <VisaTable
                      rows={byCompany[company]}
                      canEditPage={canEditPage}
                      studentName={studentName}
                      onEdit={setEditing}
                      onRemove={remove}
                      onToggleDeparture={(id, checked) => update(id, { confirmedDeparture: checked })}
                      lang={lang}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>{t('已離台', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{t('共', lang)} {departed.length} {t('位學生', lang)}</span></h3>
            <div className="card">
              <VisaTable
                rows={departed}
                canEditPage={canEditPage}
                studentName={studentName}
                onEdit={setEditing}
                onRemove={remove}
                onToggleDeparture={(id, checked) => update(id, { confirmedDeparture: checked })}
                lang={lang}
              />
            </div>
          </div>
        </div>
      )}
      {editing && <VisaFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function VisaFormModal({ initial, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('編輯在台簽證追蹤', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {t(f.label, lang)}
                <input type={f.type} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
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
