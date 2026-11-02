import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';

const PAYMENT_CATEGORIES = ['招募者獎金', '內部獎金', '其他支出'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'recipient', label: '收款人' }, { key: 'category', label: '款項類別' },
  { key: 'workerId', label: '對應移工ID' }, { key: 'date', label: '支付日期' }, { key: 'amount', label: '金額' }, { key: 'note', label: '備註' },
];

// 支付紀錄：實際付出去的錢的日誌（招募者獎金、內部獎金或其他支出），跟
// 「收費紀錄」相對——那邊記錄收進來的錢，這裡記錄付出去的錢。
export default function PaymentRecordsPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'paymentRecords', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('laborAgency_paymentRecords');
  const { rows: workers } = useCollection('laborAgency_workers');
  const { rows: users } = useCollection('laborAgency_users');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('laborAgency_paymentRecords', CSV_FIELDS, { entityLabel: '支付紀錄', requiredKeys: ['recipient'], canEdit: canEditPage });

  function workerOf(workerId) { return workers.find((w) => w.id === workerId); }

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows
    .filter((r) => !searchQuery || (r.recipient || '').toLowerCase().includes(searchQuery))
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
          <h2>{t('支付紀錄', lang)}</h2>
          <div className="page-desc">{t('實際付出的款項日誌（招募者獎金、內部獎金或其他支出）', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          <input placeholder={t('搜尋收款人', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增支付紀錄', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="table-wrap"><table>
            <thead><tr><th>{t('支付日期', lang)}</th><th>{t('收款人', lang)}</th><th>{t('款項類別', lang)}</th><th>{t('對應移工', lang)}</th><th>{t('金額', lang)}</th><th>{t('備註', lang)}</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{r.recipient || '—'}</td>
                  <td>{t(r.category, lang) || '—'}</td>
                  <td>{workerOf(r.workerId)?.name || '—'}</td>
                  <td>{(r.amount || 0).toLocaleString()}</td>
                  <td className="muted">{r.note || '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                      <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={canEditPage ? 7 : 6} className="muted">{t('尚未建立支付紀錄', lang)}</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}
      {editing && <PaymentRecordFormModal initial={editing} workers={workers} users={users} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function PaymentRecordFormModal({ initial, workers, users, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const sortedWorkers = [...workers].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const staffOptions = [...new Set((users || []).map((u) => u.displayName || u.email).filter(Boolean))].sort();

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯支付紀錄', lang) : t('新增支付紀錄', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('收款人', lang)}
              <input
                list="payment-recipient-options"
                required
                value={form.recipient || ''}
                placeholder={t('選擇或自行輸入姓名', lang)}
                onChange={(e) => setForm({ ...form, recipient: e.target.value })}
              />
              <datalist id="payment-recipient-options">
                {staffOptions.map((o) => <option key={o} value={o} />)}
              </datalist>
            </label>
            <label>
              {t('款項類別', lang)}
              <select value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">{t('請選擇', lang)}</option>
                {PAYMENT_CATEGORIES.map((o) => <option key={o} value={o}>{t(o, lang)}</option>)}
              </select>
            </label>
            <label>
              {t('對應移工', lang)}
              <select value={form.workerId || ''} onChange={(e) => setForm({ ...form, workerId: e.target.value })}>
                <option value="">{t('（無）', lang)}</option>
                {sortedWorkers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label>
              {t('支付日期', lang)}
              <input type="date" required value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>
              {t('金額', lang)}
              <input type="number" required value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
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
