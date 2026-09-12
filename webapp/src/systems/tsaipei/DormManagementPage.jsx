import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const FIELDS = [
  { key: 'name', label: '宿舍名稱', required: true },
  { key: 'location', label: '地點' },
  { key: 'leaseStart', label: '起租日', type: 'date' },
  { key: 'leaseEnd', label: '退租日', type: 'date' },
  { key: 'deposit', label: '押金金額', type: 'number' },
  { key: 'agentFee', label: '房仲費金額', type: 'number' },
  { key: 'rent', label: '租金金額', type: 'number' },
  { key: 'capacity', label: '可住人數', type: 'number' },
  { key: 'notes', label: '備註' },
];

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

export default function DormManagementPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'dormManagement', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_dormitories', { order: ['name', 'asc'] });
  const { rows: utilities, add: addUtility, update: updateUtility } = useCollection('tsaipei_dormitoryUtilities');
  const [editing, setEditing] = useState(null);
  const [utilEditing, setUtilEditing] = useState(null);
  const [month, setMonth] = useState(currentMonthStr());
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_dormitories', CSV_FIELDS, { entityLabel: '宿舍管理', requiredKeys: ['name'], canEdit: canEditPage });

  const filtered = rows.filter((r) => !q || [r.name, r.location].some((v) => v?.includes(q)));

  function utilityFor(dormId) {
    return utilities.find((u) => u.dormitoryId === dormId && u.month === month);
  }

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add(data);
    }
    setEditing(null);
  }

  // upsert：找得到同宿舍+同月份的既有紀錄就更新，找不到就新增
  async function handleSaveUtility(dormId, data) {
    const existing = utilityFor(dormId);
    if (existing) {
      await updateUtility(existing.id, data);
    } else {
      await addUtility({ dormitoryId: dormId, month, ...data });
    }
    setUtilEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>宿舍管理</h2>
          <div className="page-desc">管理公司承租的宿舍清單：租期、押金、租金、房仲費，以及按月填寫的水電費{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增宿舍</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有宿舍紀錄，請先下載備份再匯入。水電費請改用清單上的「填寫水電費」依月份個別輸入。</p>}
      <div className="card">
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <input placeholder="搜尋名稱/地點" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>宿舍名稱</th><th>地點</th><th>起租日</th><th>退租日</th><th>可住人數</th>
                <th>{month} 水費</th><th>{month} 電費</th>
                {canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const u = utilityFor(r.id);
                return (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.location || '—'}</td>
                    <td>{r.leaseStart || '—'}</td>
                    <td>{r.leaseEnd || '—'}</td>
                    <td>{r.capacity || '—'}</td>
                    <td>{u?.waterFee ?? '—'}</td>
                    <td>{u?.electricityFee ?? '—'}</td>
                    {canEditPage && (
                      <td className="row-actions">
                        <button onClick={() => setEditing(r)}>編輯</button>
                        <button onClick={() => setUtilEditing({ dormId: r.id, waterFee: u?.waterFee || '', electricityFee: u?.electricityFee || '' })}>填寫水電費</button>
                        <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={8} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <DormFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
      {utilEditing && (
        <UtilityFormModal
          month={month}
          initial={utilEditing}
          onCancel={() => setUtilEditing(null)}
          onSave={(data) => handleSaveUtility(utilEditing.dormId, data)}
        />
      )}
    </div>
  );
}

function DormFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯宿舍' : '新增宿舍'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
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

function UtilityFormModal({ month, initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{month} 水電費</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              水費
              <input type="number" value={form.waterFee} onChange={(e) => setForm({ ...form, waterFee: e.target.value })} />
            </label>
            <label>
              電費
              <input type="number" value={form.electricityFee} onChange={(e) => setForm({ ...form, electricityFee: e.target.value })} />
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
