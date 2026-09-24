import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { useColumnVisibility } from '../../lib/useColumnVisibility';
import ColumnPicker from '../../components/ColumnPicker';
import { FIELDS, INFO_FIELDS, MILESTONES, CASE_STATUS, LIST_COLUMNS, ProgressPipeline, newNoteId, milestoneNoteKey } from './ApplicationProgressPage';

// 格式與「申辦進度追蹤」相同（同一組欄位、同一套進度圖示），差別只在於這裡
// 是「送工時間」已經填寫的案件（申辦進度追蹤第一次填入送工時間時會自動
// 帶入這裡）。列表多顯示入境時間/送工時間這兩個日期欄位，方便直接看到到職時程。
const ARRIVED_LIST_COLUMNS = (() => {
  const idx = LIST_COLUMNS.findIndex((c) => c.key === 'status');
  const extra = [{ key: 'entryDate', label: '入境時間' }, { key: 'dispatchDate', label: '送工時間' }];
  return [...LIST_COLUMNS.slice(0, idx + 1), ...extra, ...LIST_COLUMNS.slice(idx + 1)];
})();

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

export default function ArrivedListPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'arrivedList', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('yujian_arrivedList');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('yujian_arrivedList', CSV_FIELDS, { entityLabel: '已入台名單', requiredKeys: ['employerName'], canEdit: canEditPage });
  const { visibleKeys, toggleColumn } = useColumnVisibility(ARRIVED_LIST_COLUMNS);

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows.filter((r) => !searchQuery || `${r.employerName || ''} ${r.caseNo || ''} ${r.foreignAgency || ''}`.toLowerCase().includes(searchQuery));
  const columns = ARRIVED_LIST_COLUMNS.filter((c) => visibleKeys.has(c.key));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ status: '進行中', ...data });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>已入台名單</h2>
          <div className="page-desc">已完成申辦流程並入境的雇主需求案件{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增紀錄</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「申辦進度追蹤」的案件在「送工時間」第一次填入日期時會自動帶入這裡；也可以直接在這裡新增或編輯。「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有已入台名單資料，請先下載備份再匯入。</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'start', marginBottom: 12, flexWrap: 'wrap' }}>
          <input placeholder="搜尋編號、雇主姓名或國外仲介" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
          <ColumnPicker columns={ARRIVED_LIST_COLUMNS} visibleKeys={visibleKeys} onToggle={toggleColumn} />
        </div>
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead>
              <tr>
                {columns.map((c) => <th key={c.key} className={c.sticky ? 'sticky-col' : ''}>{c.label}</th>)}
                {canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const notes = r.notes || [];
                const lastNote = notes[notes.length - 1];
                return (
                  <tr key={r.id}>
                    {columns.map((c) => {
                      if (c.key === 'status') {
                        return (
                          <td key={c.key}>
                            <span className={`tag ${r.status === '已入台' ? 'tag-green' : r.status === '已取消' ? 'tag-grey' : 'tag-amber'}`}>{r.status || '進行中'}</span>
                          </td>
                        );
                      }
                      if (c.key === 'progress') return <td key={c.key}><ProgressPipeline p={r} /></td>;
                      if (c.key === 'notes') return <td key={c.key}>{lastNote ? `${lastNote.text}${notes.length > 1 ? `（共 ${notes.length} 則）` : ''}` : '—'}</td>;
                      return <td key={c.key} className={c.sticky ? 'sticky-col' : ''}>{r[c.key] || '—'}</td>;
                    })}
                    {canEditPage && (
                      <td className="row-actions">
                        <button onClick={() => setEditing(r)}>管理</button>
                        <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={columns.length + (canEditPage ? 1 : 0)} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <ArrivedFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function ArrivedFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState({ ...initial, notes: initial.notes || [] });
  const [newNoteText, setNewNoteText] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  function addNote() {
    const text = newNoteText.trim();
    if (!text) return;
    setForm({ ...form, notes: [...form.notes, { id: newNoteId(), text, createdAt: new Date().toISOString() }] });
    setNewNoteText('');
  }

  function startEditNote(note) {
    setEditingNoteId(note.id);
    setEditingNoteText(note.text);
  }

  function saveEditNote() {
    const text = editingNoteText.trim();
    if (!text) return;
    setForm({ ...form, notes: form.notes.map((n) => (n.id === editingNoteId ? { ...n, text } : n)) });
    setEditingNoteId(null);
    setEditingNoteText('');
  }

  function deleteNote(id) {
    setForm({ ...form, notes: form.notes.filter((n) => n.id !== id) });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? `編輯紀錄${initial.employerName ? ` · ${initial.employerName}` : ''}` : '新增紀錄'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <h4 style={{ marginTop: 0 }}>進度狀態</h4>
          <select value={form.status || '進行中'} onChange={(e) => setForm({ ...form, status: e.target.value })} style={{ marginBottom: 8 }}>
            {CASE_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <h4 style={{ marginTop: 20 }}>申辦流程</h4>
          <div className="form-grid">
            {MILESTONES.map((m) => (
              <div key={m.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label>
                  {m.label}
                  <input type="date" value={form[m.key] || ''} onChange={(e) => setForm({ ...form, [m.key]: e.target.value })} />
                </label>
                <input placeholder="備註" value={form[milestoneNoteKey(m.key)] || ''} onChange={(e) => setForm({ ...form, [milestoneNoteKey(m.key)]: e.target.value })} />
              </div>
            ))}
          </div>

          <h4 style={{ marginTop: 20 }}>進度圖示</h4>
          <ProgressPipeline p={form} />

          <h4 style={{ marginTop: 20 }}>資料總檔</h4>
          <div className="form-grid">
            {INFO_FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                {f.options ? (
                  <select required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    <option value="">請選擇</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
          </div>

          <h4 style={{ marginTop: 20 }}>備註</h4>
          <ul className="note-list">
            {form.notes.map((n) => (
              <li key={n.id}>
                {editingNoteId === n.id ? (
                  <div className="row-actions">
                    <input value={editingNoteText} onChange={(e) => setEditingNoteText(e.target.value)} style={{ flex: 1 }} />
                    <button type="button" onClick={saveEditNote}>儲存</button>
                    <button type="button" onClick={() => setEditingNoteId(null)}>取消</button>
                  </div>
                ) : (
                  <div className="row-actions">
                    <span style={{ flex: 1 }}>{n.text}</span>
                    <button type="button" onClick={() => startEditNote(n)}>修改</button>
                    <button type="button" className="danger" onClick={() => deleteNote(n.id)}>刪除</button>
                  </div>
                )}
              </li>
            ))}
            {form.notes.length === 0 && <li className="muted">尚無備註</li>}
          </ul>
          <div className="row-actions">
            <input placeholder="新增備註內容" value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} style={{ flex: 1 }} />
            <button type="button" onClick={addNote}>+ 新增備註</button>
          </div>

          <div className="row-actions" style={{ marginTop: 20 }}>
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
