import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const ROOM_COUNT_OPTIONS = Array.from({ length: 30 }, (_, i) => String(i + 1));

const FIELDS = [
  { key: 'name', label: '宿舍名稱', required: true },
  { key: 'location', label: '地點' },
  { key: 'gender', label: '宿舍性別', options: ['', '男', '女', '混住'] },
  { key: 'roomCount', label: '房間數', options: ['', ...ROOM_COUNT_OPTIONS] },
  { key: 'leaseStart', label: '起租日', type: 'date' },
  { key: 'leaseEnd', label: '退租日', type: 'date' },
  { key: 'deposit', label: '押金金額', type: 'number' },
  { key: 'depositRefundAmount', label: '退還押金金額', type: 'number' },
  { key: 'depositRefundDate', label: '退還押金日期', type: 'date' },
  { key: 'agentFee', label: '房仲費金額', type: 'number' },
  { key: 'rent', label: '租金金額', type: 'number' },
  { key: 'capacity', label: '可住人數', type: 'number' },
  { key: 'manager1', label: '宿管1' },
  { key: 'manager2', label: '宿管2' },
  { key: 'notes', label: '備註' },
];

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function parseOtherFees(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function otherFeesSummary(json) {
  const fees = parseOtherFees(json);
  if (!fees.length) return '—';
  return fees.map((f) => `${f.label || '未命名'}：${f.amount || '—'}`).join('、');
}

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'confirmedClosed', label: '結案' }];

// 「住宿中」的判斷跟 HousingPage 同一套邏輯：已完成的紀錄不算、沒有入住日
// 的不算、退宿日已過的也不算（當作已離宿）。
function isCurrentResident(r, today) {
  if (r.completed || !r.checkIn) return false;
  return !r.checkOut || r.checkOut >= today;
}

export default function DormManagementPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'dormManagement', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_dormitories', { order: ['name', 'asc'] });
  const { rows: utilities, add: addUtility, update: updateUtility } = useCollection('tsaipei_dormitoryUtilities');
  const { rows: housingRecords } = useCollection('tsaipei_housingRecords');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: users } = useCollection('tsaipei_users');
  const [editing, setEditing] = useState(null);
  const [utilEditing, setUtilEditing] = useState(null);
  const [viewingDorm, setViewingDorm] = useState(null);
  const [month, setMonth] = useState(currentMonthStr());
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_dormitories', CSV_FIELDS, { entityLabel: '宿舍管理', requiredKeys: ['name'], canEdit: canEditPage });

  const studentName = (id) => { const s = students.find((x) => x.id === id); return s?.chineseName || s?.originalName || '(未知)'; };
  const today = new Date().toISOString().slice(0, 10);
  function residentsOf(dormName) {
    return housingRecords.filter((r) => r.type === dormName && isCurrentResident(r, today));
  }

  // 按過「結案」的紀錄從清單消失（資料還在，下載完整資料時仍會包含）。
  const filtered = rows
    .filter((r) => !r.confirmedClosed)
    .filter((r) => !q || [r.name, r.location].some((v) => v?.includes(q)));

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
          <div className="page-desc">管理公司承租的宿舍清單：租期、押金、租金、房仲費，以及按月填寫的其他費用{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增宿舍</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有宿舍紀錄，請先下載備份再匯入。水費/電費/瓦斯費/其他費用請改用清單上的「填寫其他費用」依月份個別輸入。</p>}
      <div className="card">
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <input placeholder="搜尋名稱/地點" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>宿舍名稱</th><th>地點</th><th>宿舍性別</th><th>房間數</th><th>起租日</th><th>退租日</th><th>可住人數</th><th>已住人數</th>
                <th>{month} 水費</th><th>{month} 電費</th><th>{month} 瓦斯費</th><th>{month} 其他費用</th>
                {canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const u = utilityFor(r.id);
                return (
                  <tr key={r.id}>
                    <td><button type="button" className="link-button" onClick={() => setViewingDorm(r)}>{r.name}</button></td>
                    <td>{r.location || '—'}</td>
                    <td>{r.gender || '—'}</td>
                    <td>{r.roomCount || '—'}</td>
                    <td>{r.leaseStart || '—'}</td>
                    <td>{r.leaseEnd || '—'}</td>
                    <td>{r.capacity || '—'}</td>
                    <td>{residentsOf(r.name).length}</td>
                    <td>{u?.waterFee ?? '—'}</td>
                    <td>{u?.electricityFee ?? '—'}</td>
                    <td>{u?.gasFee ?? '—'}</td>
                    <td>{otherFeesSummary(u?.otherFees)}</td>
                    {canEditPage && (
                      <td className="row-actions">
                        <button onClick={() => setEditing(r)}>編輯</button>
                        <button onClick={() => setUtilEditing({ dormId: r.id, waterFee: u?.waterFee || '', electricityFee: u?.electricityFee || '', gasFee: u?.gasFee || '', otherFees: u?.otherFees || '' })}>填寫其他費用</button>
                        <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                        <button onClick={() => update(r.id, { confirmedClosed: true })}>結案</button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={13} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <DormFormModal initial={editing} users={users} onCancel={() => setEditing(null)} onSave={handleSave} />}
      {utilEditing && (
        <OtherFeesFormModal
          month={month}
          initial={utilEditing}
          onCancel={() => setUtilEditing(null)}
          onSave={(data) => handleSaveUtility(utilEditing.dormId, data)}
        />
      )}
      {viewingDorm && (
        <ResidentsModal dorm={viewingDorm} residents={residentsOf(viewingDorm.name)} studentName={studentName} onClose={() => setViewingDorm(null)} />
      )}
    </div>
  );
}

function ResidentsModal({ dorm, residents, studentName, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{dorm.name} · 目前住宿人員</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>學生</th><th>付款方式</th><th>入住日</th><th>退宿日</th></tr></thead>
          <tbody>
            {residents.map((r) => (
              <tr key={r.id}>
                <td>{studentName(r.studentId)}</td>
                <td>{r.payer || '—'}</td>
                <td>{r.checkIn || '—'}</td>
                <td>{r.checkOut || '—'}</td>
              </tr>
            ))}
            {residents.length === 0 && <tr><td colSpan={4} className="muted">目前沒有住宿人員</td></tr>}
          </tbody>
        </table></div>
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button type="button" onClick={onClose}>關閉</button>
        </div>
      </div>
    </div>
  );
}

const MANAGER_FIELD_KEYS = ['manager1', 'manager2'];

function DormFormModal({ initial, users, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  // 宿管1/宿管2下拉選單的選項，取自系統使用人員名單，避免手打造成名字
  // 跟內部獎金計算對不起來。
  const staffOptions = [...new Set((users || []).map((u) => u.displayName || u.email).filter(Boolean))].sort();
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯宿舍' : '新增宿舍'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                {f.options ? (
                  <select value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    {f.options.map((o) => <option key={o} value={o}>{o || '請選擇'}</option>)}
                  </select>
                ) : MANAGER_FIELD_KEYS.includes(f.key) ? (
                  <select value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    <option value="">（未設定）</option>
                    {staffOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
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

function OtherFeesListEditor({ fees, onChange }) {
  function updateRow(i, patch) {
    onChange(fees.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function removeRow(i) {
    onChange(fees.filter((_, idx) => idx !== i));
  }
  function addRow() {
    onChange([...fees, { label: '', amount: '' }]);
  }

  return (
    <div>
      {fees.map((f, i) => (
        <div key={i} className="form-grid" style={{ marginBottom: 8 }}>
          <label>
            項目名稱
            <input value={f.label || ''} onChange={(e) => updateRow(i, { label: e.target.value })} />
          </label>
          <label>
            金額
            <input value={f.amount || ''} onChange={(e) => updateRow(i, { amount: e.target.value })} />
          </label>
          <button type="button" onClick={() => removeRow(i)} style={{ alignSelf: 'end' }}>移除</button>
        </div>
      ))}
      <button type="button" onClick={addRow}>+ 新增其他費用</button>
    </div>
  );
}

function OtherFeesFormModal({ month, initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const otherFees = parseOtherFees(form.otherFees);

  function setOtherFees(next) {
    setForm({ ...form, otherFees: JSON.stringify(next) });
  }

  function handleSubmit(e) {
    e.preventDefault();
    const cleaned = parseOtherFees(form.otherFees).filter((f) => f.label);
    onSave({ ...form, otherFees: JSON.stringify(cleaned) });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{month} 其他費用</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              水費
              <input type="number" value={form.waterFee} onChange={(e) => setForm({ ...form, waterFee: e.target.value })} />
            </label>
            <label>
              電費
              <input type="number" value={form.electricityFee} onChange={(e) => setForm({ ...form, electricityFee: e.target.value })} />
            </label>
            <label>
              瓦斯費
              <input type="number" value={form.gasFee} onChange={(e) => setForm({ ...form, gasFee: e.target.value })} />
            </label>
          </div>
          <h4>其他費用（可自行新增）</h4>
          <OtherFeesListEditor fees={otherFees} onChange={setOtherFees} />
          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
