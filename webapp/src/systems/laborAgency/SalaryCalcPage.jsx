import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';

// 薪資計算：先建立一個可以再擴充的基本框架（基本薪／加班費／住宿費扣除／
// 其他扣除→實發），每位移工每月一筆，存在 laborAgency_salaryRecords。
// 之後若要加保險費、仲介服務費等扣項，直接在 FIELDS 補欄位即可，不用
// 改資料結構。
const FIELDS = [
  { key: 'month', label: '月份', type: 'month', required: true },
  { key: 'baseSalary', label: '基本薪', type: 'number' },
  { key: 'overtimePay', label: '加班費', type: 'number' },
  { key: 'housingDeduction', label: '住宿費扣除', type: 'number' },
  { key: 'otherDeductions', label: '其他扣除', type: 'number' },
  { key: 'note', label: '備註', type: 'textarea' },
];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'workerId', label: '移工ID' }, { key: 'workerName', label: '姓名' },
  ...FIELDS, { key: 'netPay', label: '實發薪資' },
];

function netPay(r) {
  return (+r.baseSalary || 0) + (+r.overtimePay || 0) - (+r.housingDeduction || 0) - (+r.otherDeductions || 0);
}

export default function SalaryCalcPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'salaryCalc', role, overrides);
  const { rows: records, loading, add, update, remove } = useCollection('laborAgency_salaryRecords');
  const { rows: workers } = useCollection('laborAgency_workers');
  const [editing, setEditing] = useState(null);
  const [monthFilter, setMonthFilter] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('laborAgency_salaryRecords', CSV_FIELDS, { entityLabel: '薪資紀錄', requiredKeys: ['workerId', 'month'], canEdit: canEditPage });

  function workerName(workerId) {
    return workers.find((w) => w.id === workerId)?.name || t('尚未配對', lang);
  }

  const filtered = records
    .filter((r) => !monthFilter || r.month === monthFilter)
    .sort((a, b) => (b.month || '').localeCompare(a.month || '') || workerName(a.workerId).localeCompare(workerName(b.workerId)));

  async function handleSave(data) {
    const payload = {
      ...data,
      baseSalary: +data.baseSalary || 0,
      overtimePay: +data.overtimePay || 0,
      housingDeduction: +data.housingDeduction || 0,
      otherDeductions: +data.otherDeductions || 0,
    };
    payload.netPay = netPay(payload);
    if (data.id) {
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
          <h2>{t('薪資計算', lang)}</h2>
          <div className="page-desc">{t('每位移工每月一筆薪資紀錄，基本薪＋加班費－住宿費扣除－其他扣除＝實發薪資', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          <input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增薪資紀錄', lang)}</button>}
          <ImportExportButtons rows={records} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>{t('姓名', lang)}</th><th>{t('月份', lang)}</th><th>{t('基本薪', lang)}</th><th>{t('加班費', lang)}</th>
                <th>{t('住宿費扣除', lang)}</th><th>{t('其他扣除', lang)}</th><th>{t('實發薪資', lang)}</th>{canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{workerName(r.workerId)}</td>
                  <td>{r.month}</td>
                  <td>{r.baseSalary || 0}</td>
                  <td>{r.overtimePay || 0}</td>
                  <td>{r.housingDeduction || 0}</td>
                  <td>{r.otherDeductions || 0}</td>
                  <td style={{ fontWeight: 600 }}>{netPay(r)}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                      <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={canEditPage ? 8 : 7} className="muted">{t('尚未建立薪資紀錄', lang)}</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}
      {editing && (
        <SalaryFormModal initial={editing} workers={workers} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />
      )}
    </div>
  );
}

function SalaryFormModal({ initial, workers, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const preview = netPay(form);

  function handleSubmit(e) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯薪資紀錄', lang) : t('新增薪資紀錄', lang)}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              {t('移工', lang)}
              <select required value={form.workerId || ''} onChange={(e) => setForm({ ...form, workerId: e.target.value })}>
                <option value="">{t('請選擇', lang)}</option>
                {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            {FIELDS.filter((f) => f.type !== 'textarea').map((f) => (
              <label key={f.key}>
                {t(f.label, lang)}
                <input type={f.type} required={f.required} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
          </div>
          <label style={{ display: 'block', marginTop: 12 }}>
            {t('備註', lang)}
            <textarea rows={2} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          <p className="muted" style={{ marginTop: 12 }}>{t('實發薪資：', lang)}<strong>{preview}</strong></p>
          <div className="row-actions">
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
