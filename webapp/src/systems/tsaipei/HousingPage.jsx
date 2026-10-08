import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const PAYERS = ['學生自付', '廠商代付'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' }, { key: 'type', label: '宿舍名稱' },
  { key: 'address', label: '地址' }, { key: 'contactName', label: '宿舍管理員1' }, { key: 'contactName2', label: '宿舍管理員2' },
  { key: 'contactPhone', label: '翻譯' }, { key: 'payer', label: '付款方式' },
  { key: 'checkIn', label: '入住日' }, { key: 'checkOut', label: '退宿日' }, { key: 'monthlyRent', label: '每月租金' },
  { key: 'completed', label: '已完成' }, { key: 'notes', label: '備註' },
];

// Ported from studentCompanyName/matchPositionLabel in apps-script/Index.html —
// 這裡只取「實習場域」當分店名稱，不是完整的專案＋客戶標籤。
function studentVenueLabel(studentId, { matches, admittedList, positions }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  return m?.venue || '—';
}

// 有第二次入出境紀錄就用第二次，沒有才退回第一次（跟 DashboardPage 同一套判斷）。
function effectiveEntryDate(s) { return s?.secondEntryDate || s?.firstEntryDate || ''; }
function effectiveExitDate(s) { return s?.secondExitDate || s?.firstExitDate || ''; }

export default function HousingPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'housing', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_housingRecords');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: dormitories } = useCollection('tsaipei_dormitories');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { rows: users } = useCollection('tsaipei_users');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_housingRecords', CSV_FIELDS, { entityLabel: '住宿安排', requiredKeys: ['studentId'], canEdit: canEditPage });

  const ctx = { matches, admittedList, positions };
  const studentName = (id) => { const s = students.find((x) => x.id === id); return s?.chineseName || s?.originalName || '(未知)'; };
  const studentEntryDate = (id) => effectiveEntryDate(students.find((x) => x.id === id)) || '—';
  const studentExitDate = (id) => effectiveExitDate(students.find((x) => x.id === id)) || '—';
  const today = new Date().toISOString().slice(0, 10);

  function classify(r) {
    if (r.completed) return null;
    if (!r.checkIn) return '未安排';
    if (r.checkOut && r.checkOut < today) return '已離宿';
    return '住宿中';
  }

  const searchQuery = q.trim().toLowerCase();
  const groups = { 未安排: [], 住宿中: [], 已離宿: [] };
  rows.forEach((r) => {
    const c = classify(r);
    if (!c) return;
    if (searchQuery && !`${studentName(r.studentId)} ${studentVenueLabel(r.studentId, ctx)} ${r.type || ''}`.toLowerCase().includes(searchQuery)) return;
    groups[c].push(r);
  });
  // 「住宿中」「已離宿」也依分店排序（「未安排」本來就依分店分組顯示）。
  groups.住宿中.sort((a, b) => studentVenueLabel(a.studentId, ctx).localeCompare(studentVenueLabel(b.studentId, ctx)));
  groups.已離宿.sort((a, b) => studentVenueLabel(a.studentId, ctx).localeCompare(studentVenueLabel(b.studentId, ctx)));

  // 「未安排」再依分店（實習場域）分類，方便各分店各自安排住宿。
  function groupByVenue(list) {
    const map = {};
    list.forEach((r) => {
      const venue = studentVenueLabel(r.studentId, ctx) || '未設定分店';
      (map[venue] = map[venue] || []).push(r);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }

  // 既有紀錄裡原本就沒有的欄位（例如舊資料沒有 contactName2），使用者沒
  // 碰過那個欄位的話，表單狀態裡該欄位值會是 undefined——Firestore
  // updateDoc()/addDoc() 不接受 undefined 欄位值會直接丟例外，所以存檔前
  // 統一把 undefined 換成空字串。
  function sanitize(data) {
    const out = {};
    Object.entries(data).forEach(([k, v]) => { out[k] = v === undefined ? '' : v; });
    return out;
  }

  async function handleSave(data) {
    try {
      if (data.id) {
        const { id, ...rest } = data;
        await update(id, sanitize(rest));
      } else {
        await add(sanitize(data));
      }
      setEditing(null);
    } catch (err) {
      alert(`儲存失敗：${err.message || err}`);
    }
  }

  function renderTable(list, label) {
    return (
      <div className="table-wrap"><table>
        <thead><tr><th>學生</th><th>分店</th><th>入境日</th><th>離境日</th><th>宿舍名稱</th><th>付款方式</th><th>每月租金</th><th>入住日</th><th>退宿日</th>{canEditPage && <th></th>}</tr></thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id}>
              <td>{studentName(r.studentId)}</td>
              <td>{studentVenueLabel(r.studentId, ctx)}</td>
              <td>{studentEntryDate(r.studentId)}</td>
              <td>{studentExitDate(r.studentId)}</td>
              <td>{r.type || '—'}</td>
              <td>{r.payer || '—'}</td>
              <td>{r.monthlyRent ? Number(r.monthlyRent).toLocaleString() : '—'}</td>
              <td>{r.checkIn || '—'}</td>
              <td>{r.checkOut || '—'}</td>
              {canEditPage && (
                <td className="row-actions">
                  <button onClick={() => setEditing(r)}>編輯</button>
                  {label === '已離宿' && <button onClick={() => update(r.id, { completed: true })}>已完成</button>}
                  <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                </td>
              )}
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={10} className="muted">沒有資料</td></tr>}
        </tbody>
      </table></div>
    );
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>住宿安排</h2>
          <div className="page-desc">依未安排／住宿中／已離宿分類{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增住宿</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「學生ID」欄位）；上傳後會完全取代目前所有住宿紀錄，請先下載備份再匯入。填入「入住日」後會自動歸類到「住宿中」；「退宿日」到期後自動歸類到「已離宿」。</p>}
      <input placeholder="搜尋學生、分店或宿舍名稱" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {Object.entries(groups).map(([label, list]) => (
        <div className="card" key={label} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>{label}（{list.length}）</h3>
          {label === '未安排' && list.length > 0 ? (
            groupByVenue(list).map(([venue, items]) => (
              <div key={venue} style={{ marginBottom: 14 }}>
                <h4 style={{ marginTop: 0, marginBottom: 6 }}>{venue} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{items.length} 人</span></h4>
                {renderTable(items, label)}
              </div>
            ))
          ) : renderTable(list, label)}
        </div>
      ))}
      {editing && <HousingFormModal initial={editing} students={students} dormitories={dormitories} users={users} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function HousingFormModal({ initial, students, dormitories, users, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const dormNames = [...new Set(dormitories.map((d) => d.name).filter(Boolean))];
  if (form.type && !dormNames.includes(form.type)) dormNames.push(form.type);
  // 宿管人員1/2 下拉選單的選項，取自「宿舍管理」各宿舍設定的宿管1/宿管2
  // 名單，避免手打造成名字不一致。
  const managerNames = [...new Set(dormitories.flatMap((d) => [d.manager1, d.manager2]).filter(Boolean))].sort();
  if (form.contactName && !managerNames.includes(form.contactName)) managerNames.push(form.contactName);
  if (form.contactName2 && !managerNames.includes(form.contactName2)) managerNames.push(form.contactName2);
  // 翻譯下拉選單的選項，取自系統使用人員名單。
  const staffOptions = [...new Set((users || []).map((u) => u.displayName || u.email).filter(Boolean))].sort();

  // 選了宿舍名稱後，自動帶入該宿舍在「宿舍管理」設定的地點/宿管1/宿管2
  // （只在宿舍本身有填的欄位才覆蓋，不會把已經填好的值清空）。
  function handleDormChange(name) {
    const dorm = dormitories.find((d) => d.name === name);
    setForm({
      ...form,
      type: name,
      // Firestore updateDoc() 不接受 undefined，三者都沒值時要補空字串，
      // 不然儲存會直接丟例外（儲存失敗：Unsupported field value: undefined）。
      address: dorm?.location || form.address || '',
      contactName: dorm?.manager1 || form.contactName || '',
      contactName2: dorm?.manager2 || form.contactName2 || '',
    });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯住宿' : '新增住宿'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              學生
              <select required value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                <option value="" disabled>請選擇</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.chineseName || s.originalName}</option>)}
              </select>
            </label>
            <label>
              宿舍名稱
              <select value={form.type || ''} onChange={(e) => handleDormChange(e.target.value)}>
                <option value="">請選擇</option>
                {dormNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>
              付款方式
              <select value={form.payer || ''} onChange={(e) => setForm({ ...form, payer: e.target.value })}>
                <option value="">請選擇</option>
                {PAYERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label>
              入住日
              <input type="date" value={form.checkIn || ''} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} />
            </label>
            <label>
              退宿日
              <input type="date" value={form.checkOut || ''} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} />
            </label>
            <label>
              每月租金
              <input type="number" value={form.monthlyRent || ''} onChange={(e) => setForm({ ...form, monthlyRent: e.target.value })} />
            </label>
            <label>
              地址
              <input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
            <label>
              宿舍管理員1
              <select value={form.contactName || ''} onChange={(e) => setForm({ ...form, contactName: e.target.value })}>
                <option value="">（未設定）</option>
                {managerNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>
              宿舍管理員2
              <select value={form.contactName2 || ''} onChange={(e) => setForm({ ...form, contactName2: e.target.value })}>
                <option value="">（未設定）</option>
                {managerNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>
              翻譯
              <select value={form.contactPhone || ''} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}>
                <option value="">（未設定）</option>
                {staffOptions.map((o) => <option key={o} value={o}>{o}</option>)}
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
