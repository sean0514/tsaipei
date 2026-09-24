import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { useColumnVisibility } from '../../lib/useColumnVisibility';
import ColumnPicker from '../../components/ColumnPicker';

// 還沒有正式雇主、先安排在其他地方（宿舍/訓練中心等）待命的看護/家事人員名單。
const PLACEMENT_STATUS = ['安置中', '已就業', '已離境', '已離台', '其他'];

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'workerId', label: '人員ID' }, { key: 'placementLocation', label: '安置地點' },
  { key: 'placementStartDate', label: '安置開始日期' }, { key: 'contactPerson', label: '聯絡人' }, { key: 'contactPhone', label: '聯絡電話' },
  { key: 'status', label: '狀態' }, { key: 'notes', label: '備註' }, { key: 'confirmedDeparted', label: '確認離台' },
];

const COLUMNS = [
  { key: 'worker', label: '人員' }, { key: 'nationality', label: '國籍' }, { key: 'entryDate', label: '入境日期' },
  { key: 'placementLocation', label: '安置地點' }, { key: 'placementStartDate', label: '安置開始日期' },
  { key: 'contactPerson', label: '聯絡人' }, { key: 'contactPhone', label: '聯絡電話' }, { key: 'status', label: '狀態' }, { key: 'notes', label: '備註' },
];

export default function PlacementListPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'matching', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('yujian_placementList');
  const { rows: workers } = useCollection('yujian_workers');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('yujian_placementList', CSV_FIELDS, { entityLabel: '安置中名單', requiredKeys: ['workerId'], canEdit: canEditPage });
  const { visibleKeys, toggleColumn } = useColumnVisibility(COLUMNS);
  const columns = COLUMNS.filter((c) => visibleKeys.has(c.key));

  const workerById = (id) => workers.find((w) => w.id === id);
  const workerName = (id) => { const w = workerById(id); return w?.chineseName || w?.originalName || '(未設定)'; };

  const searchQuery = q.trim().toLowerCase();
  // 按過「確認離台」的紀錄從清單消失（資料還在，下載完整資料時仍會包含）。
  const filtered = rows
    .filter((r) => !r.confirmedDeparted)
    .filter((r) => !searchQuery || `${workerName(r.workerId)} ${r.placementLocation || ''}`.toLowerCase().includes(searchQuery));
  const departed = filtered.filter((r) => r.status === '已就業' || r.status === '已離境' || r.status === '已離台');
  const inPlacement = filtered.filter((r) => !departed.includes(r));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ status: '安置中', ...data });
    }
    setEditing(null);
  }

  async function confirmDeparted(id) {
    await update(id, { confirmedDeparted: true });
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>安置中名單</h2>
          <div className="page-desc">還沒有正式雇主、先安排在其他地方待命的人員{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增安置紀錄</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">狀態為「已離台」的紀錄，按「確認離台」後會從清單消失（資料仍保留，下載完整資料時仍會包含）。「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「人員ID」欄位）；上傳後會完全取代目前所有安置中名單資料，請先下載備份再匯入。</p>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'start', marginBottom: 16, flexWrap: 'wrap' }}>
        <input placeholder="搜尋人員或安置地點" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        <ColumnPicker columns={COLUMNS} visibleKeys={visibleKeys} onToggle={toggleColumn} />
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card" style={{ overflowX: 'auto' }}>
            <h4 style={{ marginTop: 0 }}>安置中 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{inPlacement.length} 人</span></h4>
            <PlacementTable items={inPlacement} columns={columns} canEditPage={canEditPage} workerById={workerById} workerName={workerName} onEdit={setEditing} onRemove={remove} />
          </div>
          <div className="card" style={{ overflowX: 'auto' }}>
            <h4 style={{ marginTop: 0 }}>已轉出或離境 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{departed.length} 人</span></h4>
            <PlacementTable items={departed} columns={columns} canEditPage={canEditPage} workerById={workerById} workerName={workerName} onEdit={setEditing} onRemove={remove} onConfirmDeparted={confirmDeparted} />
          </div>
        </div>
      )}
      {editing && <PlacementFormModal initial={editing} workers={workers} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function PlacementTable({ items, columns, canEditPage, workerById, workerName, onEdit, onRemove, onConfirmDeparted }) {
  return (
    <div className="table-wrap"><table>
      <thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}{canEditPage && <th></th>}</tr></thead>
      <tbody>
        {items.map((r) => {
          const w = workerById(r.workerId);
          return (
            <tr key={r.id}>
              {columns.map((c) => {
                if (c.key === 'worker') return <td key={c.key}>{workerName(r.workerId)}</td>;
                if (c.key === 'nationality') return <td key={c.key}>{w?.nationality || '—'}</td>;
                if (c.key === 'entryDate') return <td key={c.key}>{w?.entryDate || '—'}</td>;
                return <td key={c.key}>{r[c.key] || '—'}</td>;
              })}
              {canEditPage && (
                <td className="row-actions">
                  <button onClick={() => onEdit(r)}>編輯</button>
                  <button className="danger" onClick={() => onRemove(r.id)}>刪除</button>
                  {r.status === '已離台' && <button onClick={() => onConfirmDeparted(r.id)}>確認離台</button>}
                </td>
              )}
            </tr>
          );
        })}
        {items.length === 0 && <tr><td colSpan={columns.length + (canEditPage ? 1 : 0)} className="muted">沒有資料</td></tr>}
      </tbody>
    </table></div>
  );
}

function PlacementFormModal({ initial, workers, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯安置紀錄' : '新增安置紀錄'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              人員
              <select required value={form.workerId || ''} onChange={(e) => setForm({ ...form, workerId: e.target.value })}>
                <option value="" disabled>請選擇</option>
                {workers.map((w) => <option key={w.id} value={w.id}>{w.chineseName || w.originalName}</option>)}
              </select>
            </label>
            <label>
              安置地點
              <input value={form.placementLocation || ''} onChange={(e) => setForm({ ...form, placementLocation: e.target.value })} />
            </label>
            <label>
              安置開始日期
              <input type="date" value={form.placementStartDate || ''} onChange={(e) => setForm({ ...form, placementStartDate: e.target.value })} />
            </label>
            <label>
              聯絡人
              <input value={form.contactPerson || ''} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </label>
            <label>
              聯絡電話
              <input value={form.contactPhone || ''} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            </label>
            <label>
              狀態
              <select value={form.status || '安置中'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {PLACEMENT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              備註
              <input value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
