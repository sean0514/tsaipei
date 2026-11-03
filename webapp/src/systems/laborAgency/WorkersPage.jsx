import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';
import ResumeInternalFields from '../../components/ResumeInternalFields';
import { emptyExperienceRow, normalizeExperienceRow } from '../../pages/LaborAgencyResumeApplyPage';
import { CheckboxGroup, EmployerCheckboxGroup, parseJobs } from './WorkerRosterPage';
import { JOBS, MATCH_STATUSES, employerLabel, workerEmployerIds, matchStatusOf, withMatchStatus } from './constants';

// 工種在「移工名冊」(WorkerRosterPage.jsx) 已經改成可複選，存成 JSON
// 陣列字串；這裡只顯示用，舊資料是單一字串就當成一項的陣列，不是這份
// 表單自己要改的欄位（移工名冊才是維護履歷資料的地方）。
function jobLabel(raw, lang) {
  if (!raw) return '—';
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.map((j) => t(j, lang)).join('、') || '—';
  } catch { /* 不是 JSON，當成單一字串 */ }
  return t(raw, lang);
}

// 案件管理專屬欄位：履歷/工種/配對雇主已經跟「移工名冊」共用同一套
// 表單（見下面的 WorkerFormModal），這裡只列移工名冊沒有、但移工管理
// 案件追蹤需要的欄位——護照效期跟內部獎金計算讀取的角色指派。
const CASE_FIELDS = [
  { key: 'passportExpiry', label: '護照效期', type: 'date' },
  // 每位移工各自指派負責人，詳見 BonusPage.jsx／BonusRateSetupPage.jsx。
  // 「招募人員」的獎金金額直接在「費用計算」(FeeSetupPage.jsx) 設定，
  // 其餘 4 個角色的獎金金額在「內部獎金編輯」(BonusRateSetupPage.jsx)
  // 設定固定金額。
  { key: 'assignedRecruiter', label: '招募人員', type: 'staff' },
  { key: 'assignedAdminResume', label: '行政（履歷表）', type: 'staff' },
  { key: 'assignedAccountant', label: '會計人員', type: 'staff' },
  { key: 'assignedFieldStaff', label: '外務人員', type: 'staff' },
  { key: 'assignedSupervisor', label: '主管', type: 'staff' },
];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'name', label: '姓名' }, { key: 'vietnameseName', label: '越文姓名' },
  { key: 'gender', label: '性別' }, { key: 'province', label: '省份' }, { key: 'job', label: '工種' },
  ...CASE_FIELDS, { key: 'note', label: '備註' },
];

function parseExperience(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export default function WorkersPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'workers', role, overrides);
  const { rows: workers, loading, add, update, remove } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');
  const { rows: users } = useCollection('laborAgency_users');
  const [editing, setEditing] = useState(null);
  const [arranging, setArranging] = useState(false);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('laborAgency_workers', CSV_FIELDS, { entityLabel: '移工資料', requiredKeys: ['name'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const employerNames = (w) => workerEmployerIds(w).map((id) => employerLabel(employers, id, lang)).join(' ');
  const filtered = workers
    .filter((w) => !searchQuery || `${w.name || ''} ${w.province || ''} ${employerNames(w)} ${jobLabel(w.job, lang)}`.toLowerCase().includes(searchQuery))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  async function handleSave(data) {
    const payload = { ...data, updatedAt: Date.now() };
    if (data.id) {
      const { id, ...rest } = payload;
      await update(id, rest);
    } else {
      await add(payload);
    }
    setEditing(null);
  }

  // 目前階段每筆配對（移工×雇主）各自獨立，存在 matchStatuses（見
  // constants.js），不是整個移工共用一個欄位，所以要帶 employerId 才能
  // 知道是改哪一筆配對的狀態。
  async function handleMoveStatus(worker, employerId, status) {
    await update(worker.id, { matchStatuses: withMatchStatus(worker, employerId, status), updatedAt: Date.now() });
  }

  async function handleArrangeEmployer({ workerId, employerId }) {
    const worker = workers.find((w) => w.id === workerId);
    const ids = workerEmployerIds(worker || {});
    const nextIds = ids.includes(employerId) ? ids : [...ids, employerId];
    await update(workerId, { employerIds: JSON.stringify(nextIds), updatedAt: Date.now() });
    setArranging(false);
  }

  // 刪除：這裡的清單是「移工×配對雇主」的案件列，刪除一行應該只拿掉
  // 那一筆配對（從 employerIds 移除），不是把整個移工資料刪掉——同一個
  // 移工可能還配對其他雇主，或履歷資料要留在移工名冊。「尚未配對」那
  // 一行沒有配對雇主可以移除，才整筆刪除移工資料。
  async function handleRemoveRow(worker, employerId) {
    if (!employerId) {
      await remove(worker.id);
      return;
    }
    const nextIds = workerEmployerIds(worker).filter((id) => id !== employerId);
    const payload = { employerIds: JSON.stringify(nextIds), updatedAt: Date.now() };
    if (worker.employerId === employerId) payload.employerId = '';
    await update(worker.id, payload);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('移工管理', lang)}</h2>
          <div className="page-desc">{t('越南移工案件進度管理，列出每位移工的配對雇主與各自的面試/錄取狀態（同一人配對多個雇主，狀態各自獨立）', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          <input placeholder={t('搜尋姓名、省份、工種、雇主', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
          {canEditPage && <button className="primary" onClick={() => setArranging(true)}>+ {t('新增雇主安排', lang)}</button>}
          {canEditPage && <button onClick={() => setEditing({})}>+ {t('新增移工', lang)}</button>}
          <ImportExportButtons rows={workers} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <ProcessView workers={filtered} employers={employers} canEditPage={canEditPage} onMoveStatus={handleMoveStatus} onEdit={setEditing} onRemove={handleRemoveRow} lang={lang} />
      )}
      {editing && (
        <WorkerFormModal initial={editing} employers={employers} users={users} onCancel={() => setEditing(null)} onSave={handleSave} onRemove={editing.id ? () => { remove(editing.id); setEditing(null); } : null} lang={lang} />
      )}
      {arranging && (
        <ArrangeEmployerModal workers={workers} employers={employers} onCancel={() => setArranging(false)} onSave={handleArrangeEmployer} lang={lang} />
      )}
    </div>
  );
}

// 新增雇主安排：直接從既有的移工（移工名冊／履歷自動建立）跟既有的雇主
// 需求單各選一筆，建立配對，不用像「新增移工」一樣重新輸入一筆完整的
// 移工資料。
function ArrangeEmployerModal({ workers, employers, onCancel, onSave, lang }) {
  const [workerId, setWorkerId] = useState('');
  const [employerId, setEmployerId] = useState('');
  const sortedWorkers = [...workers].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ workerId, employerId });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('新增雇主安排', lang)}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              {t('移工', lang)}
              <select required value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
                <option value="">{t('請選擇', lang)}</option>
                {sortedWorkers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label>
              {t('雇主', lang)}
              <select required value={employerId} onChange={(e) => setEmployerId(e.target.value)}>
                <option value="">{t('請選擇', lang)}</option>
                {employers.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </label>
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

const UNMATCHED_EMPLOYER = '__unmatched__';
const UNSET_AGENCY = '__unset_agency__';

// 目前階段（面試/錄取/取消/未通過）每一筆配對（移工×雇主）各自獨立，
// 不是整個移工共用一個狀態。用一排可點擊的流程步驟顯示，點哪一個就
// 直接改成那個狀態，只影響這一行（這一筆配對），不影響同一移工在其他
// 雇主那邊的狀態。
function MatchStatusSteps({ status, onChange, canEdit, lang }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {MATCH_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          disabled={!canEdit}
          onClick={() => onChange(s)}
          className={`tag ${s === status ? 'tag-green' : 'tag-grey'}`}
          style={{ cursor: canEdit ? 'pointer' : 'default', fontWeight: s === status ? 700 : 400 }}
        >
          {s === status ? '✓ ' : ''}{t(s, lang)}
        </button>
      ))}
    </div>
  );
}

// 案件清單：先依仲介分組，仲介底下再依雇主分組（未配對的歸一組，排
// 最後）；同一個移工若在移工名冊同時配對多個雇主（可複選），這裡會依
// 雇主各自顯示一行，不是只算一筆，每一行的目前階段也各自獨立。同一
// 雇主底下依姓名排序；搜尋時仍在各分組內比對姓名/工種/雇主。
function ProcessView({ workers, employers, canEditPage, onMoveStatus, onEdit, onRemove, lang }) {
  // 攤平成「移工×配對雇主」的案件列：workerEmployerIds 回傳的陣列是空的
  // 就代表尚未配對，用 null 佔一個「尚未配對」的位置。
  const rows = workers.flatMap((w) => {
    const ids = workerEmployerIds(w);
    return ids.length ? ids.map((employerId) => ({ worker: w, employerId })) : [{ worker: w, employerId: null }];
  });

  const employerOf = (id) => employers.find((e) => e.id === id);
  const sortedEmployerIds = [...new Set(rows.map((r) => r.employerId).filter(Boolean))]
    .sort((a, b) => {
      const ea = employerOf(a); const eb = employerOf(b);
      return (ea?.agencyName || '').localeCompare(eb?.agencyName || '') || employerLabel(employers, a, lang).localeCompare(employerLabel(employers, b, lang));
    });
  const employerGroupKeys = [...sortedEmployerIds, UNMATCHED_EMPLOYER];

  // 仲介分組：同一仲介底下可能有好幾個雇主，先依仲介名稱（沒填的歸一
  // 組）把雇主分組鍵排在一起，未配對永遠排最後。
  const agencyOrder = [];
  employerGroupKeys.forEach((employerId) => {
    const agencyKey = employerId === UNMATCHED_EMPLOYER ? UNSET_AGENCY : (employerOf(employerId)?.agencyName || UNSET_AGENCY);
    if (!agencyOrder.includes(agencyKey)) agencyOrder.push(agencyKey);
  });

  function EmployerTable({ employerId }) {
    const group = rows.filter((r) => (r.employerId || UNMATCHED_EMPLOYER) === employerId);
    if (group.length === 0) return null;
    const sorted = [...group].sort((a, b) => (a.worker.name || '').localeCompare(b.worker.name || ''));
    return (
      <div key={employerId} style={{ marginBottom: 16 }}>
        <h4 style={{ marginBottom: 8 }}>
          {employerId === UNMATCHED_EMPLOYER ? t('尚未配對', lang) : employerLabel(employers, employerId, lang)}
          <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>（{group.length}）</span>
        </h4>
        <div className="card">
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>{t('姓名', lang)}</th><th>{t('越文姓名', lang)}</th><th>{t('性別', lang)}</th>
                <th>{t('省份', lang)}</th><th>{t('工種', lang)}</th><th>{t('目前階段', lang)}</th>{canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ worker: w, employerId: rowEmployerId }) => (
                <tr key={`${w.id}-${employerId}`}>
                  <td style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => onEdit(w)}>{w.name}</td>
                  <td>{w.vietnameseName || '—'}</td>
                  <td>{t(w.gender, lang) || '—'}</td>
                  <td>{w.province || '—'}</td>
                  <td>{jobLabel(w.job, lang)}</td>
                  <td>
                    <MatchStatusSteps
                      status={matchStatusOf(w, rowEmployerId)}
                      onChange={(status) => onMoveStatus(w, rowEmployerId, status)}
                      canEdit={canEditPage}
                      lang={lang}
                    />
                  </td>
                  {canEditPage && <td><button className="danger" onClick={() => onRemove(w, rowEmployerId)}>{t('刪除', lang)}</button></td>}
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    );
  }

  return (
    <>
      {agencyOrder.map((agencyKey) => {
        const employerIdsInAgency = employerGroupKeys.filter((employerId) => {
          const key = employerId === UNMATCHED_EMPLOYER ? UNSET_AGENCY : (employerOf(employerId)?.agencyName || UNSET_AGENCY);
          return key === agencyKey;
        });
        const count = rows.filter((r) => employerIdsInAgency.includes(r.employerId || UNMATCHED_EMPLOYER)).length;
        if (count === 0) return null;
        return (
          <div key={agencyKey} style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 10 }}>
              {agencyKey === UNSET_AGENCY ? t('未填仲介名稱', lang) : agencyKey}
              <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>（{count}）</span>
            </h3>
            {employerIdsInAgency.map((employerId) => <EmployerTable key={employerId} employerId={employerId} />)}
          </div>
        );
      })}
      {workers.length === 0 && <div className="card"><p className="muted" style={{ margin: 0 }}>{t('沒有案件', lang)}</p></div>}
    </>
  );
}

// 編輯移工表單：跟「移工名冊」(WorkerRosterPage.jsx) 共用同一套履歷/
// 工種/配對雇主欄位（匯入它 export 的 CheckboxGroup/EmployerCheckboxGroup/
// parseJobs，跟 ResumeInternalFields），資料自動帶入移工名冊已經填好的
// 內容，不是另一份獨立、對不上的簡化表單；另外加上護照效期跟角色指派
// 這幾個移工名冊沒有、案件管理才需要的欄位（CASE_FIELDS）。
function WorkerFormModal({ initial, employers, users, onCancel, onSave, onRemove, lang }) {
  // 舊資料相容：舊版表單只有 name/vietnameseName 兩個姓名欄位，沒有拆成
  // 履歷表的越文姓名/中文姓名，中文姓名欄位沒資料時退回用 name 補上。
  const [form, setForm] = useState({ ...initial, chineseName: initial.chineseName || initial.name || '' });
  const staffOptions = [...new Set((users || []).map((u) => u.displayName || u.email).filter(Boolean))].sort();
  const [jobs, setJobs] = useState(() => parseJobs(initial.job));
  const [employerIds, setEmployerIds] = useState(() => workerEmployerIds(initial));
  const [domesticExperience, setDomesticExperience] = useState(() => {
    const rows = parseExperience(initial.domesticExperience).map(normalizeExperienceRow);
    return rows.length ? rows : [emptyExperienceRow()];
  });
  const [overseasExperience, setOverseasExperience] = useState(() => {
    const rows = parseExperience(initial.overseasExperience).map(normalizeExperienceRow);
    return rows.length ? rows : [emptyExperienceRow()];
  });

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
      ...form,
      name: form.chineseName || form.vietnameseName || '',
      province: form.hometown || '',
      note: form.specialties || '',
      job: JSON.stringify(jobs),
      employerIds: JSON.stringify(employerIds),
      domesticExperience: JSON.stringify(domesticExperience.filter((r) => r.startDate || r.endDate || r.description || r.reason)),
      overseasExperience: JSON.stringify(overseasExperience.filter((r) => r.startDate || r.endDate || r.description || r.reason)),
    });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal card" onClick={(e) => e.stopPropagation()} style={{ width: 640, maxWidth: '100%' }}>
        <h3 style={{ marginTop: 0 }}>{initial.id ? t('編輯移工', lang) : t('新增移工', lang)}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            {CASE_FIELDS.map((f) => (
              <label key={f.key}>
                {t(f.label, lang)}
                {f.type === 'staff' ? (
                  <>
                    <input
                      list={`${f.key}-options`}
                      value={form[f.key] || ''}
                      placeholder={t('選擇或自行輸入姓名', lang)}
                      onChange={(e) => setField(f.key, e.target.value)}
                    />
                    <datalist id={`${f.key}-options`}>
                      {staffOptions.map((o) => <option key={o} value={o} />)}
                    </datalist>
                  </>
                ) : (
                  <input type={f.type || 'text'} value={form[f.key] || ''} onChange={(e) => setField(f.key, e.target.value)} />
                )}
              </label>
            ))}
          </div>
          <label style={{ display: 'block', marginBottom: 16 }}>
            {t('工種', lang)}（{t('可複選', lang)}）
            <CheckboxGroup options={JOBS} values={jobs} onChange={setJobs} lang={lang} />
          </label>
          <label style={{ display: 'block', marginBottom: 16 }}>
            {t('配對雇主', lang)}（{t('可複選', lang)}）
            <EmployerCheckboxGroup employers={employers} values={employerIds} onChange={setEmployerIds} />
          </label>

          <ResumeInternalFields
            form={form}
            setField={setField}
            lang={lang}
            domesticExperience={domesticExperience}
            setDomesticExperience={setDomesticExperience}
            overseasExperience={overseasExperience}
            setOverseasExperience={setOverseasExperience}
          />

          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
            {onRemove && <button type="button" className="danger" onClick={onRemove}>{t('刪除', lang)}</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
