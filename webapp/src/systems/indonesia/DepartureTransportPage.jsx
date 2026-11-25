import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { exportEntityCSV } from '../../lib/csv';
import { t } from '../../lib/i18n';

const BILL_TO_OPTIONS = ['實習單位', '元凱', '學生'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' }, { key: 'date', label: '送機日期' },
  { key: 'airline', label: '航空公司' }, { key: 'flightNumber', label: '航班編號' }, { key: 'terminal', label: '出入境航廈' },
  { key: 'flightTime', label: '班機時間' }, { key: 'fee', label: '車資費用' }, { key: 'billTo', label: '請款對象' },
  { key: 'billedToStudent', label: '是否列入學生請款' }, { key: 'done', label: '已完成' },
];
// 「實習單位」是從 matches/admittedList/positions 推算出來的顯示用欄位，不是
// departureTransport 文件本身存的資料，所以只加進匯出用的欄位清單，不能放進
// 上面 CSV_FIELDS（那份清單同時也是匯入比對表頭、決定要寫回文件的欄位，如果
// 把這個算出來的欄位也放進去，匯入時會把它當成一個要寫入的欄位存進文件裡，
// 變成一個跟 positions.company 脫勾、不會再更新的舊資料）。
const EXPORT_FIELDS = [
  ...CSV_FIELDS.slice(0, 2), { key: 'company', label: '實習單位' }, ...CSV_FIELDS.slice(2),
];

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// 複製自 InTaiwanCarePage.jsx 的同名函式：依學生目前的媒合/錄取結果找出實習單位名稱。
function studentCompanyLabel(studentId, { matches, admittedList, positions }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  if (!m) return '未指定';
  const p = positions.find((pp) => pp.id === m.positionId);
  return p?.company || '未指定';
}

function monthOf(dateStr) {
  return (dateStr || '').slice(0, 7) || '未填日期';
}

// 印尼送機行程：學生離台當天的送機安排，依日期(月份)分組顯示；跟境外生
// 實習系統的「接送車輛安排」不同，這裡只處理「送機」這一種行程，不含
// 接機/送工/送宿舍，欄位也比照需求只保留學生/學校/航班資訊/車資/請款。
export default function DepartureTransportPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'departureTransport', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('indonesia_departureTransport');
  const { rows: students, loading: studentsLoading } = useCollection('indonesia_students');
  const { rows: matches } = useCollection('indonesia_matches');
  const { rows: admittedList } = useCollection('indonesia_admittedList');
  const { rows: positions } = useCollection('indonesia_positions');
  const companyCtx = { matches, admittedList, positions };
  const [editing, setEditing] = useState(null);
  const { handleImport } = useCsvOverwrite('indonesia_departureTransport', CSV_FIELDS, { entityLabel: '送機行程', requiredKeys: ['studentId'], canEdit: canEditPage });

  // 刪除學生以前沒有連動清掉這裡的空白紀錄（已經補上，見 StudentsPage.jsx
  // 的 handleDelete），導致舊資料留下一批 studentId 已經找不到對應學生的
  // 孤兒紀錄，畫面上顯示成「(已刪除)」。這裡載入時順便清掉：對每筆孤兒
  // 紀錄只嘗試刪除一次（用 attemptedCleanupIds 記住），避免每次 Firestore
  // 即時同步推回新的 rows/students 就重複觸發一次刪除。
  const attemptedCleanupIds = useRef(new Set());
  useEffect(() => {
    if (!canEditPage || loading || studentsLoading) return;
    const studentIds = new Set(students.map((s) => s.id));
    rows.forEach((r) => {
      if (!r.studentId || studentIds.has(r.studentId) || attemptedCleanupIds.current.has(r.id)) return;
      attemptedCleanupIds.current.add(r.id);
      remove(r.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, students, loading, studentsLoading, canEditPage]);

  function handleExportWithCompany(exportRows) {
    exportEntityCSV(
      exportRows.map((r) => ({ ...r, company: studentCompanyLabel(r.studentId, companyCtx) })),
      EXPORT_FIELDS,
      '送機行程'
    );
  }

  function studentOf(studentId) { return students.find((s) => s.id === studentId); }

  const sorted = [...rows].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const groups = {};
  sorted.forEach((r) => { (groups[monthOf(r.date)] ||= []).push(r); });
  const monthKeys = Object.keys(groups).sort();

  async function handleSave(data) {
    const payload = { ...data, fee: Number(data.fee) || 0 };
    if (data.id) {
      const { id, ...rest } = payload;
      await update(id, rest);
    } else {
      await add(payload);
    }
    setEditing(null);
  }

  async function toggleBilledToStudent(r) { await update(r.id, { billedToStudent: !r.billedToStudent }); }
  async function toggleDone(r) { await update(r.id, { done: !r.done }); }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('印尼送機行程', lang)}</h2>
          <div className="page-desc">{t('學生離台送機安排，依日期分組顯示', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({ billedToStudent: false, done: false })}>+ {t('新增送機行程', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExportWithCompany} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        monthKeys.length === 0 ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>{t('尚未建立送機行程', lang)}</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {monthKeys.map((month) => (
              <div className="card" key={month} style={{ overflowX: 'auto' }}>
                <h3 style={{ marginTop: 0 }}>{month === '未填日期' ? t('未填日期', lang) : month}</h3>
                <div className="table-wrap"><table>
                  <thead>
                    <tr>
                      <th>{t('送機日期', lang)}</th><th>{t('學生名稱', lang)}</th><th>{t('學校', lang)}</th><th>{t('實習單位', lang)}</th><th>{t('航空公司', lang)}</th>
                      <th>{t('航班編號', lang)}</th><th>{t('出入境航廈', lang)}</th><th>{t('班機時間', lang)}</th><th>{t('車資費用', lang)}</th>
                      <th>{t('請款對象', lang)}</th><th>{t('是否列入學生請款', lang)}</th><th>{t('已完成', lang)}</th>
                      {canEditPage && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {groups[month].map((r) => {
                      const s = studentOf(r.studentId);
                      return (
                        <tr key={r.id}>
                          <td>{r.date || '—'}</td>
                          <td style={{ fontWeight: 600 }}>{studentFullLabel(s)}</td>
                          <td>{s?.school || '—'}</td>
                          <td>{studentCompanyLabel(r.studentId, companyCtx)}</td>
                          <td>{r.airline || '—'}</td>
                          <td>{r.flightNumber || '—'}</td>
                          <td>{r.terminal || '—'}</td>
                          <td>{r.flightTime || '—'}</td>
                          <td>{(r.fee || 0).toLocaleString()}</td>
                          <td>{t(r.billTo, lang) || '—'}</td>
                          <td>{canEditPage ? <input type="checkbox" checked={!!r.billedToStudent} onChange={() => toggleBilledToStudent(r)} /> : (r.billedToStudent ? t('是', lang) : t('否', lang))}</td>
                          <td>{canEditPage ? <input type="checkbox" checked={!!r.done} onChange={() => toggleDone(r)} /> : (r.done ? t('是', lang) : t('否', lang))}</td>
                          {canEditPage && (
                            <td className="row-actions">
                              <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                              <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              </div>
            ))}
          </div>
        )
      )}
      {editing && (
        <DepartureTransportFormModal initial={editing} students={students} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />
      )}
    </div>
  );
}

function DepartureTransportFormModal({ initial, students, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const sortedStudents = [...students].sort((a, b) => (a.chineseName || '').localeCompare(b.chineseName || ''));

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯送機行程', lang) : t('新增送機行程', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('學生名稱', lang)}
              <select required value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                <option value="">{t('請選擇', lang)}</option>
                {sortedStudents.map((s) => <option key={s.id} value={s.id}>{studentFullLabel(s)}</option>)}
              </select>
            </label>
            <label>
              {t('送機日期', lang)}
              <input type="date" value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>
              {t('航空公司', lang)}
              <input value={form.airline || ''} onChange={(e) => setForm({ ...form, airline: e.target.value })} />
            </label>
            <label>
              {t('航班編號', lang)}
              <input value={form.flightNumber || ''} onChange={(e) => setForm({ ...form, flightNumber: e.target.value })} />
            </label>
            <label>
              {t('出入境航廈', lang)}
              <input value={form.terminal || ''} onChange={(e) => setForm({ ...form, terminal: e.target.value })} />
            </label>
            <label>
              {t('班機時間', lang)}
              <input type="datetime-local" value={form.flightTime || ''} onChange={(e) => setForm({ ...form, flightTime: e.target.value })} />
            </label>
            <label>
              {t('車資費用', lang)}
              <input type="number" value={form.fee || ''} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
            </label>
            <label>
              {t('請款對象', lang)}
              <select value={form.billTo || ''} onChange={(e) => setForm({ ...form, billTo: e.target.value })}>
                <option value="">{t('請選擇', lang)}</option>
                {BILL_TO_OPTIONS.map((o) => <option key={o} value={o}>{t(o, lang)}</option>)}
              </select>
            </label>
            <label>
              {t('是否列入學生請款', lang)}
              <input type="checkbox" checked={!!form.billedToStudent} onChange={(e) => setForm({ ...form, billedToStudent: e.target.checked })} style={{ width: 'auto' }} />
            </label>
            <label>
              {t('已完成', lang)}
              <input type="checkbox" checked={!!form.done} onChange={(e) => setForm({ ...form, done: e.target.checked })} style={{ width: 'auto' }} />
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
