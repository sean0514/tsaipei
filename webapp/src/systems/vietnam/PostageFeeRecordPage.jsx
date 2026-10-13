import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { exportEntityCSV } from '../../lib/csv';
import { t } from '../../lib/i18n';

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

const STATUSES = ['未匯款', '已匯款', '退回'];

const FIELDS = [
  { key: 'serialNumber', label: '編號' },
  { key: 'shipDate', label: '寄件日期', type: 'date' },
  { key: 'trackingNumber', label: '寄件編號' },
  { key: 'senderName', label: '寄件人' },
  { key: 'senderPhone', label: '電話(寄件人)' },
  { key: 'recipientName', label: '收件人' },
  { key: 'recipientPhone', label: '電話(收件人)' },
  { key: 'address', label: '地址' },
  { key: 'documentContent', label: '文件內容' },
  { key: 'amount', label: '金額', type: 'number' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'status', label: '狀態' }];

// 複製自 systems/tsaipei/PostageFeeRecordPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function PostageFeeRecordPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'postageFee', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('vietnam_postageFeeRecords');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [month, setMonth] = useState(currentMonthStr());
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_postageFeeRecords', CSV_FIELDS, { entityLabel: '郵資費用紀錄', requiredKeys: ['trackingNumber'], canEdit: canEditPage });

  function handleDownloadMonth() {
    const monthRows = rows.filter((r) => (r.shipDate || '').slice(0, 7) === month);
    exportEntityCSV(monthRows, CSV_FIELDS, `郵資費用紀錄_${month}`);
  }

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows.filter((r) => !searchQuery || `${r.trackingNumber || ''} ${r.senderName || ''} ${r.recipientName || ''} ${r.documentContent || ''}`.toLowerCase().includes(searchQuery));
  const groups = { 未匯款: [], 已匯款: [], 退回: [] };
  filtered.forEach((r) => groups[STATUSES.includes(r.status) ? r.status : '未匯款'].push(r));
  STATUSES.forEach((s) => groups[s].sort((a, b) => (b.shipDate || '').localeCompare(a.shipDate || '')));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ status: '未匯款', ...data });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('郵資費用紀錄', lang)}</h2>
          <div className="page-desc">{t('依未匯款／已匯款／退回分類', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增紀錄', lang)}</button>}
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button onClick={handleDownloadMonth}>{t('下載此月份資料', lang)}</button>
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有郵資費用紀錄，請先下載備份再匯入。「下載此月份資料」依「寄件日期」篩選。', lang)}</p>}
      <input placeholder={t('搜尋寄件編號、寄件人、收件人或文件內容', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 280 }} />
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {STATUSES.map((status) => (
            <div className="card" key={status} style={{ overflowX: 'auto' }}>
              <h3 style={{ marginTop: 0 }}>{status}（{groups[status].length}）</h3>
              <div className="table-wrap"><table>
                <thead><tr>
                  <th>{t('編號', lang)}</th><th>{t('寄件日期', lang)}</th><th>{t('寄件編號', lang)}</th><th>{t('寄件人', lang)}</th><th>{t('電話', lang)}</th>
                  <th>{t('收件人', lang)}</th><th>{t('電話', lang)}</th><th>{t('地址', lang)}</th><th>{t('文件內容', lang)}</th><th>{t('金額', lang)}</th>{canEditPage && <th></th>}
                </tr></thead>
                <tbody>
                  {groups[status].map((r) => (
                    <tr key={r.id}>
                      <td>{r.serialNumber || '—'}</td>
                      <td>{r.shipDate || '—'}</td>
                      <td>{r.trackingNumber || '—'}</td>
                      <td>{r.senderName || '—'}</td>
                      <td>{r.senderPhone || '—'}</td>
                      <td>{r.recipientName || '—'}</td>
                      <td>{r.recipientPhone || '—'}</td>
                      <td>{r.address || '—'}</td>
                      <td>{r.documentContent || '—'}</td>
                      <td>{r.amount ? Number(r.amount).toLocaleString() : '—'}</td>
                      {canEditPage && (
                        <td className="row-actions">
                          {STATUSES.filter((s) => s !== status).map((s) => (
                            <button key={s} onClick={() => update(r.id, { status: s })}>{s}</button>
                          ))}
                          <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                          <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {groups[status].length === 0 && <tr><td colSpan={canEditPage ? 11 : 10} className="muted">{t('沒有資料', lang)}</td></tr>}
                </tbody>
              </table></div>
            </div>
          ))}
        </div>
      )}
      {editing && <PostageFeeFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function PostageFeeFormModal({ initial, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯郵資紀錄', lang) : t('新增郵資紀錄', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {t(f.label, lang)}
                <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
            {initial.id && (
              <label>
                {t('狀態', lang)}
                <select value={form.status || '未匯款'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            )}
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
