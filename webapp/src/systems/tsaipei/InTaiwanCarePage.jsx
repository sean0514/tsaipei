import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import Tag from '../../components/Tag';
import { CARE_TAG } from '../../lib/tags';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const STATUSES = ['良好', '待關心', '預計離台'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' }, { key: 'careDate', label: '關懷時間' },
  { key: 'content', label: '內容' }, { key: 'status', label: '狀態' }, { key: 'confirmedDeparture', label: '確認離台' },
];

export default function InTaiwanCarePage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'inTaiwanTracking', role, overrides);
  const { rows, loading, update, remove } = useCollection('tsaipei_inTaiwanCare');
  const { rows: students } = useCollection('tsaipei_students');
  const [editing, setEditing] = useState(null);
  const [showDeparted, setShowDeparted] = useState(false);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_inTaiwanCare', CSV_FIELDS, { entityLabel: '在台關懷紀錄', requiredKeys: ['studentId'], canEdit: canEditPage });

  const studentName = (id) => { const s = students.find((x) => x.id === id); return s?.chineseName || s?.originalName || '(未知)'; };
  const searchQuery = q.trim().toLowerCase();
  const visible = rows.filter((r) => (showDeparted || r.confirmedDeparture !== true) && (!searchQuery || studentName(r.studentId).toLowerCase().includes(searchQuery)));

  async function handleSave(data) {
    const { id, ...rest } = data;
    await update(id, rest);
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>在台關懷紀錄</h2>
          <div className="page-desc">記錄學生在台期間的關懷追蹤（在台簽證追蹤建立後自動加入；確認離台後自動移除）{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          <label className="muted"><input type="checkbox" checked={showDeparted} onChange={(e) => setShowDeparted(e.target.checked)} /> 顯示已確認離台</label>
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「學生ID」欄位）；上傳後會完全取代目前所有在台關懷紀錄，請先下載備份再匯入。</p>}
      <div className="card">
        <input placeholder="搜尋學生" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>學生</th><th>關懷時間</th><th>內容</th><th>狀態</th><th>確認離台</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td>{studentName(r.studentId)}</td>
                  <td>{r.careDate || '—'}</td>
                  <td>{r.content || '—'}</td>
                  <td><Tag value={r.status} map={CARE_TAG} /></td>
                  <td>
                    {canEditPage ? (
                      <input type="checkbox" checked={!!r.confirmedDeparture} onChange={(e) => update(r.id, { confirmedDeparture: e.target.checked })} />
                    ) : (r.confirmedDeparture ? '是' : '否')}
                  </td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={6} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <CareFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function CareFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>編輯在台關懷紀錄</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              關懷時間
              <input type="date" value={form.careDate || ''} onChange={(e) => setForm({ ...form, careDate: e.target.value })} />
            </label>
            <label>
              狀態
              <select value={form.status || '良好'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              內容
              <input value={form.content || ''} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            </label>
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
