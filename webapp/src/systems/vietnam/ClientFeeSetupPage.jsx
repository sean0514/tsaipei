import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { SUMMARY_MAP_FIELDS, DETAIL_MAP_FIELDS, parseCellMap, fileToBase64 } from '../../lib/clientInvoiceTemplate';
import { t } from '../../lib/i18n';

const BILLING_TYPES = ['固定制', '月費制'];
const MAX_TEMPLATE_SIZE = 700 * 1024;

const COMMON_FIELDS = [
  { key: 'projectCode', label: '專案編號', required: true },
  { key: 'client', label: '客戶名稱', required: true },
  { key: 'taxId', label: '統一編號' },
  { key: 'billingType', label: '收費類型', options: BILLING_TYPES },
  { key: 'billingStartDate', label: '計費起算日', type: 'date' },
  { key: 'billingSettleDay', label: '請款結算日' },
];

const CHARGE_TIMING_OPTIONS = [
  '第一次入境當月收取', '入境3個月收取', '入境6個月收取', '入境9個月收取', '入境12個月收取',
  '第二次入境當月收取', '確認錄取即收取',
];

const MONTHLY_RECURRING_FIELDS = [
  { key: 'monthlyServiceFee', label: '每月服務費', type: 'number' },
  { key: 'monthlyDormFee', label: '每月宿舍費', type: 'number' },
  { key: 'monthlyDormManageFee', label: '每月宿管費', type: 'number' },
];

const FIXED_FIELDS = [
  { key: 'firstChargeAmount', label: '第一次收費金額', type: 'number' },
  { key: 'firstChargeDate', label: '第一次收費時間', options: CHARGE_TIMING_OPTIONS },
  { key: 'secondChargeAmount', label: '第二次收費金額', type: 'number' },
  { key: 'secondChargeDate', label: '第二次收費時間', options: CHARGE_TIMING_OPTIONS },
  ...MONTHLY_RECURRING_FIELDS,
];

const MONTHLY_FIELDS = [
  { key: 'monthlyProcessingFee', label: '每月辦件費', type: 'number' },
  ...MONTHLY_RECURRING_FIELDS,
];

function typeFields(billingType) {
  return billingType === '固定制' ? FIXED_FIELDS : MONTHLY_FIELDS;
}

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, ...COMMON_FIELDS,
  { key: 'firstChargeAmount', label: '第一次收費金額' }, { key: 'firstChargeDate', label: '第一次收費時間' },
  { key: 'secondChargeAmount', label: '第二次收費金額' }, { key: 'secondChargeDate', label: '第二次收費時間' },
  { key: 'monthlyProcessingFee', label: '每月辦件費' }, ...MONTHLY_RECURRING_FIELDS,
  { key: 'billDormFee', label: '是否請款住宿費' }, { key: 'otherFees', label: '其他費用(JSON)' }, { key: 'reviewStatus', label: '審核狀態' },
];

const TOGGLE_COLUMNS = (() => {
  const seen = new Map();
  [...COMMON_FIELDS.filter((f) => f.key !== 'billingType'), ...FIXED_FIELDS, ...MONTHLY_FIELDS].forEach((f) => {
    if (!seen.has(f.key)) seen.set(f.key, f);
  });
  seen.set('otherFees', { key: 'otherFees', label: '其他費用' });
  seen.set('billDormFee', { key: 'billDormFee', label: '是否請款住宿費' });
  return [...seen.values()];
})();

function parseOtherFees(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// 複製自 systems/tsaipei/ClientFeeSetupPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。lib/clientInvoiceTemplate.js 是跨系統
// 共用的純邏輯(請款單範本解析)，不用額外複製。
export default function ClientFeeSetupPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'clientFeeSetup', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('vietnam_clientFeeSetup');
  const { rows: positions } = useCollection('vietnam_positions');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [visibleKeys, setVisibleKeys] = useState(() => new Set(TOGGLE_COLUMNS.map((f) => f.key)));
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_clientFeeSetup', CSV_FIELDS, { entityLabel: '客戶費用建檔', requiredKeys: ['projectCode', 'client'], canEdit: canEditPage });

  function toggleColumn(key) {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows
    .filter((r) => !searchQuery || `${r.projectCode || ''} ${r.client || ''}`.toLowerCase().includes(searchQuery))
    .sort((a, b) => (a.projectCode || '').localeCompare(b.projectCode || ''));
  const groups = { 待審核: [], 固定制: [], 月費制: [] };
  filteredRows.forEach((r) => {
    if (r.reviewStatus !== '已審核') { groups.待審核.push(r); return; }
    groups[r.billingType === '固定制' ? '固定制' : '月費制'].push(r);
  });

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ reviewStatus: '待審核', ...data });
    }
    setEditing(null);
  }

  async function handleCopyFromPositions() {
    const existing = new Set(rows.map((r) => r.projectCode));
    const seen = new Set();
    const toAdd = [];
    positions.forEach((p) => {
      if (!p.projectCode || !p.company) return;
      if (existing.has(p.projectCode) || seen.has(p.projectCode)) return;
      seen.add(p.projectCode);
      toAdd.push({ projectCode: p.projectCode, client: p.company, reviewStatus: '待審核' });
    });
    if (toAdd.length === 0) { alert('實習單位裡的專案編號都已經在這裡了，沒有新的可以帶入。'); return; }
    for (const item of toAdd) await add(item);
    alert(`已從實習單位複製帶入 ${toAdd.length} 筆，請補上費用金額並審核。`);
  }

  function otherFeesSummary(r) {
    const fees = parseOtherFees(r.otherFees);
    if (!fees.length) return '—';
    return fees.map((f) => `${f.label || '未命名'}：${f.amount || '—'}`).join('、');
  }

  const detailColumns = (billingType) => [...COMMON_FIELDS.filter((f) => f.key !== 'billingType'), ...typeFields(billingType)].filter((f) => visibleKeys.has(f.key));
  const showOtherFees = visibleKeys.has('otherFees');
  const showBillDormFee = visibleKeys.has('billDormFee');

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('客戶費用建檔', lang)}</h2>
          <div className="page-desc">{t('依專案設定各客戶每月應收取的費用金額', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增費率', lang)}</button>}
          {canEditPage && <button onClick={handleCopyFromPositions}>{t('從實習單位複製帶入', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有客戶費用設定，請先下載備份再匯入。新增的費率預設「待審核」，按下「審核」後才會歸入固定制／月費制分類。', lang)}</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <p className="muted" style={{ marginTop: 0 }}>{t('「客戶請款」的費率來源，一個專案＋客戶一列，不是計算結果本身。', lang)}</p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'start', marginBottom: 12, flexWrap: 'wrap' }}>
          <input placeholder={t('搜尋專案編號或客戶', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
          <details>
            <summary style={{ cursor: 'pointer' }}>{t('選擇顯示欄位', lang)}</summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', padding: '8px 4px', maxWidth: 480 }}>
              {TOGGLE_COLUMNS.map((f) => (
                <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                  <input type="checkbox" checked={visibleKeys.has(f.key)} onChange={() => toggleColumn(f.key)} />
                  {t(f.label, lang)}
                </label>
              ))}
            </div>
          </details>
        </div>
        {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h3 style={{ margin: '0 0 8px' }}>{t('待審核', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups.待審核.length} {t('筆', lang)}</span></h3>
              <div className="table-wrap"><table>
                <thead><tr><th>{t('專案編號', lang)}</th><th>{t('客戶名稱', lang)}</th><th>{t('統一編號', lang)}</th><th>{t('收費類型', lang)}</th><th>{t('其他費用', lang)}</th>{canEditPage && <th></th>}</tr></thead>
                <tbody>
                  {groups.待審核.map((r) => (
                    <tr key={r.id}>
                      <td>{r.projectCode || '—'}</td>
                      <td>{r.client || '—'}</td>
                      <td>{r.taxId || '—'}</td>
                      <td>{r.billingType || '—'}</td>
                      <td>{otherFeesSummary(r)}</td>
                      {canEditPage && (
                        <td className="row-actions">
                          <button onClick={() => update(r.id, { reviewStatus: '已審核' })}>{t('審核', lang)}</button>
                          <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                          <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {groups.待審核.length === 0 && <tr><td colSpan={canEditPage ? 6 : 5} className="muted">{t('沒有資料', lang)}</td></tr>}
                </tbody>
              </table></div>
            </div>
            {BILLING_TYPES.map((type) => {
              const tableFields = detailColumns(type);
              return (
                <div key={type}>
                  <h3 style={{ margin: '0 0 8px' }}>{type} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[type].length} {t('筆', lang)}</span></h3>
                  <div className="table-wrap"><table>
                    <thead><tr>{tableFields.map((f) => <th key={f.key}>{t(f.label, lang)}</th>)}{showOtherFees && <th>{t('其他費用', lang)}</th>}{showBillDormFee && <th>{t('是否請款住宿費', lang)}</th>}{canEditPage && <th></th>}</tr></thead>
                    <tbody>
                      {groups[type].map((r) => (
                        <tr key={r.id}>
                          {tableFields.map((f) => <td key={f.key}>{r[f.key] || '—'}</td>)}
                          {showOtherFees && <td>{otherFeesSummary(r)}</td>}
                          {showBillDormFee && <td>{r.billDormFee === '否' ? '否' : '是'}</td>}
                          {canEditPage && (
                            <td className="row-actions">
                              <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                              <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                            </td>
                          )}
                        </tr>
                      ))}
                      {groups[type].length === 0 && <tr><td colSpan={tableFields.length + (showOtherFees ? 1 : 0) + (showBillDormFee ? 1 : 0) + (canEditPage ? 1 : 0)} className="muted">{t('沒有資料', lang)}</td></tr>}
                    </tbody>
                  </table></div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {editing && <ClientFeeFormModal initial={editing} positions={positions} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function OtherFeesEditor({ fees, onChange, lang }) {
  function updateRow(i, patch) {
    onChange(fees.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function removeRow(i) {
    onChange(fees.filter((_, idx) => idx !== i));
  }
  function addRow() {
    onChange([...fees, { label: '', amount: '' }]);
  }

  return (
    <div>
      {fees.map((f, i) => (
        <div key={i} className="form-grid" style={{ marginBottom: 8 }}>
          <label>
            {t('項目名稱', lang)}
            <input value={f.label || ''} onChange={(e) => updateRow(i, { label: e.target.value })} />
          </label>
          <label>
            {t('金額', lang)}
            <input value={f.amount || ''} onChange={(e) => updateRow(i, { amount: e.target.value })} />
          </label>
          <button type="button" onClick={() => removeRow(i)} style={{ alignSelf: 'end' }}>{t('移除', lang)}</button>
        </div>
      ))}
      <button type="button" onClick={addRow}>+ {t('新增其他費用', lang)}</button>
    </div>
  );
}

function ClientFeeFormModal({ initial, positions, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const projectCodes = [...new Set(positions.map((p) => p.projectCode).filter(Boolean))].sort();
  const companies = [...new Set(positions.map((p) => p.company).filter(Boolean))].sort();
  if (form.client && !companies.includes(form.client)) companies.push(form.client);
  const companyByProjectCode = {};
  positions.forEach((p) => { if (p.projectCode && p.company && !companyByProjectCode[p.projectCode]) companyByProjectCode[p.projectCode] = p.company; });
  const otherFees = parseOtherFees(form.otherFees);
  const cellMap = parseCellMap(form.invoiceCellMap);

  function handleProjectCodeChange(code) {
    setForm({ ...form, projectCode: code, client: companyByProjectCode[code] || form.client });
  }

  function setOtherFees(next) {
    setForm({ ...form, otherFees: JSON.stringify(next) });
  }

  function setCellMap(next) {
    setForm({ ...form, invoiceCellMap: JSON.stringify(next) });
  }

  async function handleTemplateUpload(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_TEMPLATE_SIZE) {
      alert('範本檔案太大（上限約 700KB），請精簡後再上傳。');
      return;
    }
    const base64 = await fileToBase64(file);
    setForm({ ...form, invoiceTemplateData: base64, invoiceTemplateName: file.name });
  }

  function removeTemplate() {
    setForm({ ...form, invoiceTemplateData: '', invoiceTemplateName: '', invoiceCellMap: '' });
  }

  function handleSubmit(e) {
    e.preventDefault();
    const cleanedFees = parseOtherFees(form.otherFees).filter((f) => f.label);
    onSave({ ...form, otherFees: JSON.stringify(cleanedFees) });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯費率', lang) : t('新增費率', lang)}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              {t('專案編號', lang)}
              <select value={form.projectCode || ''} onChange={(e) => handleProjectCodeChange(e.target.value)}>
                <option value="">{t('請選擇', lang)}</option>
                {projectCodes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              {t('客戶名稱', lang)}
              <select required value={form.client || ''} onChange={(e) => setForm({ ...form, client: e.target.value })}>
                <option value="">{t('請選擇客戶', lang)}</option>
                {companies.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {COMMON_FIELDS.filter((f) => !['projectCode', 'client'].includes(f.key)).map((f) => (
              <label key={f.key}>
                {t(f.label, lang)}
                {f.options ? (
                  <select required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    <option value="">{t('請選擇', lang)}</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
            {form.billingType ? typeFields(form.billingType).map((f) => (
              <label key={f.key}>
                {t(f.label, lang)}
                {f.options ? (
                  <select value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    <option value="">{t('請選擇', lang)}</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </label>
            )) : <p className="muted" style={{ gridColumn: 'span 2' }}>{t('請先選擇收費類型，才會顯示對應的費用欄位。', lang)}</p>}
            <label>
              {t('是否請款住宿費', lang)}
              <select value={form.billDormFee || '是'} onChange={(e) => setForm({ ...form, billDormFee: e.target.value })}>
                <option value="是">{t('是', lang)}</option>
                <option value="否">{t('否', lang)}</option>
              </select>
            </label>
          </div>
          <h4>{t('其他費用（可自行新增）', lang)}</h4>
          <OtherFeesEditor fees={otherFees} onChange={setOtherFees} lang={lang} />
          <h4>{t('客戶請款格式（選填）', lang)}</h4>
          <p className="muted" style={{ marginTop: 0 }}>{t('上傳這個客戶自己要求的請款單 Excel 格式，並設定各項資料要填入哪個儲存格；「客戶請款計算」下載請款單時會改用這份格式，沒有上傳就照原本系統內建的格式產生。', lang)}</p>
          {form.invoiceTemplateName ? (
            <p>{t('目前範本', lang)}：{form.invoiceTemplateName} <button type="button" onClick={removeTemplate}>{t('移除範本', lang)}</button></p>
          ) : (
            <label style={{ display: 'block', marginBottom: 8 }}>
              {t('上傳範本（.xlsx）', lang)}
              <input type="file" accept=".xlsx" onChange={handleTemplateUpload} />
            </label>
          )}
          {form.invoiceTemplateName && (
            <div>
              <p className="muted">{t('欄位對應：填入儲存格位置（例如 B5），留空就不會被填入。', lang)}</p>
              <div className="form-grid">
                {SUMMARY_MAP_FIELDS.map((f) => (
                  <label key={f.key}>
                    {f.label}
                    <input
                      placeholder="例如 B5"
                      value={cellMap.summary[f.key] || ''}
                      onChange={(e) => setCellMap({ ...cellMap, summary: { ...cellMap.summary, [f.key]: e.target.value } })}
                    />
                  </label>
                ))}
              </div>
              <p className="muted" style={{ marginBottom: 4 }}>{t('學生明細列表：設定從第幾列開始逐行填入（每位學生一列），以及每個欄位對應哪一欄。', lang)}</p>
              <div className="form-grid">
                <label>
                  {t('起始列', lang)}
                  <input
                    type="number"
                    placeholder="例如 3"
                    value={cellMap.detail.startRow}
                    onChange={(e) => setCellMap({ ...cellMap, detail: { ...cellMap.detail, startRow: e.target.value } })}
                  />
                </label>
                {DETAIL_MAP_FIELDS.map((f) => (
                  <label key={f.key}>
                    {f.label}{t('欄', lang)}
                    <input
                      placeholder="例如 B"
                      value={cellMap.detail.columns[f.key] || ''}
                      onChange={(e) => setCellMap({ ...cellMap, detail: { ...cellMap.detail, columns: { ...cellMap.detail.columns, [f.key]: e.target.value } } })}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
