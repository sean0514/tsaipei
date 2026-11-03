import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' }, { key: 'studentName', label: '學生姓名' },
  { key: 'school', label: '就讀學校' }, { key: 'amount', label: '獎學金金額' },
  { key: 'approved', label: '已審核' }, { key: 'remittanceDate', label: '匯款日期' }, { key: 'closed', label: '結案' }, { key: 'note', label: '備註' },
];

// 審核狀態只用 approved/remittanceDate/closed 三個欄位推算顯示用的狀態
// 標籤，不另外存一個 status 字串欄位，避免跟實際欄位值不同步。
function statusOf(r) {
  if (r.closed) return { label: '結案', cls: 'tag-grey' };
  if (r.remittanceDate) return { label: '已匯款', cls: 'tag-green' };
  if (r.approved) return { label: '已審核', cls: 'tag-amber' };
  return { label: '待審核', cls: 'tag-blue' };
}

function studentLabel(s) {
  return s ? (s.chineseName || s.originalName || s.vietnameseName || '') : '';
}

// 獎學金紀錄：新增紀錄只開放「越南送機行程」出現過、還沒建立紀錄的學生
// （學生安排送機後才算案件完成，才需要辦獎學金），依學生就讀學校分組顯示。
export default function ScholarshipsPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'scholarships', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('vietnam_scholarships');
  const { rows: students } = useCollection('vietnam_students');
  const { rows: schools } = useCollection('vietnam_schoolSetup');
  const { rows: departureTransport } = useCollection('vietnam_departureTransport');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_scholarships', CSV_FIELDS, { entityLabel: '獎學金紀錄', requiredKeys: ['studentId'], canEdit: canEditPage });

  function studentOf(studentId) {
    return students.find((s) => s.id === studentId);
  }

  const departedStudentIds = new Set(departureTransport.map((d) => d.studentId).filter(Boolean));
  const eligibleStudents = students.filter((s) => departedStudentIds.has(s.id));
  const unrecordedStudents = eligibleStudents.filter((s) => !rows.some((r) => r.studentId === s.id));

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows.filter((r) => {
    if (!searchQuery) return true;
    const s = studentOf(r.studentId);
    return `${studentLabel(s)} ${s?.school || ''}`.toLowerCase().includes(searchQuery);
  });

  const groups = {};
  filteredRows.forEach((r) => {
    const schoolName = studentOf(r.studentId)?.school || '（未設定學校）';
    (groups[schoolName] ||= []).push(r);
  });
  Object.values(groups).forEach((list) => list.sort((a, b) => studentLabel(studentOf(a.studentId)).localeCompare(studentLabel(studentOf(b.studentId)))));
  const schoolNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  async function handleSave(data) {
    const payload = { ...data, amount: Number(data.amount) || 0 };
    if (!payload.remittanceDate) delete payload.remittanceDate;
    if (data.id) {
      const { id, ...rest } = payload;
      await update(id, rest);
    } else {
      await add(payload);
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('獎學金紀錄', lang)}</h2>
          <div className="page-desc">{t('新增紀錄只開放「越南送機行程」出現過、還沒建立紀錄的學生，依學生就讀學校自動帶入「學校費用設定」設定的獎學金金額（可再手動調整）；審核狀態：待審核→已審核→已匯款（含匯款日期）→結案', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          <input placeholder={t('搜尋學生或學校', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增獎學金紀錄', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        schoolNames.length === 0 ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>{t('尚未建立獎學金紀錄', lang)}</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {schoolNames.map((schoolName) => (
              <div className="card" key={schoolName} style={{ overflowX: 'auto' }}>
                <h3 style={{ marginTop: 0 }}>{schoolName} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[schoolName].length} {t('筆', lang)}</span></h3>
                <div className="table-wrap"><table>
                  <thead>
                    <tr>
                      <th>{t('學生', lang)}</th><th>{t('獎學金金額', lang)}</th>
                      <th>{t('狀態', lang)}</th><th>{t('匯款日期', lang)}</th>{canEditPage && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {groups[schoolName].map((r) => {
                      const s = studentOf(r.studentId);
                      const status = statusOf(r);
                      return (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 600 }}>{studentLabel(s) || '—'}</td>
                          <td>{(r.amount || 0).toLocaleString()}</td>
                          <td><span className={`tag ${status.cls}`}>{t(status.label, lang)}</span></td>
                          <td>{r.remittanceDate || '—'}</td>
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
        <ScholarshipFormModal
          initial={editing}
          students={editing.id ? students : unrecordedStudents}
          schools={schools}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
          lang={lang}
        />
      )}
    </div>
  );
}

function ScholarshipFormModal({ initial, students, schools, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const sortedStudents = [...students].sort((a, b) => studentLabel(a).localeCompare(studentLabel(b)));

  function handleStudentChange(studentId) {
    const student = students.find((s) => s.id === studentId);
    const school = student && schools.find((sc) => sc.name === student.school);
    // 只有新建紀錄、還沒手動填過金額時才自動帶入，避免覆蓋使用者已經
    // 手動調整過的金額。
    const shouldAutoFill = !initial.id && !form.amount;
    setForm({ ...form, studentId, amount: shouldAutoFill && school ? school.scholarshipAmount : form.amount });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯獎學金紀錄', lang) : t('新增獎學金紀錄', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('學生', lang)}
              <select required disabled={!!initial.id} value={form.studentId || ''} onChange={(e) => handleStudentChange(e.target.value)}>
                <option value="">{t('請選擇', lang)}</option>
                {sortedStudents.map((s) => <option key={s.id} value={s.id}>{studentLabel(s)}{s.school ? `（${s.school}）` : ''}</option>)}
              </select>
            </label>
            <label>
              {t('獎學金金額', lang)}
              <input type="number" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            <label>
              {t('匯款日期', lang)}
              <input type="date" value={form.remittanceDate || ''} onChange={(e) => setForm({ ...form, remittanceDate: e.target.value })} />
            </label>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <input type="checkbox" checked={!!form.approved} onChange={(e) => setForm({ ...form, approved: e.target.checked })} />
            {t('已審核', lang)}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <input type="checkbox" checked={!!form.closed} onChange={(e) => setForm({ ...form, closed: e.target.checked })} />
            {t('結案', lang)}
          </label>
          <label style={{ display: 'block', marginTop: 8 }}>
            {t('備註', lang)}
            <textarea rows={3} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ marginBottom: 16 }} />
          </label>
          <div className="row-actions">
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
