import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';
import { downloadWorkerResumeDocx } from '../../lib/laborAgencyResumeDocx';
import ResumeInternalFields from '../../components/ResumeInternalFields';
import { emptyExperienceRow, normalizeExperienceRow } from '../../pages/LaborAgencyResumeApplyPage';
import { JOBS, workerEmployerIds, employerLabel } from './constants';

function parseExperience(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// 工種改複選後存成 JSON 陣列字串；舊資料是單一字串（例如「製造業」），
// 不是 JSON，parse 失敗或結果不是陣列就當成單一項目的陣列，舊資料不用
// 遷移也能正常顯示/編輯。
function parseJobs(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [raw];
  } catch { return [raw]; }
}

// 工種複選群組，同時可以自行輸入清單以外的項目——跟 vietnam 系統
// StudentsPage.jsx 的 MultiSelectEditor 同一套做法：自訂項目額外顯示在
// 固定選項後面，旁邊有「×」可以移除。
function CheckboxGroup({ options, values, onChange, lang }) {
  const [newItem, setNewItem] = useState('');
  const extraItems = values.filter((v) => !options.includes(v));

  function toggle(o) {
    onChange(values.includes(o) ? values.filter((v) => v !== o) : [...values, o]);
  }
  function addCustom() {
    const text = newItem.trim();
    if (!text || values.includes(text)) return;
    onChange([...values, text]);
    setNewItem('');
  }
  function removeCustom(o) {
    onChange(values.filter((v) => v !== o));
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[...options, ...extraItems].map((o) => (
          <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 400 }}>
            <input type="checkbox" checked={values.includes(o)} onChange={() => toggle(o)} />
            {t(o, lang)}
            {!options.includes(o) && (
              <button type="button" className="danger small" onClick={() => removeCustom(o)}>×</button>
            )}
          </label>
        ))}
      </div>
      <div className="row-actions" style={{ marginTop: 8 }}>
        <input
          placeholder={t('輸入自訂項目', lang)}
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          style={{ flex: 1 }}
        />
        <button type="button" onClick={addCustom}>+ {t('新增項目', lang)}</button>
      </div>
    </div>
  );
}

// 配對雇主複選：跟工種的 CheckboxGroup 不同，選項是雇主需求單裡的既有
// 雇主（value 是雇主 id，顯示用雇主名稱），不開放自行輸入新項目。存成
// employerIds（JSON 字串陣列），跟「移工管理」既有的單一 employerId
// （「新增雇主安排」功能寫的）合併顯示，見 constants.js 的
// workerEmployerIds()。
function EmployerCheckboxGroup({ employers, values, onChange }) {
  function toggle(id) {
    onChange(values.includes(id) ? values.filter((v) => v !== id) : [...values, id]);
  }
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {employers.map((emp) => (
        <label key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 400 }}>
          <input type="checkbox" checked={values.includes(emp.id)} onChange={() => toggle(emp.id)} />
          {emp.name}
        </label>
      ))}
      {employers.length === 0 && <span className="muted">尚未建立雇主需求單</span>}
    </div>
  );
}

// 移工名冊：跟「移工管理」共用同一個 laborAgency_workers 集合，但只看
// 工人的履歷資料，不含案件階段／雇主配對這些流程資訊——移工送出履歷後
// 會自動在這裡出現一筆（見 pages/LaborAgencyResumeApplyPage.jsx），內部
// 人員也可以在這裡直接新增/編輯，表單欄位跟公開填寫頁完全一致(見
// components/ResumeInternalFields.jsx)，另外加上工種/配對雇主/招募人員
// 這幾個履歷表沒有、但移工名冊建檔時就需要填的欄位。護照效期改在「移工
// 管理」(WorkersPage.jsx) 填寫，這裡的表單不重複開一個輸入框，但清單
// 還是顯示（可能是那邊填過的）。「下載履歷表」產生排版跟紙本履歷表
// 一樣的 Word 文件(lib/laborAgencyResumeDocx.js)，不是 Excel 表格。
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'name', label: '姓名' }, { key: 'vietnameseName', label: '越文姓名' },
  { key: 'gender', label: '性別' }, { key: 'province', label: '省份' }, { key: 'job', label: '工種' },
  { key: 'passportExpiry', label: '護照效期' }, { key: 'note', label: '備註' },
];

export default function WorkerRosterPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'workerRoster', role, overrides);
  const { rows: workers, loading, add, update, remove } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');
  const { rows: users } = useCollection('laborAgency_users');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('laborAgency_workers', CSV_FIELDS, { entityLabel: '工人資料', requiredKeys: ['name'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const filtered = workers
    .filter((w) => !searchQuery || `${w.name || ''} ${w.vietnameseName || ''} ${w.province || ''}`.toLowerCase().includes(searchQuery))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      // 新增時沿用「移工管理」流程的第一個階段，避免新建的工人在「移工
      // 管理」的流程管理頁面裡沒有階段可顯示。
      await add({ ...data, stage: '雇主確認', updatedAt: Date.now() });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('移工名冊', lang)}</h2>
          <div className="page-desc">{t('工人基本資料名冊，不含案件階段與雇主配對；移工送出履歷後會自動出現在這裡', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          <input placeholder={t('搜尋姓名或省份', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增工人', lang)}</button>}
          <ImportExportButtons rows={workers} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>{t('姓名', lang)}</th><th>{t('越文姓名', lang)}</th><th>{t('性別', lang)}</th>
                <th>{t('省份', lang)}</th><th>{t('工種', lang)}</th><th>{t('配對雇主', lang)}</th><th>{t('護照效期', lang)}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr key={w.id}>
                  <td style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => setEditing(w)}>{w.name}</td>
                  <td>{w.vietnameseName || '—'}</td>
                  <td>{t(w.gender, lang) || '—'}</td>
                  <td>{w.province || '—'}</td>
                  <td>{parseJobs(w.job).map((j) => t(j, lang)).join('、') || '—'}</td>
                  <td>{workerEmployerIds(w).map((id) => employerLabel(employers, id, lang)).join('、') || t('尚未配對', lang)}</td>
                  <td>{w.passportExpiry || '—'}</td>
                  <td className="row-actions">
                    <button onClick={() => downloadWorkerResumeDocx(w)}>{t('下載履歷表', lang)}</button>
                    {canEditPage && (
                      <>
                        <button onClick={() => setEditing(w)}>{t('編輯', lang)}</button>
                        <button className="danger" onClick={() => remove(w.id)}>{t('刪除', lang)}</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="muted">{t('尚未建立工人資料', lang)}</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}
      {editing && <WorkerRosterFormModal initial={editing} employers={employers} users={users} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function WorkerRosterFormModal({ initial, employers, users, onCancel, onSave, lang }) {
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
        <h3 style={{ marginTop: 0 }}>{initial.id ? t('編輯工人', lang) : t('新增工人', lang)}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              {t('招募人員', lang)}
              <input
                list="assignedRecruiter-options"
                value={form.assignedRecruiter || ''}
                placeholder={t('選擇或自行輸入姓名', lang)}
                onChange={(e) => setField('assignedRecruiter', e.target.value)}
              />
              <datalist id="assignedRecruiter-options">
                {staffOptions.map((o) => <option key={o} value={o} />)}
              </datalist>
            </label>
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
          </div>
        </form>
      </div>
    </div>
  );
}
