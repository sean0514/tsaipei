import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
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

export const MILESTONES = [
  { key: 'admittedDate', label: '學生錄取' },
  { key: 'mouSchoolDate', label: 'MOU簽署-學校端用印' },
  { key: 'mouCompanyDate', label: 'MOU簽署-企業端用印' },
  { key: 'studentDocsDate', label: '收集學生資料' },
  { key: 'companyDocsDate', label: '收集企業資料' },
  { key: 'proposalDate', label: '撰寫計劃書' },
  { key: 'companySealDate', label: '企業用印' },
  { key: 'ministryReviewDate', label: '經濟部/交通部審核' },
  { key: 'sentAbroadDate', label: '發函後寄國外' },
  { key: 'visaDate', label: '辦理簽證' },
  { key: 'housingArrangedDate', label: '住宿安排' },
  { key: 'healthCheckDate', label: '預約體檢公司' },
  { key: 'arrivalDate', label: '入台' },
];

export function milestoneNoteKey(key) {
  return `${key}Note`;
}

export function lastCompletedMilestone(r) {
  const today = new Date().toISOString().slice(0, 10);
  let last = null;
  MILESTONES.forEach((m) => { if (r?.[m.key] && r[m.key] <= today) last = m; });
  return last;
}

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' },
  ...MILESTONES.flatMap((m) => [m, { key: milestoneNoteKey(m.key), label: `${m.label}備註` }]),
  { key: 'notes', label: '備註' }, { key: 'confirmedClosed', label: '結案' },
];

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

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
  const parts = [p.projectCode, p.company, m.venue].filter(Boolean);
  return parts.join(' ') || '未指定客戶';
}

export function ProgressPipeline({ p, lang }) {
  const today = new Date().toISOString().slice(0, 10);
  let lastDoneIdx = -1;
  MILESTONES.forEach((m, i) => { if (p?.[m.key] && p[m.key] <= today) lastDoneIdx = i; });
  const visible = lastDoneIdx === -1 ? MILESTONES : MILESTONES.slice(lastDoneIdx);
  return (
    <div className="pipeline">
      {visible.map((m, i) => (
        <span key={m.key} className={`pip-step${lastDoneIdx !== -1 && i === 0 ? ' done' : ''}`}>{t(m.label, lang)}</span>
      ))}
    </div>
  );
}

// 複製自 systems/tsaipei/ApplicationProgressPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function ApplicationProgressPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'applicationProgress', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('vietnam_applicationProgress');
  const { rows: students } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: positions } = useCollection('vietnam_positions');
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_applicationProgress', CSV_FIELDS, { entityLabel: '申辦進度追蹤', requiredKeys: ['studentId'], canEdit: canEditPage });
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [checkingHousing, setCheckingHousing] = useState(false);

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);
  const searchQuery = q.trim().toLowerCase();

  const filteredRows = rows
    .filter((r) => !r.confirmedClosed)
    .filter((r) => !searchQuery || `${studentFullLabel(studentById(r.studentId))} ${studentCompanyLabel(r.studentId, ctx)}`.toLowerCase().includes(searchQuery));
  const today = new Date().toISOString().slice(0, 10);
  const arrived = filteredRows.filter((r) => r.arrivalDate && r.arrivalDate <= today);
  const notArrived = filteredRows.filter((r) => !(r.arrivalDate && r.arrivalDate <= today));

  function groupByCompany(items) {
    const byCompany = {};
    items.forEach((r) => {
      const company = studentCompanyLabel(r.studentId, ctx);
      (byCompany[company] ||= []).push(r);
    });
    return Object.keys(byCompany).sort((a, b) => a.localeCompare(b)).map((company) => ({
      company,
      items: byCompany[company].slice().sort((a, b) =>
        studentFullLabel(studentById(a.studentId)).localeCompare(studentFullLabel(studentById(b.studentId)))
      ),
    }));
  }

  async function syncAdmittedDate(studentId, admittedDate) {
    const match = matches.find((m) => m.studentId === studentId);
    if (!match) return;
    const admitted = admittedList.find((a) => a.matchId === match.id);
    if (!admitted || admitted.admitDate === admittedDate) return;
    await updateDoc(doc(db, 'vietnam_admittedList', admitted.id), { admitDate: admittedDate });
  }

  async function runCascadeStep(label, fn) {
    try {
      await fn();
    } catch (err) {
      console.error(`申辦進度追蹤：${label}失敗`, err);
      alert(`${label}失敗：${err.message || err}（其他項目仍會繼續處理，請稍後手動確認或使用「核對辦理簽證學生的住宿安排/簽證追蹤」按鈕補救）`);
    }
  }

  async function handleSave(data) {
    const prevVisaDate = editing?.visaDate || '';
    const prevArrivalDate = editing?.arrivalDate || '';
    const prevAdmittedDate = editing?.admittedDate || '';
    try {
      if (data.id) {
        const { id, ...rest } = data;
        await update(id, rest);
      } else {
        await add(data);
      }
    } catch (err) {
      alert(`存檔失敗：${err.message || err}`);
      return;
    }
    if ((data.admittedDate || '') !== prevAdmittedDate) {
      await runCascadeStep('同步錄取名單的錄取日期', () => syncAdmittedDate(data.studentId, data.admittedDate || ''));
    }
    if (data.visaDate && !prevVisaDate) {
      await runCascadeStep('建立住宿安排紀錄', async () => {
        if (!(await hasActiveHousingRecord(data.studentId))) {
          await addDoc(collection(db, 'vietnam_housingRecords'), { studentId: data.studentId });
        }
      });
      await runCascadeStep('建立在台簽證追蹤紀錄', async () => {
        if (!(await existsForStudent('vietnam_inTaiwanVisa', data.studentId))) {
          await addDoc(collection(db, 'vietnam_inTaiwanVisa'), { studentId: data.studentId });
        }
      });
    }
    if (data.arrivalDate && !prevArrivalDate) {
      await runCascadeStep('建立在台簽證追蹤紀錄', async () => {
        if (!(await existsForStudent('vietnam_inTaiwanVisa', data.studentId))) {
          await addDoc(collection(db, 'vietnam_inTaiwanVisa'), { studentId: data.studentId });
        }
      });
      await runCascadeStep('建立在台關懷紀錄', async () => {
        if (!(await existsForStudent('vietnam_inTaiwanCare', data.studentId))) {
          await addDoc(collection(db, 'vietnam_inTaiwanCare'), { studentId: data.studentId, status: '良好' });
        }
      });
    }
    setEditing(null);
  }

  async function reconcileHousingForVisaStage() {
    setCheckingHousing(true);
    try {
      const visaRows = rows.filter((r) => r.visaDate);
      let housingFixed = 0;
      let visaTrackingFixed = 0;
      for (const r of visaRows) {
        try {
          if (!(await hasActiveHousingRecord(r.studentId))) {
            await addDoc(collection(db, 'vietnam_housingRecords'), { studentId: r.studentId });
            housingFixed++;
          }
        } catch (err) {
          console.error('核對住宿安排失敗:', r.studentId, err);
        }
        try {
          if (!(await existsForStudent('vietnam_inTaiwanVisa', r.studentId))) {
            await addDoc(collection(db, 'vietnam_inTaiwanVisa'), { studentId: r.studentId });
            visaTrackingFixed++;
          }
        } catch (err) {
          console.error('核對在台簽證追蹤失敗:', r.studentId, err);
        }
      }
      alert(`檢查完成：目前共 ${visaRows.length} 位學生已填入「辦理簽證」日期，其中補上了 ${housingFixed} 筆缺少的住宿安排紀錄、${visaTrackingFixed} 筆缺少的在台簽證追蹤紀錄。`);
    } finally {
      setCheckingHousing(false);
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('申辦進度追蹤', lang)}</h2>
          <div className="page-desc">{t('依客戶分類，追蹤每位學生從錄取到入台的整體申辦流程', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增進度紀錄', lang)}</button>}
          {canEditPage && (
            <button onClick={reconcileHousingForVisaStage} disabled={checkingHousing}>
              {checkingHousing ? t('檢查中…', lang) : t('核對辦理簽證學生的住宿安排/簽證追蹤', lang)}
            </button>
          )}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「學生ID」欄位）；上傳後會完全取代目前所有進度紀錄，請先下載備份再匯入。', lang)}</p>}
      <input placeholder={t('搜尋學生或客戶', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        filteredRows.length === 0 ? <p className="muted">{t('尚無進度紀錄。學生「確認錄取」後會自動建立，也可以點選「新增進度紀錄」手動加入。', lang)}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <ArrivalSection
              title={t('未入台', lang)}
              groups={groupByCompany(notArrived)}
              canEditPage={canEditPage}
              ctx={ctx}
              studentById={studentById}
              onEdit={setEditing}
              onRemove={remove}
              onClose={(id) => update(id, { confirmedClosed: true })}
              lang={lang}
            />
            <ArrivalSection
              title={t('已入台', lang)}
              groups={groupByCompany(arrived)}
              canEditPage={canEditPage}
              ctx={ctx}
              studentById={studentById}
              onEdit={setEditing}
              onRemove={remove}
              onClose={(id) => update(id, { confirmedClosed: true })}
              lang={lang}
            />
          </div>
        )
      )}
      {editing && (
        <ProgressFormModal
          initial={editing}
          students={students}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
          lang={lang}
        />
      )}
    </div>
  );
}

function ArrivalSection({ title, groups, canEditPage, ctx, studentById, onEdit, onRemove, onClose, lang }) {
  const total = groups.reduce((sum, g) => sum + g.items.length, 0);
  return (
    <div>
      <h3 style={{ margin: '0 0 12px' }}>{title} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{t('共', lang)} {total} {t('位學生', lang)}</span></h3>
      {groups.length === 0 ? (
        <p className="muted">{t('目前沒有符合的學生。', lang)}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groups.map(({ company, items }) => (
            <div className="card" key={company}>
              <h4 style={{ marginTop: 0 }}>{company} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{items.length} {t('位學生', lang)}</span></h4>
              {items.map((r) => (
                <div key={r.id} className="progress-row">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{studentFullLabel(studentById(r.studentId))}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{studentCompanyLabel(r.studentId, ctx)}</div>
                    </div>
                    {canEditPage && (
                      <div className="row-actions">
                        <button onClick={() => onEdit(r)}>{t('編輯', lang)}</button>
                        <button className="danger" onClick={() => onRemove(r.id)}>{t('刪除', lang)}</button>
                        <button onClick={() => onClose(r.id)}>{t('結案', lang)}</button>
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <ProgressPipeline p={r} lang={lang} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressFormModal({ initial, students, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯進度紀錄', lang) : t('新增進度紀錄', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <label>
            {t('學生', lang)}
            <select required disabled={!!initial.id} value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })} style={{ marginBottom: 16 }}>
              <option value="" disabled>{t('請選擇學生', lang)}</option>
              {students.map((s) => <option key={s.id} value={s.id}>{studentFullLabel(s)}</option>)}
            </select>
          </label>

          <h4 style={{ marginTop: 0 }}>{t('申辦流程', lang)}</h4>
          <div className="form-grid">
            {MILESTONES.map((m) => (
              <div key={m.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label>
                  {t(m.label, lang)}
                  <input type="date" value={form[m.key] || ''} onChange={(e) => setForm({ ...form, [m.key]: e.target.value })} />
                </label>
                <input placeholder={t('備註', lang)} value={form[milestoneNoteKey(m.key)] || ''} onChange={(e) => setForm({ ...form, [milestoneNoteKey(m.key)]: e.target.value })} />
              </div>
            ))}
          </div>

          <h4 style={{ marginTop: 20 }}>{t('進度圖示', lang)}</h4>
          <ProgressPipeline p={form} lang={lang} />

          <label>
            {t('備註', lang)}
            <textarea rows={3} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ marginTop: 16, marginBottom: 16 }} />
          </label>
          <div className="row-actions">
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
