import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

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

export default function MeetingsPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'meetings', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_meetings', { order: ['date', 'desc'] });
  const [editing, setEditing] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_meetings', CSV_FIELDS, { entityLabel: '會議記錄', requiredKeys: ['date', 'title'], canEdit: canEditPage });

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
          <h2>會議記錄</h2>
          <div className="page-desc">每週公司內部討論紀錄{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增會議記錄</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有會議記錄，請先下載備份再匯入。</p>}
      <div className="card">
        <input placeholder="搜尋主題/主持人/出席人員" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>日期</th><th>主題</th><th>主持人</th><th>出席人員</th>{canEditPage && <th></th>}</tr></thead>
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
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={5} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {selected && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="page-header" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>{selected.title} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{selected.date}</span></h3>
            <button onClick={() => setSelectedId(null)}>關閉</button>
          </div>
          <div className="form-grid">
            <div><div className="muted" style={{ fontSize: 12 }}>主持人</div><div>{selected.host || '—'}</div></div>
            <div><div className="muted" style={{ fontSize: 12 }}>出席人員</div><div>{selected.attendees || '—'}</div></div>
            <div style={{ gridColumn: 'span 2' }}><div className="muted" style={{ fontSize: 12 }}>討論內容</div><div style={{ whiteSpace: 'pre-wrap' }}>{selected.content || '—'}</div></div>
            <div style={{ gridColumn: 'span 2' }}><div className="muted" style={{ fontSize: 12 }}>待辦事項</div><div style={{ whiteSpace: 'pre-wrap' }}>{selected.actionItems || '—'}</div></div>
            <div style={{ gridColumn: 'span 2' }}><div className="muted" style={{ fontSize: 12 }}>備註</div><div style={{ whiteSpace: 'pre-wrap' }}>{selected.notes || '—'}</div></div>
          </div>
        </div>
      )}
      {editing && <MeetingFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function MeetingFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯會議記錄' : '新增會議記錄'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key} style={['content', 'actionItems'].includes(f.key) ? { gridColumn: 'span 2' } : undefined}>
                {f.label}
                <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
