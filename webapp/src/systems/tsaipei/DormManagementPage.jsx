import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { uploadAttachment, deleteAttachmentFile, MAX_ATTACHMENT_SIZE } from '../../lib/fileAttachment';

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

const OTHER_FEE_PAYERS = ['學生自付', '廠商代付'];
const OTHER_FEE_TYPES = ['支出', '收入'];

function otherFeesSummary(json) {
  const fees = parseOtherFees(json);
  if (!fees.length) return '—';
  return fees.map((f) => `${f.label || '未命名'}：${(f.type || '支出') === '收入' ? '+' : ''}${f.amount || '—'}（${(f.type || '支出') === '收入' ? '收入' : f.payer || '學生自付'}）`).join('、');
}

// 每間宿舍自己維護一組可重複使用的收入/支出項目名稱，填「其他費用」時
// 從下拉選單挑，不用每個月自己手打，避免同一個項目各月打法不一致
// （例如「電梯維修」跟「電梯維修費」）導致看起來像兩筆不同項目。
function parseItemOptions(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'itemOptions', label: '收支項目選項(JSON)' }, { key: 'confirmedClosed', label: '結案' }];

// 電動車管理：每輛車一筆資料，出租期間(多筆，每段各自的起租日/退租日/
// 每月租金)存成 JSON 陣列。借給住宿紀錄用的那幾段(housingRecordId 有值)
// 由「住宿安排」頁面勾選「是否借用電動車」時自動同步寫入，這裡仍可以
// 直接新增/編輯/移除任何一段（包含沒有綁住宿紀錄的出租期間）。
const VEHICLE_FIELDS = [
  { key: 'number', label: '編號', required: true },
  { key: 'location', label: '車輛放置處' },
  { key: 'purchaseDate', label: '購買日期', type: 'date' },
  { key: 'model', label: '車子型號' },
  { key: 'purchaseAmount', label: '購買金額', type: 'number' },
];
const VEHICLE_EQUIPMENT_ITEMS = [
  { key: 'hasCover', label: '車套' },
  { key: 'hasLock', label: '車鎖' },
  { key: 'hasKey', label: '車鑰匙' },
];
const VEHICLE_CSV_FIELDS = [
  { key: 'id', label: 'ID' }, ...VEHICLE_FIELDS,
  { key: 'hasCover', label: '車套' }, { key: 'hasLock', label: '車鎖' }, { key: 'hasKey', label: '車鑰匙' },
  { key: 'rentalPeriods', label: '出租期間(JSON)' }, { key: 'photoUrl', label: '車輛照片連結' },
];

function parseRentalPeriods(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// 產值差額 = 每月租金(累計，依每段出租期間實際經過的天數換算，未結束的
// 段只算到今天) － 購買金額；每段期間的天數都是「含起租日跟退租日」
// 的實際天數，不是整月概算，所以用 (天數/30*每月租金) 換算成這段累計
// 收到的租金。
function accumulatedRentalIncome(periods, today) {
  const todayDate = new Date(`${today}T00:00:00`);
  return (periods || []).reduce((sum, p) => {
    if (!p.start) return sum;
    const start = new Date(`${p.start}T00:00:00`);
    const rawEnd = p.end ? new Date(`${p.end}T00:00:00`) : todayDate;
    const end = rawEnd > todayDate ? todayDate : rawEnd;
    if (end < start) return sum;
    const days = Math.round((end - start) / 86400000) + 1;
    return sum + Math.round(((Number(p.monthlyRent) || 0) / 30) * days);
  }, 0);
}
function vehicleValueDiff(vehicle, today) {
  return accumulatedRentalIncome(parseRentalPeriods(vehicle.rentalPeriods), today) - (Number(vehicle.purchaseAmount) || 0);
}
function equipmentSummary(vehicle) {
  const labels = VEHICLE_EQUIPMENT_ITEMS.filter((it) => vehicle[it.key]).map((it) => it.label);
  return labels.length ? labels.join('、') : '—';
}

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
  const { rows: vehicles, loading: loadingVehicles, add: addVehicle, update: updateVehicle, remove: removeVehicle } = useCollection('tsaipei_electricVehicles');
  const [editing, setEditing] = useState(null);
  const [utilEditing, setUtilEditing] = useState(null);
  const [viewingDorm, setViewingDorm] = useState(null);
  const [optionsEditing, setOptionsEditing] = useState(null); // dormitory row being managed, or null
  const [vehicleEditing, setVehicleEditing] = useState(null);
  const [month, setMonth] = useState(currentMonthStr());
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_dormitories', CSV_FIELDS, { entityLabel: '宿舍管理', requiredKeys: ['name'], canEdit: canEditPage });
  const { handleExport: handleExportVehicles, handleImport: handleImportVehicles } = useCsvOverwrite('tsaipei_electricVehicles', VEHICLE_CSV_FIELDS, { entityLabel: '電動車管理', requiredKeys: ['number'], canEdit: canEditPage });

  async function handleSaveVehicle(data) {
    try {
      if (data.id) {
        const { id, ...rest } = data;
        await updateVehicle(id, rest);
      } else {
        await addVehicle(data);
      }
      setVehicleEditing(null);
    } catch (err) {
      alert(`儲存失敗：${err.message || err}`);
    }
  }

  const studentName = (id) => { const s = students.find((x) => x.id === id); return s?.chineseName || s?.originalName || '(未知)'; };
  const today = new Date().toISOString().slice(0, 10);
  function residentsOf(dormName) {
    return housingRecords.filter((r) => r.type === dormName && isCurrentResident(r, today));
  }

  // 按過「結案」的紀錄從清單消失（資料還在，下載完整資料時仍會包含）。
  const filtered = rows
    .filter((r) => !r.confirmedClosed)
    .filter((r) => !q || [r.name, r.location].some((v) => v?.includes(q)));

  // 找出既有資料裡已經重複的宿舍名稱（含結案的，不然看不到問題在哪），
  // 在畫面上提醒——這種重複會讓水電費/其他費用對應錯宿舍，住宿安排/
  // 學生請款計算查不到對應紀錄，算出來的水電費/其他費用會是 0，但不會
  // 跳任何錯誤訊息，必須主動檢查才找得到。
  const duplicateDormNames = [...new Set(
    rows.filter((r) => r.name && rows.some((other) => other.id !== r.id && other.name === r.name)).map((r) => r.name)
  )].sort();

  function utilityFor(dormId) {
    return utilities.find((u) => u.dormitoryId === dormId && u.month === month);
  }

  // 宿舍名稱不能重複：住宿安排/學生請款計算是用「宿舍名稱」這個字串去找
  // 對應的宿舍（不是用 ID），如果兩筆宿舍紀錄同名，水電費填在其中一筆，
  // 學生請款計算卻可能比對到另一筆（陣列裡排序在前的那筆），查不到水電
  // 費紀錄，算出來的水電費就會是 0——而且不會跳錯誤，表面上看起來只是
  // 某幾間宿舍「輸入水電費後沒有算進學生請款」，很難直接看出原因，所以
  // 新增/改名時先擋掉重複名稱。
  async function handleSave(data) {
    const duplicate = rows.some((r) => r.id !== data.id && r.name === data.name);
    if (duplicate) {
      alert(`已經有一筆宿舍名稱是「${data.name}」了，宿舍名稱不能重複（名稱重複會導致水電費/其他費用對應錯宿舍，學生請款計算算不出正確金額）。請改用不同名稱，或是直接編輯既有的那一筆。`);
      return;
    }
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
          <div className="page-desc">管理公司承租的宿舍清單：租期、押金、租金、房仲費，以及按月填寫的其他費用；「項目選項」可以自行維護這間宿舍常用的收入/支出項目名稱，填寫其他費用時直接挑選{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增宿舍</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有宿舍紀錄，請先下載備份再匯入。水費/電費/瓦斯費/其他費用請改用清單上的「填寫其他費用」依月份個別輸入。</p>}
      {duplicateDormNames.length > 0 && (
        <p className="split-note" style={{ color: 'var(--danger)' }}>
          ⚠ 發現重複的宿舍名稱：{duplicateDormNames.join('、')}。住宿安排/學生請款計算是用宿舍名稱去對應，名稱重複會讓水電費/其他費用算到錯的那一筆、學生請款計算查不到紀錄變成 0，而且不會跳錯誤訊息。請把其中一筆改成不同名稱（例如加註地址），或是合併成同一筆。
        </p>
      )}
      <div className="card">
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <input placeholder="搜尋名稱/地點" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap sticky-header"><table>
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
                        <button onClick={() => setOptionsEditing(r)}>項目選項</button>
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
      <div className="card">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <div>
            <h3 style={{ marginTop: 0 }}>電動車管理</h3>
            <div className="page-desc">產值差額＝每月租金(累計，依每段出租期間實際經過天數換算，未結束的段只算到今天)－購買金額；「住宿安排」頁面勾選「是否借用電動車」會自動同步寫入對應那段出租期間{!canEditPage && '（唯讀）'}</div>
          </div>
          <div className="row-actions">
            {canEditPage && <button className="primary" onClick={() => setVehicleEditing({})}>+ 新增電動車</button>}
            <ImportExportButtons rows={vehicles} onExport={handleExportVehicles} onImport={handleImportVehicles} canEdit={canEditPage} />
          </div>
        </div>
        {loadingVehicles ? <p className="muted">載入中…</p> : (
          <div className="table-wrap sticky-header"><table>
            <thead>
              <tr>
                <th>照片</th><th>編號</th><th>車輛放置處</th><th>購買日期</th><th>車子型號</th><th>購買金額</th><th>設備內容</th>
                <th>出租期間(筆數)</th><th>產值差額</th>
                {canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const periods = parseRentalPeriods(v.rentalPeriods);
                const diff = vehicleValueDiff(v, today);
                return (
                  <tr key={v.id}>
                    <td>{v.photoUrl ? <img src={v.photoUrl} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} /> : '—'}</td>
                    <td>{v.number || '—'}</td>
                    <td>{v.location || '—'}</td>
                    <td>{v.purchaseDate || '—'}</td>
                    <td>{v.model || '—'}</td>
                    <td>{v.purchaseAmount ? Number(v.purchaseAmount).toLocaleString() : '—'}</td>
                    <td>{equipmentSummary(v)}</td>
                    <td>{periods.length}</td>
                    <td style={{ color: diff < 0 ? 'var(--danger)' : undefined, fontWeight: 600 }}>{diff.toLocaleString()}</td>
                    {canEditPage && (
                      <td className="row-actions">
                        <button onClick={() => setVehicleEditing(v)}>編輯</button>
                        <button className="danger" onClick={() => removeVehicle(v.id)}>刪除</button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {vehicles.length === 0 && <tr><td colSpan={10} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <DormFormModal initial={editing} users={users} onCancel={() => setEditing(null)} onSave={handleSave} />}
      {utilEditing && (
        <OtherFeesFormModal
          month={month}
          initial={utilEditing}
          itemOptions={parseItemOptions(rows.find((r) => r.id === utilEditing.dormId)?.itemOptions)}
          onCancel={() => setUtilEditing(null)}
          onSave={(data) => handleSaveUtility(utilEditing.dormId, data)}
        />
      )}
      {viewingDorm && (
        <ResidentsModal dorm={viewingDorm} residents={residentsOf(viewingDorm.name)} studentName={studentName} onClose={() => setViewingDorm(null)} />
      )}
      {optionsEditing && (
        <ItemOptionsModal
          dorm={optionsEditing}
          onCancel={() => setOptionsEditing(null)}
          onSave={async (itemOptions) => { await update(optionsEditing.id, { itemOptions: JSON.stringify(itemOptions) }); setOptionsEditing(null); }}
        />
      )}
      {vehicleEditing && <VehicleFormModal initial={vehicleEditing} onCancel={() => setVehicleEditing(null)} onSave={handleSaveVehicle} />}
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

// 每間宿舍自己維護一組收入/支出項目名稱，「填寫其他費用」的項目名稱
// 欄位會用這份清單當下拉建議（仍可自行輸入清單以外的文字，不強制）。
function ItemOptionsModal({ dorm, onCancel, onSave }) {
  const [options, setOptions] = useState(() => parseItemOptions(dorm.itemOptions));
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('支出');

  function addOption() {
    const label = newLabel.trim();
    if (!label) return;
    if (options.some((o) => o.label === label && o.type === newType)) { alert('已經有一筆同名稱、同類型的項目了。'); return; }
    setOptions([...options, { label, type: newType }]);
    setNewLabel('');
  }
  function removeOption(i) {
    setOptions(options.filter((_, idx) => idx !== i));
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{dorm.name} · 收支項目選項</h3>
        <p className="muted">維護這間宿舍常用的「其他費用」項目名稱，填寫時可以直接從建議清單挑，不用每個月重打；這裡只是維護可挑選的名稱清單，不是填實際金額。</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>項目名稱</th><th>類型</th><th></th></tr></thead>
            <tbody>
              {options.map((o, i) => (
                <tr key={`${o.label}-${o.type}`}>
                  <td>{o.label}</td>
                  <td>{o.type}</td>
                  <td><button type="button" onClick={() => removeOption(i)}>移除</button></td>
                </tr>
              ))}
              {options.length === 0 && <tr><td colSpan={3} className="muted">目前沒有自訂項目選項。</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="row-actions" style={{ marginTop: 12 }}>
          <input placeholder="新項目名稱" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} style={{ width: 160 }} />
          <select value={newType} onChange={(e) => setNewType(e.target.value)}>
            {OTHER_FEE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="button" onClick={addOption}>+ 新增</button>
        </div>
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button className="primary" onClick={() => onSave(options)}>儲存</button>
          <button type="button" onClick={onCancel}>取消</button>
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

function OtherFeesListEditor({ fees, itemOptions, onChange }) {
  function updateRow(i, patch) {
    onChange(fees.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function removeRow(i) {
    onChange(fees.filter((_, idx) => idx !== i));
  }
  function addRow() {
    onChange([...fees, { label: '', amount: '', payer: '學生自付', type: '支出' }]);
  }

  return (
    <div>
      <datalist id="dorm-other-fee-options">
        {(itemOptions || []).map((o) => <option key={`${o.label}-${o.type}`} value={o.label} />)}
      </datalist>
      {fees.map((f, i) => {
        const feeType = f.type || '支出';
        return (
          <div key={i} className="form-grid" style={{ marginBottom: 8 }}>
            <label>
              項目名稱
              <input list="dorm-other-fee-options" value={f.label || ''} onChange={(e) => updateRow(i, { label: e.target.value })} />
            </label>
            <label>
              類型
              <select value={feeType} onChange={(e) => updateRow(i, { type: e.target.value })}>
                {OTHER_FEE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>
              金額
              <input value={f.amount || ''} onChange={(e) => updateRow(i, { amount: e.target.value })} />
            </label>
            {feeType === '支出' && (
              <label>
                付款方式
                <select value={f.payer || '學生自付'} onChange={(e) => updateRow(i, { payer: e.target.value })}>
                  {OTHER_FEE_PAYERS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            )}
            <button type="button" onClick={() => removeRow(i)} style={{ alignSelf: 'end' }}>移除</button>
          </div>
        );
      })}
      <button type="button" onClick={addRow}>+ 新增其他費用</button>
      <p className="muted" style={{ marginTop: 8 }}>類型選「支出」才需要選付款方式：廠商代付的項目不會出現在學生請款計算，會改計入客戶請款計算的「宿舍其他費用」，平分給這個月住在這間宿舍、廠商代付的學生所屬客戶。類型選「收入」的項目只計入宿舍損益的收入，不會跟任何人請款。</p>
    </div>
  );
}

function RentalPeriodsEditor({ periods, onChange }) {
  function updateRow(i, patch) {
    onChange(periods.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function removeRow(i) {
    onChange(periods.filter((_, idx) => idx !== i));
  }
  function addRow() {
    onChange([...periods, { start: '', end: '', monthlyRent: '' }]);
  }

  return (
    <div>
      {periods.map((p, i) => (
        <div key={i} className="form-grid" style={{ marginBottom: 8 }}>
          <label>
            出租起始日
            <input type="date" value={p.start || ''} onChange={(e) => updateRow(i, { start: e.target.value })} />
          </label>
          <label>
            出租結束日
            <input type="date" value={p.end || ''} onChange={(e) => updateRow(i, { end: e.target.value })} />
          </label>
          <label>
            每月租金
            <input type="number" value={p.monthlyRent || ''} onChange={(e) => updateRow(i, { monthlyRent: e.target.value })} />
          </label>
          {p.housingRecordId && <span className="muted" style={{ alignSelf: 'end', paddingBottom: 8 }}>（由住宿安排同步）</span>}
          <button type="button" onClick={() => removeRow(i)} style={{ alignSelf: 'end' }}>移除</button>
        </div>
      ))}
      <button type="button" onClick={addRow}>+ 新增出租期間</button>
      <p className="muted" style={{ marginTop: 8 }}>標註「由住宿安排同步」的段是住宿紀錄勾選「是否借用電動車」自動帶入的，改住宿紀錄的入住日/退宿日/每月金額會自動更新這裡；其他段可以自行新增，用在沒有綁定住宿紀錄的出租情況。</p>
    </div>
  );
}

function VehicleFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const periods = parseRentalPeriods(form.rentalPeriods);

  function setPeriods(next) {
    setForm({ ...form, rentalPeriods: JSON.stringify(next) });
  }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    setUploadError('');
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setUploadError(`照片檔案太大（上限 ${Math.round(MAX_ATTACHMENT_SIZE / 1024 / 1024)}MB）`);
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const oldPath = form.photoPath;
      const { url, name, path } = await uploadAttachment(file, 'tsaipei_electricVehiclePhotos');
      setForm((f) => ({ ...f, photoUrl: url, photoName: name, photoPath: path }));
      if (oldPath) deleteAttachmentFile(oldPath);
    } catch (err) {
      setUploadError(`上傳失敗：${err.message || err}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function handleRemovePhoto() {
    if (form.photoPath) deleteAttachmentFile(form.photoPath);
    setForm((f) => ({ ...f, photoUrl: '', photoName: '', photoPath: '' }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const cleaned = parseRentalPeriods(form.rentalPeriods).filter((p) => p.start);
    onSave({ ...form, rentalPeriods: JSON.stringify(cleaned) });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯電動車' : '新增電動車'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            {VEHICLE_FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
          </div>
          <h4>車輛照片</h4>
          <div style={{ marginBottom: 12 }}>
            {form.photoUrl && (
              <div style={{ marginBottom: 6 }}>
                <img src={form.photoUrl} alt="" style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 4, display: 'block', marginBottom: 6 }} />
                <button type="button" onClick={handleRemovePhoto}>移除照片</button>
              </div>
            )}
            <input type="file" accept="image/*" onChange={handlePhotoChange} disabled={uploading} />
            {uploading && <div className="muted">上傳中…</div>}
            {uploadError && <div style={{ color: 'var(--danger)' }}>{uploadError}</div>}
          </div>
          <h4>設備內容</h4>
          <div className="row-actions" style={{ marginBottom: 12 }}>
            {VEHICLE_EQUIPMENT_ITEMS.map((it) => (
              <label key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={!!form[it.key]} onChange={(e) => setForm({ ...form, [it.key]: e.target.checked })} />
                {it.label}
              </label>
            ))}
          </div>
          <h4>出租期間（多筆）</h4>
          <RentalPeriodsEditor periods={periods} onChange={setPeriods} />
          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OtherFeesFormModal({ month, initial, itemOptions, onCancel, onSave }) {
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
          <p className="muted" style={{ marginTop: -8 }}>水電瓦斯費平分給這個月住在這間宿舍的所有學生，不論住宿安排裡填的「水電瓦斯付款方式」是「學生自付」還是「廠商代付」，一律出現在學生請款計算，不會因為標「廠商代付」就改跟客戶請款收。</p>
          <h4>其他費用（可自行新增，項目名稱可從「項目選項」挑或自己輸入）</h4>
          <OtherFeesListEditor fees={otherFees} itemOptions={itemOptions} onChange={setOtherFees} />
          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
