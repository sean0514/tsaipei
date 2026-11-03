import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';
import { INDUSTRIES } from './constants';

const GENDER_REQUIREMENTS = ['不限', '男', '女'];
const MEAL_ARRANGEMENTS = ['供餐', '不供餐', '自理（補貼伙食費）'];
const LANGUAGE_REQUIREMENTS = ['不會', '一點點', '可以溝通', '流利中文'];
const WORKER_IDENTITIES = ['第一次出國', '曾經在台灣', '指定工'];
// 工作地點縣市分類，只到縣市層級（不細到鄉鎮市區），用來把雇主需求單
// 依工作地點分組顯示。
const COUNTIES = [
  '臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市', '基隆市', '新竹市', '嘉義市',
  '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣',
  '澎湖縣', '金門縣', '連江縣',
];
const UNSET_AGENCY = '__unset_agency__';

// 基本欄位：複選/數字/單選直接用一般欄位；需求/福利各自可以自行新增項目
// （otherRequirements/otherBenefits 各自存成 JSON 字串陣列），不是固定選項
// 涵蓋不了的情況可以自行補充，跟 PositionsPage.jsx 的其他福利同一套做法。
const FIELDS = [
  { key: 'docNumber', label: '函文編號' },
  { key: 'name', label: '雇主名稱', required: true },
  { key: 'agencyName', label: '仲介名稱' },
  { key: 'industry', label: '產業別', options: INDUSTRIES },
  { key: 'county', label: '工作地點（縣市）', options: COUNTIES },
  { key: 'workAddress', label: '工作地址' },
  { key: 'jobDescription', label: '工作內容', type: 'textarea' },
  { key: 'genderRequirement', label: '需求性別', options: GENDER_REQUIREMENTS },
  { key: 'demand', label: '需求人數', type: 'number' },
  { key: 'ageRequirement', label: '需求年齡' },
  { key: 'salary', label: '薪資' },
  { key: 'housingFee', label: '住宿費' },
  { key: 'mealArrangement', label: '供餐情況', options: MEAL_ARRANGEMENTS },
  { key: 'overtimeArrangement', label: '加班情況' },
  { key: 'languageRequirement', label: '語文要求', options: LANGUAGE_REQUIREMENTS },
  { key: 'workerIdentity', label: '工人身分', options: WORKER_IDENTITIES },
  { key: 'contact', label: '聯絡人' },
  { key: 'specialNotes', label: '特殊狀況', type: 'textarea' },
  { key: 'note', label: '備註', type: 'textarea' },
];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, ...FIELDS,
  { key: 'otherRequirements', label: '其他需求' }, { key: 'otherBenefits', label: '其他福利' },
];

function parseList(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export default function EmployersPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'employers', role, overrides);
  const { rows: employers, loading, add, update, remove } = useCollection('laborAgency_employers');
  const { rows: workers } = useCollection('laborAgency_workers');
  const [editing, setEditing] = useState(null);
  const { handleExport, handleImport } = useCsvOverwrite('laborAgency_employers', CSV_FIELDS, { entityLabel: '雇主需求單', requiredKeys: ['name'], canEdit: canEditPage });

  async function handleSave(data) {
    const payload = { ...data, demand: Math.max(0, parseInt(data.demand, 10) || 0) };
    if (payload.id) {
      const { id, ...rest } = payload;
      await update(id, rest);
    } else {
      await add(payload);
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('雇主需求單', lang)}</h2>
          <div className="page-desc">{t('雇主的工作內容、需求條件、薪資福利等完整資訊；在移工資料指定雇主後，這裡會自動算出已配對與缺口', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增雇主需求', lang)}</button>}
          <ImportExportButtons rows={employers} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        employers.length === 0 ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>{t('還沒有雇主需求單。新增後，可在移工資料中指定雇主，這裡會自動計算已配對與缺口。', lang)}</p></div>
        ) : (
          [...new Set(employers.map((e) => e.agencyName).filter(Boolean)), UNSET_AGENCY].map((agencyName) => {
            const group = employers.filter((e) => (e.agencyName || UNSET_AGENCY) === agencyName);
            if (group.length === 0) return null;
            return (
              <div key={agencyName} style={{ marginBottom: 24 }}>
                <h3 style={{ marginBottom: 10 }}>
                  {agencyName === UNSET_AGENCY ? t('未填仲介名稱', lang) : agencyName}
                  <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>（{group.length}）</span>
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                  {group.map((e) => {
                    const matched = workers.filter((w) => w.employerId === e.id).length;
                    const demand = +e.demand || 0;
                    const remaining = demand - matched;
                    const otherRequirements = parseList(e.otherRequirements);
                    const otherBenefits = parseList(e.otherBenefits);
                    return (
                      <div className="card" key={e.id}>
                        <h3 style={{ marginTop: 0 }}>{e.name}</h3>
                        {canSeeDocNumber(role) && e.docNumber && <div className="muted" style={{ fontSize: 13 }}>{t('函文編號：', lang)}{e.docNumber}</div>}
                        <div className="muted" style={{ fontSize: 13 }}>{t(e.industry, lang) || '—'}{e.county ? `　${t(e.county, lang)}` : ''}{e.contact ? `　${t('聯絡人', lang)} ${e.contact}` : ''}</div>
                        {e.workAddress && <div className="muted" style={{ fontSize: 13 }}>{t('工作地址：', lang)}{e.workAddress}</div>}
                        <div style={{ margin: '10px 0' }}>
                          {t('已配對', lang)} <b>{matched}</b> / {t('需求', lang)} <b>{demand}</b>
                          {e.genderRequirement && e.genderRequirement !== '不限' ? `（${t('限', lang)}${t(e.genderRequirement, lang)}）` : ''}
                          {e.ageRequirement ? `，${t('年齡', lang)} ${e.ageRequirement}` : ''}{' '}
                          {remaining > 0 ? <span className="tag tag-amber">{t('缺', lang)} {remaining} {t('人', lang)}</span> : <span className="tag tag-green">{t('已滿額', lang)}</span>}
                        </div>
                        {e.jobDescription && <div style={{ fontSize: 13, marginBottom: 6, whiteSpace: 'pre-wrap' }}><strong>{t('工作內容：', lang)}</strong>{e.jobDescription}</div>}
                        {otherRequirements.length > 0 && <div style={{ fontSize: 13, marginBottom: 6 }}><strong>{t('其他需求：', lang)}</strong>{otherRequirements.join('、')}</div>}
                        <div style={{ fontSize: 13, marginBottom: 6 }}>
                          {e.salary && <div>{t('薪資：', lang)}{e.salary}</div>}
                          {e.housingFee && <div>{t('住宿費：', lang)}{e.housingFee}</div>}
                          {e.mealArrangement && <div>{t('供餐情況：', lang)}{t(e.mealArrangement, lang)}</div>}
                          {otherBenefits.length > 0 && <div>{t('其他福利：', lang)}{otherBenefits.join('、')}</div>}
                          {e.overtimeArrangement && <div>{t('加班情況：', lang)}{e.overtimeArrangement}</div>}
                          {e.languageRequirement && <div>{t('語文要求：', lang)}{t(e.languageRequirement, lang)}</div>}
                          {e.workerIdentity && <div>{t('工人身分：', lang)}{t(e.workerIdentity, lang)}</div>}
                        </div>
                        {e.specialNotes && <div className="muted" style={{ fontSize: 13, marginBottom: 6, whiteSpace: 'pre-wrap' }}><strong>{t('特殊狀況：', lang)}</strong>{e.specialNotes}</div>}
                        {e.note && <div className="muted" style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{e.note}</div>}
                        {canEditPage && (
                          <div className="row-actions" style={{ marginTop: 10 }}>
                            <button onClick={() => setEditing(e)}>{t('編輯', lang)}</button>
                            <button className="danger" onClick={() => remove(e.id)}>{t('刪除', lang)}</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )
      )}
      {editing && <EmployerFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} role={role} />}
    </div>
  );
}

function ListEditor({ label, addLabel, items, onChange, lang }) {
  const [text, setText] = useState('');
  function add() {
    const v = text.trim();
    if (!v) return;
    onChange([...items, v]);
    setText('');
  }
  function removeAt(i) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ marginBottom: 6 }}>{t(label, lang)}</h4>
      {items.length > 0 && (
        <ul className="note-list">
          {items.map((v, i) => (
            <li key={i}>
              <div className="row-actions">
                <span style={{ flex: 1 }}>{v}</span>
                <button type="button" className="danger" onClick={() => removeAt(i)}>{t('移除', lang)}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="row-actions">
        <input
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(); } }}
          style={{ flex: 1 }}
        />
        <button type="button" onClick={add}>{t(addLabel, lang)}</button>
      </div>
    </div>
  );
}

// 函文編號是行政專用欄位，只有「行政人員」跟「系統管理員」能看到/填寫
// （系統管理員是最高權限，本來就能看到所有行政專用欄位；用「以角色
// 預覽」功能切換成其他角色時才會跟著被擋），其他角色的表單跟卡片都
// 不顯示這個欄位。
const DOC_NUMBER_ROLES = ['行政人員', '系統管理員'];
function canSeeDocNumber(role) {
  return DOC_NUMBER_ROLES.includes(role);
}
function visibleFields(role) {
  return FIELDS.filter((f) => f.key !== 'docNumber' || canSeeDocNumber(role));
}

function EmployerFormModal({ initial, onCancel, onSave, lang, role }) {
  const [form, setForm] = useState(initial);
  const otherRequirements = parseList(form.otherRequirements);
  const otherBenefits = parseList(form.otherBenefits);
  const fields = visibleFields(role);

  function handleSubmit(e) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯雇主需求', lang) : t('新增雇主需求', lang)}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            {fields.filter((f) => f.type !== 'textarea').map((f) => (
              <label key={f.key}>
                {t(f.label, lang)}
                {f.options ? (
                  <select value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    <option value="">{t('請選擇', lang)}</option>
                    {f.options.map((o) => <option key={o} value={o}>{t(o, lang)}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} required={f.required} value={form[f.key] ?? (f.key === 'demand' ? 1 : '')} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
          </div>
          <label style={{ display: 'block', marginTop: 12 }}>
            {t('工作內容', lang)}
            <textarea rows={2} value={form.jobDescription || ''} onChange={(e) => setForm({ ...form, jobDescription: e.target.value })} />
          </label>
          <ListEditor label="其他需求" addLabel="+ 新增需求" items={otherRequirements} onChange={(next) => setForm({ ...form, otherRequirements: JSON.stringify(next) })} lang={lang} />
          <ListEditor label="其他福利" addLabel="+ 新增福利" items={otherBenefits} onChange={(next) => setForm({ ...form, otherBenefits: JSON.stringify(next) })} lang={lang} />
          <label style={{ display: 'block' }}>
            {t('特殊狀況', lang)}
            <textarea rows={2} value={form.specialNotes || ''} onChange={(e) => setForm({ ...form, specialNotes: e.target.value })} />
          </label>
          <label style={{ display: 'block' }}>
            {t('備註', lang)}
            <textarea rows={3} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ marginBottom: 16 }} />
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
