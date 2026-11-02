import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { INDUSTRIES } from './constants';

const GENDER_REQUIREMENTS = ['不限', '男', '女'];
const MEAL_ARRANGEMENTS = ['供餐', '不供餐', '自理（補貼伙食費）'];
const LANGUAGE_REQUIREMENTS = ['不會', '一點點', '可以溝通', '流利中文'];
const WORKER_IDENTITIES = ['第一次出國', '曾經在台灣', '指定工'];

// 基本欄位：複選/數字/單選直接用一般欄位；需求/福利各自可以自行新增項目
// （otherRequirements/otherBenefits 各自存成 JSON 字串陣列），不是固定選項
// 涵蓋不了的情況可以自行補充，跟 PositionsPage.jsx 的其他福利同一套做法。
const FIELDS = [
  { key: 'name', label: '雇主名稱', required: true },
  { key: 'industry', label: '產業別', options: INDUSTRIES },
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
  const { system, role, overrides } = useOutletContext();
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
          <h2>雇主需求單</h2>
          <div className="page-desc">雇主的工作內容、需求條件、薪資福利等完整資訊；在移工資料指定雇主後，這裡會自動算出已配對與缺口{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增雇主需求</button>}
          <ImportExportButtons rows={employers} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        employers.length === 0 ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>還沒有雇主需求單。新增後，可在移工資料中指定雇主，這裡會自動計算已配對與缺口。</p></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {employers.map((e) => {
              const matched = workers.filter((w) => w.employerId === e.id).length;
              const demand = +e.demand || 0;
              const remaining = demand - matched;
              const otherRequirements = parseList(e.otherRequirements);
              const otherBenefits = parseList(e.otherBenefits);
              return (
                <div className="card" key={e.id}>
                  <h3 style={{ marginTop: 0 }}>{e.name}</h3>
                  <div className="muted" style={{ fontSize: 13 }}>{e.industry || '—'}{e.contact ? `　聯絡人 ${e.contact}` : ''}</div>
                  {e.workAddress && <div className="muted" style={{ fontSize: 13 }}>工作地址：{e.workAddress}</div>}
                  <div style={{ margin: '10px 0' }}>
                    已配對 <b>{matched}</b> / 需求 <b>{demand}</b>
                    {e.genderRequirement && e.genderRequirement !== '不限' ? `（限${e.genderRequirement}）` : ''}
                    {e.ageRequirement ? `，年齡 ${e.ageRequirement}` : ''}{' '}
                    {remaining > 0 ? <span className="tag tag-amber">缺 {remaining} 人</span> : <span className="tag tag-green">已滿額</span>}
                  </div>
                  {e.jobDescription && <div style={{ fontSize: 13, marginBottom: 6, whiteSpace: 'pre-wrap' }}><strong>工作內容：</strong>{e.jobDescription}</div>}
                  {otherRequirements.length > 0 && <div style={{ fontSize: 13, marginBottom: 6 }}><strong>其他需求：</strong>{otherRequirements.join('、')}</div>}
                  <div style={{ fontSize: 13, marginBottom: 6 }}>
                    {e.salary && <div>薪資：{e.salary}</div>}
                    {e.housingFee && <div>住宿費：{e.housingFee}</div>}
                    {e.mealArrangement && <div>供餐情況：{e.mealArrangement}</div>}
                    {otherBenefits.length > 0 && <div>其他福利：{otherBenefits.join('、')}</div>}
                    {e.overtimeArrangement && <div>加班情況：{e.overtimeArrangement}</div>}
                    {e.languageRequirement && <div>語文要求：{e.languageRequirement}</div>}
                    {e.workerIdentity && <div>工人身分：{e.workerIdentity}</div>}
                  </div>
                  {e.specialNotes && <div className="muted" style={{ fontSize: 13, marginBottom: 6, whiteSpace: 'pre-wrap' }}><strong>特殊狀況：</strong>{e.specialNotes}</div>}
                  {e.note && <div className="muted" style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{e.note}</div>}
                  {canEditPage && (
                    <div className="row-actions" style={{ marginTop: 10 }}>
                      <button onClick={() => setEditing(e)}>編輯</button>
                      <button className="danger" onClick={() => remove(e.id)}>刪除</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
      {editing && <EmployerFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function ListEditor({ label, addLabel, items, onChange }) {
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
      <h4 style={{ marginBottom: 6 }}>{label}</h4>
      {items.length > 0 && (
        <ul className="note-list">
          {items.map((v, i) => (
            <li key={i}>
              <div className="row-actions">
                <span style={{ flex: 1 }}>{v}</span>
                <button type="button" className="danger" onClick={() => removeAt(i)}>移除</button>
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
        <button type="button" onClick={add}>{addLabel}</button>
      </div>
    </div>
  );
}

function EmployerFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const otherRequirements = parseList(form.otherRequirements);
  const otherBenefits = parseList(form.otherBenefits);

  function handleSubmit(e) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯雇主需求' : '新增雇主需求'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            {FIELDS.filter((f) => f.type !== 'textarea').map((f) => (
              <label key={f.key}>
                {f.label}
                {f.options ? (
                  <select value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    <option value="">請選擇</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} required={f.required} value={form[f.key] ?? (f.key === 'demand' ? 1 : '')} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
          </div>
          <label style={{ display: 'block', marginTop: 12 }}>
            工作內容
            <textarea rows={2} value={form.jobDescription || ''} onChange={(e) => setForm({ ...form, jobDescription: e.target.value })} />
          </label>
          <ListEditor label="其他需求" addLabel="+ 新增需求" items={otherRequirements} onChange={(next) => setForm({ ...form, otherRequirements: JSON.stringify(next) })} />
          <ListEditor label="其他福利" addLabel="+ 新增福利" items={otherBenefits} onChange={(next) => setForm({ ...form, otherBenefits: JSON.stringify(next) })} />
          <label style={{ display: 'block' }}>
            特殊狀況
            <textarea rows={2} value={form.specialNotes || ''} onChange={(e) => setForm({ ...form, specialNotes: e.target.value })} />
          </label>
          <label style={{ display: 'block' }}>
            備註
            <textarea rows={3} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ marginBottom: 16 }} />
          </label>
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
