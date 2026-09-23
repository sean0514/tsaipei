import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const NATIONALITIES = ['印尼', '菲律賓', '越南', '泰國'];
const CASE_STATUS = ['進行中', '已完成', '取消'];

// 以「雇主需求案件」為單位（一案可能包含多位看護，用「需求量」記錄人數），
// 對應實際申辦流程從選工到送工的每個關卡；日期欄位留空代表尚未完成，
// 標籤上的「（N天）」是主管給的預期作業天數，僅供填寫時參考。
const FIELDS = [
  { key: 'caseNo', label: '編號' },
  { key: 'employerName', label: '雇主姓名', required: true },
  { key: 'demandCount', label: '需求量', type: 'number' },
  { key: 'selectionStatus', label: '選工狀態' },
  { key: 'foreignAgency', label: '國外仲介' },
  { key: 'taiwanAgency', label: '台仲' },
  { key: 'nationality', label: '國籍', options: NATIONALITIES },
  { key: 'status', label: '狀態', options: CASE_STATUS },
  { key: 'certCompleteDate', label: '認證完成（14天）', type: 'date' },
  { key: 'healthCheckDate', label: '體檢', type: 'date' },
  { key: 'trainingDate', label: '訓練', type: 'date' },
  { key: 'owwaDate', label: '福利部OWWA（2天）', type: 'date' },
  { key: 'laborLetterDate', label: '台灣勞動部函', type: 'date' },
  { key: 'poeaDate', label: '海外勞工署POEA（3-4天）', type: 'date' },
  { key: 'tecoVisaInDate', label: '中華商會TECO VISA IN', type: 'date' },
  { key: 'visaOutDate', label: 'VISA OUT', type: 'date' },
  { key: 'oecDate', label: '海外工作證OEC', type: 'date' },
  { key: 'preDepartureDate', label: '出國前講習', type: 'date' },
  { key: 'entryDate', label: '入境時間', type: 'date' },
  { key: 'dispatchDate', label: '送工', type: 'date' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

function newNoteId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ApplicationProgressPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'applicationProgress', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('yujian_applicationProgress');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('yujian_applicationProgress', CSV_FIELDS, { entityLabel: '申辦進度追蹤', requiredKeys: ['employerName'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows.filter((r) => !searchQuery || `${r.employerName || ''} ${r.caseNo || ''} ${r.foreignAgency || ''}`.toLowerCase().includes(searchQuery));

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
          <h2>申辦進度追蹤</h2>
          <div className="page-desc">依雇主需求案件追蹤從選工到送工的整體申辦流程{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增案件</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有進度紀錄，請先下載備份再匯入。</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <input placeholder="搜尋編號、雇主姓名或國外仲介" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr>{FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}<th>備註</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filtered.map((r) => {
                const notes = r.notes || [];
                const lastNote = notes[notes.length - 1];
                return (
                  <tr key={r.id}>
                    {FIELDS.map((f) => <td key={f.key}>{r[f.key] || '—'}</td>)}
                    <td>{lastNote ? `${lastNote.text}${notes.length > 1 ? `（共 ${notes.length} 則）` : ''}` : '—'}</td>
                    {canEditPage && (
                      <td className="row-actions">
                        <button onClick={() => setEditing(r)}>編輯</button>
                        <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={FIELDS.length + 1 + (canEditPage ? 1 : 0)} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <ProgressFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function ProgressFormModal({ initial, onCancel, onSave }) {
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
        <h3>{initial.id ? '編輯案件' : '新增案件'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
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
