import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canView, canEdit as computeCanEdit } from '../../lib/permissions';
import { exportEntityCSV } from '../../lib/csv';

const TYPES = ['接機', '送機', '送工', '送宿舍'];
const AIRPORT_TYPES = ['接機', '送機'];
const BILL_TO_OPTIONS = ['實習單位', '鈞羽', '學生'];

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// Ported from studentCompanyName/matchPositionLabel in apps-script/Index.html.
function studentCompanyLabel(studentId, { matches, admittedList, positions }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  if (!m) return '未指定客戶';
  const p = positions.find((pp) => pp.id === m.positionId);
  if (!p) return '未指定客戶';
  return [p.projectCode, p.company, m.venue].filter(Boolean).join(' ') || '未指定客戶';
}

function daysBetween(dateStr, today) {
  return Math.abs((new Date(dateStr) - new Date(today)) / 86400000);
}

// 接送車輛安排：跟「預計入台/離台」一樣，掃在台簽證追蹤裡落在今天前後一個
// 月內的入境/離境紀錄，列成「待安排」清單，一鍵帶入學生/日期/建議類型
// （入境→接機、離境→送機）建立一筆安排；安排本身存在獨立的
// tsaipei_vehicleArrangements，不是寫回在台簽證追蹤，所以送工/送宿舍這種
// 沒有對應入境/離境日期的安排也可以直接「新增安排車輛」手動建立。
export default function VehiclePickupPage() {
  const { system, role, overrides } = useOutletContext();
  const canSee = canView(system, 'vehiclePickup', role, overrides);
  const canEditPage = computeCanEdit(system, 'vehiclePickup', role, overrides);
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { rows: visaRecords, loading: l1 } = useCollection('tsaipei_inTaiwanVisa');
  const { rows: arrangements, loading: l2, add, update, remove } = useCollection('tsaipei_vehicleArrangements', { order: ['date', 'asc'] });
  const [reportMonth, setReportMonth] = useState(currentMonthStr());
  const [editing, setEditing] = useState(null);
  const loading = l1 || l2;

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);
  const today = new Date().toISOString().slice(0, 10);

  const pending = [];
  visaRecords.forEach((v) => {
    if (v.firstEntryDate && daysBetween(v.firstEntryDate, today) <= 30) pending.push({ v, date: v.firstEntryDate, label: '第一次入境', suggestedType: '接機' });
    if (v.secondEntryDate && daysBetween(v.secondEntryDate, today) <= 30) pending.push({ v, date: v.secondEntryDate, label: '第二次入境', suggestedType: '接機' });
    if (v.firstExitDate && daysBetween(v.firstExitDate, today) <= 30) pending.push({ v, date: v.firstExitDate, label: '第一次離境', suggestedType: '送機' });
    if (v.secondExitDate && daysBetween(v.secondExitDate, today) <= 30) pending.push({ v, date: v.secondExitDate, label: '第二次離境', suggestedType: '送機' });
  });
  // 已經依這筆入境/離境紀錄建立過安排的，不再出現在「待安排」清單。
  const arranged = (visaId, label) => arrangements.some((a) => a.visaId === visaId && a.visaLabel === label);
  const pendingList = pending.filter(({ v, label }) => !arranged(v.id, label)).sort((a, b) => a.date.localeCompare(b.date));

  const arrangedList = [...arrangements].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  function handleDownload() {
    const monthRows = arrangedList
      .filter((a) => (a.date || '').startsWith(reportMonth))
      .map((a) => ({
        studentName: studentFullLabel(studentById(a.studentId)),
        company: studentCompanyLabel(a.studentId, ctx),
        type: a.type || '',
        date: a.date || '',
        vehicleCompany: a.vehicleCompany || '',
        vehicleLocation: a.vehicleLocation || '',
        terminal: a.terminal || '',
        flightTime: a.flightTime || '',
        fee: a.fee || '',
        billTo: a.billTo || '',
        done: a.done ? '是' : '否',
      }));
    exportEntityCSV(
      monthRows,
      [
        { key: 'studentName', label: '學生' },
        { key: 'company', label: '客戶' },
        { key: 'type', label: '類型' },
        { key: 'date', label: '車輛接送日期' },
        { key: 'vehicleCompany', label: '車輛公司' },
        { key: 'vehicleLocation', label: '車輛接送地點' },
        { key: 'terminal', label: '出入境航廈' },
        { key: 'flightTime', label: '班機時間' },
        { key: 'fee', label: '車資費用' },
        { key: 'billTo', label: '請款對象' },
        { key: 'done', label: '已完成' },
      ],
      `接送車輛安排_${reportMonth}`
    );
  }

  async function handleSave(data) {
    try {
      const { id, ...rest } = data;
      if (!AIRPORT_TYPES.includes(rest.type)) { rest.terminal = ''; rest.flightTime = ''; }
      if (id) await update(id, rest);
      else await add(rest);
      setEditing(null);
    } catch (err) {
      alert(`儲存失敗：${err?.message || '請稍後再試'}`);
    }
  }

  async function handleRemove(id) {
    if (!confirm('確定要刪除這筆安排嗎？')) return;
    try {
      await remove(id);
    } catch (err) {
      alert(`刪除失敗：${err?.message || '請稍後再試'}`);
    }
  }

  async function toggleDone(a) {
    try {
      await update(a.id, { done: !a.done });
    } catch (err) {
      alert(`更新失敗：${err?.message || '請稍後再試'}`);
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>接送車輛安排</h2>
          <div className="page-desc">「待安排」清單同步「預計入台/離台」：在台簽證追蹤裡落在今天前後一個月內的入境/離境紀錄{!canSee && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
          <button onClick={handleDownload}>下載此月份報表</button>
          {canEditPage && <button className="primary" onClick={() => setEditing({ type: '送工', billTo: '', done: false })}>+ 新增安排車輛</button>}
        </div>
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>待安排 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {pendingList.length} 筆</span></h3>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>學生</th><th>客戶</th><th>日期</th><th>項目</th><th>建議類型</th>{canEditPage && <th></th>}</tr>
                  </thead>
                  <tbody>
                    {pendingList.map(({ v, date, label, suggestedType }, i) => (
                      <tr key={`${v.id}-${label}-${i}`}>
                        <td>{studentFullLabel(studentById(v.studentId))}</td>
                        <td>{studentCompanyLabel(v.studentId, ctx)}</td>
                        <td>{date}</td>
                        <td>{label}</td>
                        <td>{suggestedType}</td>
                        {canEditPage && (
                          <td>
                            <button onClick={() => setEditing({
                              studentId: v.studentId, visaId: v.id, visaLabel: label,
                              type: suggestedType, date, billTo: '', done: false,
                            })}>新增安排</button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {pendingList.length === 0 && <tr><td colSpan={5 + (canEditPage ? 1 : 0)} className="muted">目前沒有資料。</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>已安排 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {arrangedList.length} 筆</span></h3>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>學生</th><th>客戶</th><th>類型</th><th>車輛接送日期</th><th>車輛公司</th><th>車輛接送地點</th>
                      <th>出入境航廈</th><th>班機時間</th><th>車資費用</th><th>請款對象</th><th>已完成</th>
                      {canEditPage && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {arrangedList.map((a) => (
                      <tr key={a.id}>
                        <td>{studentFullLabel(studentById(a.studentId))}</td>
                        <td>{studentCompanyLabel(a.studentId, ctx)}</td>
                        <td>{a.type || '—'}</td>
                        <td>{a.date || '—'}</td>
                        <td>{a.vehicleCompany || '—'}</td>
                        <td>{a.vehicleLocation || '—'}</td>
                        <td>{AIRPORT_TYPES.includes(a.type) ? (a.terminal || '—') : '—'}</td>
                        <td>{AIRPORT_TYPES.includes(a.type) ? (a.flightTime || '—') : '—'}</td>
                        <td>{a.fee || '—'}</td>
                        <td>{a.billTo || '—'}</td>
                        <td>
                          {canEditPage ? (
                            <input type="checkbox" checked={!!a.done} onChange={() => toggleDone(a)} />
                          ) : (a.done ? '是' : '否')}
                        </td>
                        {canEditPage && (
                          <td className="row-actions">
                            <button onClick={() => setEditing(a)}>編輯</button>
                            <button onClick={() => handleRemove(a.id)}>刪除</button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {arrangedList.length === 0 && <tr><td colSpan={11 + (canEditPage ? 1 : 0)} className="muted">目前沒有資料。</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      {editing && (
        <VehicleFormModal
          initial={editing}
          students={students}
          arrangements={arrangements}
          ctx={ctx}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

const VEHICLE_COMPANY_CUSTOM = '__custom__';

function VehicleFormModal({ initial, students, arrangements, ctx, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const showAirportFields = AIRPORT_TYPES.includes(form.type);
  // 實習廠商名稱：直接連動目前選的學生，跟「已安排」列表的「客戶」欄同一套
  // studentCompanyLabel 算法(媒合紀錄/錄取名單/實習單位)，不是另外存一份、
  // 换學生就手動改的欄位，換學生這裡就會自動跟著換，不會跟實際媒合資料對
  // 不起來。
  const internshipCompany = form.studentId ? studentCompanyLabel(form.studentId, ctx) : '—';
  // 車輛公司改成下拉選單，選項取自之前填過的廠商名稱，避免同一間廠商每次
  // 都要重新打字、打法不一致（「○○租車」跟「○○租車行」變成兩間不同公司）；
  // 保留「自行輸入」讓使用者還是可以新增沒出現過的廠商。
  const vehicleCompanyOptions = [...new Set(arrangements.map((a) => a.vehicleCompany).filter(Boolean))].sort();
  const [vehicleCompanyCustom, setVehicleCompanyCustom] = useState(
    !!initial.vehicleCompany && !vehicleCompanyOptions.includes(initial.vehicleCompany)
  );
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{form.id ? '編輯安排' : '新增安排車輛'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              學生
              <select required value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                <option value="" disabled>請選擇</option>
                {students.map((s) => <option key={s.id} value={s.id}>{studentFullLabel(s)}</option>)}
              </select>
            </label>
            <label>
              實習廠商名稱
              <input value={internshipCompany} disabled readOnly style={{ background: 'var(--bg-muted, #f3f4f6)' }} />
            </label>
            <label>
              類型
              <select value={form.type || ''} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>
              車輛接送日期
              <input type="date" value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>
              車輛公司
              <select
                value={vehicleCompanyCustom ? VEHICLE_COMPANY_CUSTOM : (form.vehicleCompany || '')}
                onChange={(e) => {
                  if (e.target.value === VEHICLE_COMPANY_CUSTOM) { setVehicleCompanyCustom(true); setForm({ ...form, vehicleCompany: '' }); }
                  else { setVehicleCompanyCustom(false); setForm({ ...form, vehicleCompany: e.target.value }); }
                }}
              >
                <option value="">請選擇</option>
                {vehicleCompanyOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                <option value={VEHICLE_COMPANY_CUSTOM}>自行輸入…</option>
              </select>
              {vehicleCompanyCustom && (
                <input
                  style={{ marginTop: 6 }}
                  placeholder="自行輸入廠商名稱"
                  value={form.vehicleCompany || ''}
                  onChange={(e) => setForm({ ...form, vehicleCompany: e.target.value })}
                />
              )}
            </label>
            <label>
              車輛接送地點
              <input value={form.vehicleLocation || ''} onChange={(e) => setForm({ ...form, vehicleLocation: e.target.value })} />
            </label>
            {showAirportFields && (
              <>
                <label>
                  出入境航廈
                  <input value={form.terminal || ''} onChange={(e) => setForm({ ...form, terminal: e.target.value })} />
                </label>
                <label>
                  班機時間
                  <input type="datetime-local" value={form.flightTime || ''} onChange={(e) => setForm({ ...form, flightTime: e.target.value })} />
                </label>
              </>
            )}
            <label>
              車資費用
              <input type="number" value={form.fee || ''} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
            </label>
            <label>
              請款對象
              <select value={form.billTo || ''} onChange={(e) => setForm({ ...form, billTo: e.target.value })}>
                <option value="">請選擇</option>
                {BILL_TO_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label>
              已完成
              <input type="checkbox" checked={!!form.done} onChange={(e) => setForm({ ...form, done: e.target.checked })} style={{ width: 'auto' }} />
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
