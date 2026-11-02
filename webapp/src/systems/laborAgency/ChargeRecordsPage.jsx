import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';

const CHARGE_TARGETS = ['工人', '招募'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'workerId', label: '移工ID' }, { key: 'date', label: '收費日期' },
  { key: 'amount', label: '金額' }, { key: 'chargeTarget', label: '收費對象' }, { key: 'note', label: '備註' },
];

// 收費紀錄：實際向工人或招募人員收到錢的日誌，跟「費用計算」的設定金額
// 分開——費用計算是預計應收多少，這裡記錄實際哪一天、實際收了多少。
export default function ChargeRecordsPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'chargeRecords', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('laborAgency_chargeRecords');
  const { rows: workers } = useCollection('laborAgency_workers');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('laborAgency_chargeRecords', CSV_FIELDS, { entityLabel: '收費紀錄', requiredKeys: ['workerId'], canEdit: canEditPage });

  function workerOf(workerId) { return workers.find((w) => w.id === workerId); }

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows
    .filter((r) => !searchQuery || (workerOf(r.workerId)?.name || '').toLowerCase().includes(searchQuery))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  async function handleSave(data) {
    const payload = { ...data, amount: Number(data.amount) || 0 };
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
          <h2>{t('收費紀錄', lang)}</h2>
          <div className="page-desc">{t('實際向工人或招募人員收到款項的日誌', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          <input placeholder={t('搜尋姓名', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增收費紀錄', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="table-wrap"><table>
            <thead><tr><th>{t('收費日期', lang)}</th><th>{t('姓名', lang)}</th><th>{t('金額', lang)}</th><th>{t('收費對象', lang)}</th><th>{t('備註', lang)}</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{workerOf(r.workerId)?.name || '—'}</td>
                  <td>{(r.amount || 0).toLocaleString()}</td>
                  <td>{t(r.chargeTarget, lang) || '—'}</td>
                  <td className="muted">{r.note || '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                      <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={canEditPage ? 6 : 5} className="muted">{t('尚未建立收費紀錄', lang)}</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}
      {editing && <ChargeRecordFormModal initial={editing} workers={workers} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function ChargeRecordFormModal({ initial, workers, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const sortedWorkers = [...workers].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯收費紀錄', lang) : t('新增收費紀錄', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('移工', lang)}
              <select required value={form.workerId || ''} onChange={(e) => setForm({ ...form, workerId: e.target.value })}>
                <option value="">{t('請選擇', lang)}</option>
                {sortedWorkers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label>
              {t('收費日期', lang)}
              <input type="date" required value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>
              {t('金額', lang)}
              <input type="number" required value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            <label>
              {t('收費對象', lang)}
              <select value={form.chargeTarget || ''} onChange={(e) => setForm({ ...form, chargeTarget: e.target.value })}>
                <option value="">{t('請選擇', lang)}</option>
                {CHARGE_TARGETS.map((o) => <option key={o} value={o}>{t(o, lang)}</option>)}
              </select>
            </label>
          </div>
          <label style={{ display: 'block', marginTop: 8 }}>
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
