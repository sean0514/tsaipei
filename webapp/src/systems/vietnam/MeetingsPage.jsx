import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';

const FIELDS = [
  { key: 'date', label: '會議日期', type: 'date', required: true },
  { key: 'title', label: '會議主題', required: true },
  { key: 'host', label: '主持人' },
  { key: 'attendees', label: '出席人員' },
  { key: 'content', label: '討論內容' },
  { key: 'actionItems', label: '待辦事項' },
  { key: 'notes', label: '備註' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

// 複製自 systems/tsaipei/MeetingsPage.jsx，collection 字首改成 vietnam_，
// 介面文字包上 t(...)。
export default function MeetingsPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'meetings', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('vietnam_meetings', { order: ['date', 'desc'] });
  const { rows: users } = useCollection('vietnam_users');
  const [editing, setEditing] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_meetings', CSV_FIELDS, { entityLabel: '會議記錄', requiredKeys: ['date', 'title'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows.filter((r) => !searchQuery || `${r.title || ''} ${r.host || ''} ${r.attendees || ''}`.toLowerCase().includes(searchQuery));
  const selected = rows.find((r) => r.id === selectedId) || null;

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add(data);
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('會議記錄', lang)}</h2>
          <div className="page-desc">{t('每週公司內部討論紀錄', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增會議記錄', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有會議記錄，請先下載備份再匯入。', lang)}</p>}
      <div className="card">
        <input placeholder={t('搜尋主題/主持人/出席人員', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>{t('日期', lang)}</th><th>{t('主題', lang)}</th><th>{t('主持人', lang)}</th><th>{t('出席人員', lang)}</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
                  style={{ cursor: 'pointer', background: r.id === selectedId ? 'var(--row-selected-bg, #eef4ff)' : undefined }}
                >
                  <td>{r.date}</td>
                  <td>{r.title}</td>
                  <td>{r.host || '—'}</td>
                  <td>{r.attendees || '—'}</td>
                  {canEditPage && (
                    <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                      <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={5} className="muted">{t('沒有資料', lang)}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {selected && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="page-header" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>{selected.title} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{selected.date}</span></h3>
            <button onClick={() => setSelectedId(null)}>{t('關閉', lang)}</button>
          </div>
          <div className="form-grid">
            <div><div className="muted" style={{ fontSize: 12 }}>{t('主持人', lang)}</div><div>{selected.host || '—'}</div></div>
            <div><div className="muted" style={{ fontSize: 12 }}>{t('出席人員', lang)}</div><div>{selected.attendees || '—'}</div></div>
            <div style={{ gridColumn: 'span 2' }}><div className="muted" style={{ fontSize: 12 }}>{t('討論內容', lang)}</div><div style={{ whiteSpace: 'pre-wrap' }}>{selected.content || '—'}</div></div>
            <div style={{ gridColumn: 'span 2' }}><div className="muted" style={{ fontSize: 12 }}>{t('待辦事項', lang)}</div><div style={{ whiteSpace: 'pre-wrap' }}>{selected.actionItems || '—'}</div></div>
            <div style={{ gridColumn: 'span 2' }}><div className="muted" style={{ fontSize: 12 }}>{t('備註', lang)}</div><div style={{ whiteSpace: 'pre-wrap' }}>{selected.notes || '—'}</div></div>
          </div>
        </div>
      )}
      {editing && <MeetingFormModal initial={editing} users={users} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function MeetingFormModal({ initial, users, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const staffOptions = [...new Set((users || []).map((u) => u.displayName || u.email).filter(Boolean))].sort();
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯會議記錄', lang) : t('新增會議記錄', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key} style={['content', 'actionItems'].includes(f.key) ? { gridColumn: 'span 2' } : undefined}>
                {t(f.label, lang)}
                {f.key === 'host' ? (
                  <select value={form.host || ''} onChange={(e) => setForm({ ...form, host: e.target.value })}>
                    <option value="">{t('（未設定）', lang)}</option>
                    {staffOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
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
