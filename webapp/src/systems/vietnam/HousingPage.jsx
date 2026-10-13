import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';

const PAYERS = ['學生自付', '廠商代付'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' }, { key: 'type', label: '宿舍名稱' },
  { key: 'address', label: '地址' }, { key: 'contactName', label: '宿舍管理員1' }, { key: 'contactName2', label: '宿舍管理員2' },
  { key: 'contactPhone', label: '翻譯' }, { key: 'payer', label: '付款方式' },
  { key: 'checkIn', label: '入住日', type: 'date' }, { key: 'checkOut', label: '退宿日', type: 'date' }, { key: 'monthlyRent', label: '每月租金' },
  { key: 'completed', label: '已完成' }, { key: 'notes', label: '備註' },
];

function studentVenueLabel(studentId, { matches, admittedList, positions }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  return m?.venue || '—';
}

function effectiveEntryDate(s) { return s?.secondEntryDate || s?.firstEntryDate || ''; }
function effectiveExitDate(s) { return s?.secondExitDate || s?.firstExitDate || ''; }

// 複製自 systems/tsaipei/HousingPage.jsx，collection 字首改成 vietnam_，
// 介面文字包上 t(...)。
export default function HousingPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'housing', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('vietnam_housingRecords');
  const { rows: students } = useCollection('vietnam_students');
  const { rows: dormitories } = useCollection('vietnam_dormitories');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: positions } = useCollection('vietnam_positions');
  const { rows: users } = useCollection('vietnam_users');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_housingRecords', CSV_FIELDS, { entityLabel: '住宿安排', requiredKeys: ['studentId'], canEdit: canEditPage });

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
  groups.住宿中.sort((a, b) => studentVenueLabel(a.studentId, ctx).localeCompare(studentVenueLabel(b.studentId, ctx)));
  groups.已離宿.sort((a, b) => studentVenueLabel(a.studentId, ctx).localeCompare(studentVenueLabel(b.studentId, ctx)));

  function groupByVenue(list) {
    const map = {};
    list.forEach((r) => {
      const venue = studentVenueLabel(r.studentId, ctx) || t('未設定分店', lang);
      (map[venue] = map[venue] || []).push(r);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }

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
        <thead><tr><th>{t('學生', lang)}</th><th>{t('分店', lang)}</th><th>{t('入境日', lang)}</th><th>{t('離境日', lang)}</th><th>{t('宿舍名稱', lang)}</th><th>{t('付款方式', lang)}</th><th>{t('每月租金', lang)}</th><th>{t('入住日', lang)}</th><th>{t('退宿日', lang)}</th>{canEditPage && <th></th>}</tr></thead>
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
                  <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                  {label === '已離宿' && <button onClick={() => update(r.id, { completed: true })}>{t('已完成', lang)}</button>}
                  <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                </td>
              )}
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={10} className="muted">{t('沒有資料', lang)}</td></tr>}
        </tbody>
      </table></div>
    );
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('住宿安排', lang)}</h2>
          <div className="page-desc">{t('依未安排／住宿中／已離宿分類', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增住宿', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「學生ID」欄位）；上傳後會完全取代目前所有住宿紀錄，請先下載備份再匯入。填入「入住日」後會自動歸類到「住宿中」；「退宿日」到期後自動歸類到「已離宿」。', lang)}</p>}
      <input placeholder={t('搜尋學生、分店或宿舍名稱', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {Object.entries(groups).map(([label, list]) => (
        <div className="card" key={label} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>{t(label, lang)}（{list.length}）</h3>
          {label === '未安排' && list.length > 0 ? (
            groupByVenue(list).map(([venue, items]) => (
              <div key={venue} style={{ marginBottom: 14 }}>
                <h4 style={{ marginTop: 0, marginBottom: 6 }}>{venue} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{items.length} {t('人', lang)}</span></h4>
                {renderTable(items, label)}
              </div>
            ))
          ) : renderTable(list, label)}
        </div>
      ))}
      {editing && <HousingFormModal initial={editing} students={students} dormitories={dormitories} users={users} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function HousingFormModal({ initial, students, dormitories, users, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const dormNames = [...new Set(dormitories.map((d) => d.name).filter(Boolean))];
  if (form.type && !dormNames.includes(form.type)) dormNames.push(form.type);
  const managerNames = [...new Set(dormitories.flatMap((d) => [d.manager1, d.manager2]).filter(Boolean))].sort();
  if (form.contactName && !managerNames.includes(form.contactName)) managerNames.push(form.contactName);
  if (form.contactName2 && !managerNames.includes(form.contactName2)) managerNames.push(form.contactName2);
  const staffOptions = [...new Set((users || []).map((u) => u.displayName || u.email).filter(Boolean))].sort();

  function handleDormChange(name) {
    const dorm = dormitories.find((d) => d.name === name);
    setForm({
      ...form,
      type: name,
      address: dorm?.location || form.address || '',
      contactName: dorm?.manager1 || form.contactName || '',
      contactName2: dorm?.manager2 || form.contactName2 || '',
    });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯住宿', lang) : t('新增住宿', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('學生', lang)}
              <select required value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                <option value="" disabled>{t('請選擇', lang)}</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.chineseName || s.originalName}</option>)}
              </select>
            </label>
            <label>
              {t('宿舍名稱', lang)}
              <select value={form.type || ''} onChange={(e) => handleDormChange(e.target.value)}>
                <option value="">{t('請選擇', lang)}</option>
                {dormNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>
              {t('付款方式', lang)}
              <select value={form.payer || ''} onChange={(e) => setForm({ ...form, payer: e.target.value })}>
                <option value="">{t('請選擇', lang)}</option>
                {PAYERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label>
              {t('入住日', lang)}
              <input type="date" value={form.checkIn || ''} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} />
            </label>
            <label>
              {t('退宿日', lang)}
              <input type="date" value={form.checkOut || ''} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} />
            </label>
            <label>
              {t('每月租金', lang)}
              <input type="number" value={form.monthlyRent || ''} onChange={(e) => setForm({ ...form, monthlyRent: e.target.value })} />
            </label>
            <label>
              {t('地址', lang)}
              <input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
            <label>
              {t('宿舍管理員1', lang)}
              <select value={form.contactName || ''} onChange={(e) => setForm({ ...form, contactName: e.target.value })}>
                <option value="">{t('（未設定）', lang)}</option>
                {managerNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>
              {t('宿舍管理員2', lang)}
              <select value={form.contactName2 || ''} onChange={(e) => setForm({ ...form, contactName2: e.target.value })}>
                <option value="">{t('（未設定）', lang)}</option>
                {managerNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>
              {t('翻譯', lang)}
              <select value={form.contactPhone || ''} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}>
                <option value="">{t('（未設定）', lang)}</option>
                {staffOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              {t('備註', lang)}
              <input value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
          </div>
          <div className="row-actions">
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
