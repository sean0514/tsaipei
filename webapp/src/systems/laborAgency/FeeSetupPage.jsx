import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';

const CHARGE_TARGETS = ['工人', '招募'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'workerId', label: '移工ID' }, { key: 'workerName', label: '姓名' },
  { key: 'employerId', label: '雇主ID' }, { key: 'totalFee', label: '應繳費用' }, { key: 'taiwanAgencyFee', label: '台仲收費' },
  { key: 'recruiterBonus', label: '招募者獎金' }, { key: 'chargeTarget', label: '收費對象' },
];

// 費用計算：每位移工一筆費用設定——應繳費用是整筆總金額，台仲收費是其中
// 元凱（台灣仲介）自己抽的部分，招募者獎金是要付給招募人員的獎金（直接
// 在這裡填固定金額，不是另外設一個費率表），收費對象記錄這筆錢是要向
// 工人本人收、還是向招募人員/仲介收。這裡只是「設定」，實際收到/付出的
// 錢另外記在「收費紀錄」「支付紀錄」。
export default function FeeSetupPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'feeSetup', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('laborAgency_feeSetup');
  const { rows: workers } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('laborAgency_feeSetup', CSV_FIELDS, { entityLabel: '費用計算', requiredKeys: ['workerId'], canEdit: canEditPage });

  function workerOf(workerId) { return workers.find((w) => w.id === workerId); }
  function employerOf(employerId) { return employers.find((e) => e.id === employerId); }

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows
    .filter((r) => !searchQuery || (workerOf(r.workerId)?.name || '').toLowerCase().includes(searchQuery))
    .sort((a, b) => (workerOf(a.workerId)?.name || '').localeCompare(workerOf(b.workerId)?.name || ''));

  async function handleSave(data) {
    const payload = {
      ...data,
      totalFee: Number(data.totalFee) || 0,
      taiwanAgencyFee: Number(data.taiwanAgencyFee) || 0,
      recruiterBonus: Number(data.recruiterBonus) || 0,
    };
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
          <h2>{t('費用計算', lang)}</h2>
          <div className="page-desc">{t('每位移工一筆費用設定：應繳費用為總金額，台仲收費為其中元凱自己抽的部分，招募者獎金直接填固定金額，收費對象記錄向工人本人或向招募人員收取', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          <input placeholder={t('搜尋姓名', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增費用設定', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>{t('姓名', lang)}</th><th>{t('雇主', lang)}</th><th>{t('應繳費用', lang)}</th>
                <th>{t('台仲收費', lang)}</th><th>{t('招募者獎金', lang)}</th><th>{t('收費對象', lang)}</th>{canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{workerOf(r.workerId)?.name || '—'}</td>
                  <td>{employerOf(r.employerId)?.name || '—'}</td>
                  <td>{(r.totalFee || 0).toLocaleString()}</td>
                  <td>{(r.taiwanAgencyFee || 0).toLocaleString()}</td>
                  <td>{(r.recruiterBonus || 0).toLocaleString()}</td>
                  <td>{t(r.chargeTarget, lang) || '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                      <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={canEditPage ? 7 : 6} className="muted">{t('尚未建立費用設定', lang)}</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}
      {editing && (
        <FeeSetupFormModal initial={editing} workers={workers} employers={employers} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />
      )}
    </div>
  );
}

function FeeSetupFormModal({ initial, workers, employers, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const sortedWorkers = [...workers].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  function handleWorkerChange(workerId) {
    const worker = workers.find((w) => w.id === workerId);
    setForm({ ...form, workerId, employerId: worker?.employerId || form.employerId });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯費用設定', lang) : t('新增費用設定', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('移工', lang)}
              <select required value={form.workerId || ''} onChange={(e) => handleWorkerChange(e.target.value)}>
                <option value="">{t('請選擇', lang)}</option>
                {sortedWorkers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label>
              {t('雇主', lang)}
              <select value={form.employerId || ''} onChange={(e) => setForm({ ...form, employerId: e.target.value })}>
                <option value="">{t('尚未配對', lang)}</option>
                {employers.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </label>
            <label>
              {t('應繳費用', lang)}
              <input type="number" value={form.totalFee || ''} onChange={(e) => setForm({ ...form, totalFee: e.target.value })} />
            </label>
            <label>
              {t('台仲收費', lang)}
              <input type="number" value={form.taiwanAgencyFee || ''} onChange={(e) => setForm({ ...form, taiwanAgencyFee: e.target.value })} />
            </label>
            <label>
              {t('招募者獎金', lang)}
              <input type="number" value={form.recruiterBonus || ''} onChange={(e) => setForm({ ...form, recruiterBonus: e.target.value })} />
            </label>
            <label>
              {t('收費對象', lang)}
              <select value={form.chargeTarget || ''} onChange={(e) => setForm({ ...form, chargeTarget: e.target.value })}>
                <option value="">{t('請選擇', lang)}</option>
                {CHARGE_TARGETS.map((o) => <option key={o} value={o}>{t(o, lang)}</option>)}
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
