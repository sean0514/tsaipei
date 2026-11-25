import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';

const CURRENCIES = ['新台幣', '美金', '越盾'];
const DEFAULT_CURRENCY = '新台幣';

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' }, { key: 'studentName', label: '學生姓名' },
  { key: 'school', label: '就讀學校' }, { key: 'amount', label: '獎學金金額' }, { key: 'currency', label: '幣別' },
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

// 獎學金紀錄：學生一建檔就自動產生一筆空白紀錄（見下面的自動補建
// effect），不用等業務手動點「+新增」；金額/幣別依學生目前就讀學校在
// 「學校費用設定」設定的獎學金金額/幣別自動帶入（設定裡沒有這間學校或
// 還沒填金額就是 0，可以再手動調整），依學生就讀學校分組顯示。
export default function ScholarshipsPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'scholarships', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('vietnam_scholarships');
  const { rows: students, loading: studentsLoading } = useCollection('vietnam_students');
  const { rows: schools, loading: schoolsLoading } = useCollection('vietnam_schoolSetup');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_scholarships', CSV_FIELDS, { entityLabel: '獎學金紀錄', requiredKeys: ['studentId'], canEdit: canEditPage });

  function studentOf(studentId) {
    return students.find((s) => s.id === studentId);
  }
  function schoolSetupOf(schoolName) {
    return schools.find((sc) => sc.name === schoolName);
  }

  const unrecordedStudents = students.filter((s) => !rows.some((r) => r.studentId === s.id));

  // 自動補建＋自動補帶入金額/幣別：每筆沒有對應獎學金紀錄的學生（不論是
  // 在「學生資料」直接新增、履歷轉入、還是境外生同步建立），載入時自動
  // 建立一筆空白紀錄；既有紀錄金額還是 0 的也依目前的學校費用設定補上
  // 金額/幣別。不用業務自己點「+新增」逐一補，也不用等學校費用設定補填
  // 完才手動一筆筆改。只跑一次，避免即時同步推回新資料時重複觸發。
  const ensureStubsDone = useRef(false);
  useEffect(() => {
    if (!canEditPage || loading || studentsLoading || schoolsLoading || ensureStubsDone.current) return;
    ensureStubsDone.current = true;
    unrecordedStudents.forEach((s) => {
      const schoolSetup = schoolSetupOf(s.school);
      add({
        studentId: s.id,
        school: s.school || '',
        amount: schoolSetup?.scholarshipAmount || 0,
        currency: schoolSetup?.scholarshipCurrency || DEFAULT_CURRENCY,
      });
    });
    // 既有紀錄金額還是 0 的（當初建立空白紀錄時，學校費用設定還沒填金額，
    // 或學校設定是後來才補上/修改的），依目前的學校費用設定補上金額/幣別；
    // 已經手動填過金額（非 0）的紀錄不動，避免覆蓋業務調整過的值。學校
    // 名稱優先用紀錄自己存的 school，舊資料沒有這個欄位才退回去查學生
    // 資料目前的就讀學校。
    rows.forEach((r) => {
      if (r.amount) return;
      const schoolName = r.school || studentOf(r.studentId)?.school;
      const schoolSetup = schoolSetupOf(schoolName);
      if (!schoolSetup?.scholarshipAmount) return;
      update(r.id, {
        school: r.school || schoolName || '',
        amount: schoolSetup.scholarshipAmount,
        currency: schoolSetup.scholarshipCurrency || DEFAULT_CURRENCY,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, studentsLoading, schoolsLoading, canEditPage]);

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows.filter((r) => {
    if (!searchQuery) return true;
    const s = studentOf(r.studentId);
    return `${studentLabel(s)} ${r.school || ''}`.toLowerCase().includes(searchQuery);
  });

  const groups = {};
  filteredRows.forEach((r) => {
    const schoolName = r.school || '（未設定學校）';
    (groups[schoolName] ||= []).push(r);
  });
  Object.values(groups).forEach((list) => list.sort((a, b) => studentLabel(studentOf(a.studentId)).localeCompare(studentLabel(studentOf(b.studentId)))));
  const schoolNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  async function toggleClosed(r) {
    await update(r.id, { closed: !r.closed });
  }

  async function handleSave(data) {
    const payload = { ...data, amount: Number(data.amount) || 0, currency: data.currency || DEFAULT_CURRENCY };
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
          <div className="page-desc">{t('學生建檔時自動帶入名單，依學生就讀學校自動帶入「學校費用設定」設定的獎學金金額/幣別（可再手動調整）；審核狀態：待審核→已審核→已匯款（含匯款日期）→結案', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
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
                      <th>{t('學生', lang)}</th><th>{t('獎學金金額', lang)}</th><th>{t('幣別', lang)}</th>
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
                          <td>{t(r.currency || DEFAULT_CURRENCY, lang)}</td>
                          <td><span className={`tag ${status.cls}`}>{t(status.label, lang)}</span></td>
                          <td>{r.remittanceDate || '—'}</td>
                          {canEditPage && (
                            <td className="row-actions">
                              <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                              {r.closed
                                ? <button onClick={() => toggleClosed(r)}>{t('取消已結案', lang)}</button>
                                : <button onClick={() => toggleClosed(r)}>{t('結案', lang)}</button>}
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
    // 手動調整過的金額/幣別。
    const shouldAutoFill = !initial.id && !form.amount;
    setForm({
      ...form,
      studentId,
      school: student?.school || form.school,
      amount: shouldAutoFill && school ? school.scholarshipAmount : form.amount,
      currency: shouldAutoFill && school ? (school.scholarshipCurrency || DEFAULT_CURRENCY) : (form.currency || DEFAULT_CURRENCY),
    });
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
              {t('幣別', lang)}
              <select value={form.currency || DEFAULT_CURRENCY} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{t(c, lang)}</option>)}
              </select>
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
