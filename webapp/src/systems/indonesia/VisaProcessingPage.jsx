import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { ALLOWED_SOURCE_SUPPLIERS_INDONESIA, studentFullLabel, studentCompanyLabel, groupByLabel, buildTranslationMap } from '../../lib/tsaipeiSourceFilter';
import { ensureIndonesiaStudentForTsaipeiStudent, backfillIndonesiaStudentsForTsaipeiStudents } from '../../lib/indonesiaTsaipeiStudentSync';
import { t } from '../../lib/i18n';

// 印尼簽證辦理：資料本身存在印尼系統（indonesia_visaProcessing），學生則是
// 境外生實習系統（tsaipei_students）裡學生來源(國外供應商)為
// ALLOWED_SOURCE_SUPPLIERS_INDONESIA 的紀錄——境外生實習系統「申辦進度追蹤」的
// 「經濟部/交通部審核」或「發函後寄國外」任一關第一次填入日期時，會自動
// 在這裡建立一筆「辦理中」的紀錄（見 tsaipei/ApplicationProgressPage.jsx
// 的 handleSave），不用等印尼端的人員自己盯著境外生實習系統手動建立；
// 辦理簽證時間/簽證完成時間則是印尼端的人員自己在這裡填寫。依客戶（學生
// 所媒合的實習單位）分組顯示，跟「辦理簽證提醒」「在台簽證追蹤」同一套
// 分組方式。建立紀錄時（手動新增或上面的自動連動）會順便確保印尼系統
// （indonesia_students）也有這位學生的對應紀錄，這樣「印尼送機行程」才能
// 選到這位學生、建立送機紀錄（見 lib/indonesiaTsaipeiStudentSync.js 的
// ensureIndonesiaStudentForTsaipeiStudent）。
export default function VisaProcessingPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'visaProcessing', role, overrides);
  const { rows, loading: loadingRows, add, update, remove } = useCollection('indonesia_visaProcessing');
  const { rows: students, loading: loadingStudents } = useCollection('tsaipei_students');
  const { rows: matches, loading: loadingMatches } = useCollection('tsaipei_matches');
  const { rows: admittedList, loading: loadingAdmitted } = useCollection('tsaipei_admittedList');
  const { rows: positions, loading: loadingPositions } = useCollection('tsaipei_positions');
  const { rows: companyTranslations } = useCollection('indonesia_companyNameTranslations');
  const [editing, setEditing] = useState(null);
  const loading = loadingRows || loadingStudents || loadingMatches || loadingAdmitted || loadingPositions;
  const ctx = { matches, admittedList, positions };
  const translations = buildTranslationMap(companyTranslations);

  const eligibleStudents = students.filter((s) => ALLOWED_SOURCE_SUPPLIERS_INDONESIA.includes(s.sourceSupplier));
  const unrecordedStudents = eligibleStudents.filter((s) => !rows.some((r) => r.studentId === s.id));

  const withStudent = rows
    .map((r) => ({ ...r, student: students.find((s) => s.id === r.studentId) }))
    .filter((r) => ALLOWED_SOURCE_SUPPLIERS_INDONESIA.includes(r.student?.sourceSupplier));
  const inProgressRows = withStudent.filter((r) => r.status !== '已完成');
  const completedRows = withStudent.filter((r) => r.status === '已完成');
  const inProgressGroups = groupByLabel(inProgressRows, (r) => studentCompanyLabel(r.studentId, ctx, translations, lang));
  const completedGroups = groupByLabel(completedRows, (r) => studentCompanyLabel(r.studentId, ctx, translations, lang));

  // 補跑一次：這個同步機制上線前就已經存在的「印尼簽證辦理」紀錄，對應的
  // 印尼系統學生資料可能還沒建立（見 lib/indonesiaTsaipeiStudentSync.js 的
  // backfillIndonesiaStudentsForTsaipeiStudents），頁面載入後補一次，不用等
  // 下次有人編輯/重新建立紀錄才會補到。
  const backfillDone = useRef(false);
  useEffect(() => {
    if (loading || !canEditPage || backfillDone.current) return;
    backfillDone.current = true;
    const tsStudentsWithIds = withStudent.map((r) => ({ id: r.studentId, ...r.student }));
    backfillIndonesiaStudentsForTsaipeiStudents(tsStudentsWithIds).catch((err) => {
      console.error('印尼簽證辦理：補建印尼學生資料失敗', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // 刪除境外生學生以前沒有連動清掉這裡連動建立的紀錄（已經補上，見
  // tsaipei/StudentsPage.jsx 的 handleDelete 跟 indonesia/StudentsPage.jsx 的
  // deleteSyncedTsaipeiStudent），導致舊資料留下一批 studentId 已經找不到
  // 對應境外生學生的孤兒紀錄（因為上面的 withStudent 會把這些孤兒紀錄
  // 直接篩掉，不會顯示在畫面上，所以不容易發現）。這裡載入時順便清掉：
  // 對每筆孤兒紀錄只嘗試刪除一次，避免即時同步推回新資料時重複觸發。
  const attemptedCleanupIds = useRef(new Set());
  useEffect(() => {
    if (!canEditPage || loadingRows || loadingStudents) return;
    const studentIds = new Set(students.map((s) => s.id));
    rows.forEach((r) => {
      if (!r.studentId || studentIds.has(r.studentId) || attemptedCleanupIds.current.has(r.id)) return;
      attemptedCleanupIds.current.add(r.id);
      remove(r.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, students, loadingRows, loadingStudents, canEditPage]);

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add(data);
      // 同步確保印尼系統（indonesia_students）也有這位學生的對應紀錄，這樣
      // 「印尼送機行程」才能選到這位學生、建立送機紀錄（見
      // lib/indonesiaTsaipeiStudentSync.js 的 ensureIndonesiaStudentForTsaipeiStudent）。
      const student = students.find((s) => s.id === data.studentId);
      await ensureIndonesiaStudentForTsaipeiStudent(data.studentId, student);
    }
    setEditing(null);
  }

  // 列表上的「已完成」快捷按鈕：不用開編輯視窗，直接把狀態改成「已完成」；
  // 簽證完成時間還沒填的話順便帶入今天的日期（可再手動調整），已經填過
  // 就不覆蓋。
  async function markCompleted(r) {
    await update(r.id, { status: '已完成', visaCompleteDate: r.visaCompleteDate || new Date().toISOString().slice(0, 10) });
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('印尼簽證辦理', lang)}</h2>
          <div className="page-desc">{t('境外生實習系統「申辦進度追蹤」的經濟部/交通部審核或發函後寄國外任一完成後會自動建立「辦理中」紀錄，辦理簽證時間/簽證完成時間在這裡手動填寫', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        {canEditPage && <button className="primary" onClick={() => setEditing({ status: '辦理中' })}>+ {t('新增紀錄', lang)}</button>}
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 8px' }}>{t('辦理中', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{inProgressRows.length} {t('位學生', lang)}</span></h3>
            {inProgressGroups.length === 0 ? (
              <p className="muted">{t('目前沒有印尼簽證辦理中的學生。', lang)}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {inProgressGroups.map((g) => (
                  <VisaProcessingGroupTable key={g.label} group={g} canEditPage={canEditPage} onEdit={setEditing} onRemove={remove} onComplete={markCompleted} lang={lang} />
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 style={{ margin: '0 0 8px' }}>{t('已完成', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{completedRows.length} {t('位學生', lang)}</span></h3>
            {completedGroups.length === 0 ? (
              <p className="muted">{t('目前沒有已完成的學生。', lang)}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {completedGroups.map((g) => (
                  <VisaProcessingGroupTable key={g.label} group={g} canEditPage={canEditPage} onEdit={setEditing} onRemove={remove} lang={lang} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {editing && (
        <VisaProcessingFormModal initial={editing} students={editing.id ? students : unrecordedStudents} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />
      )}
    </div>
  );
}

function VisaProcessingGroupTable({ group, canEditPage, onEdit, onRemove, onComplete, lang }) {
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <h3 style={{ marginTop: 0 }}>{group.label} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{group.rows.length} {t('位學生', lang)}</span></h3>
      <div className="table-wrap"><table>
        <thead>
          <tr><th>{t('學生', lang)}</th><th>{t('狀態', lang)}</th><th>{t('辦理簽證時間', lang)}</th><th>{t('簽證完成時間', lang)}</th><th>{t('備註', lang)}</th>{canEditPage && <th></th>}</tr>
        </thead>
        <tbody>
          {group.rows.map((r) => (
            <tr key={r.id}>
              <td style={{ fontWeight: 600 }}>{studentFullLabel(r.student)}</td>
              <td>{t(r.status, lang) || '—'}</td>
              <td>{r.visaStartDate || '—'}</td>
              <td>{r.visaCompleteDate || '—'}</td>
              <td className="muted">{r.note || '—'}</td>
              {canEditPage && (
                <td className="row-actions">
                  {onComplete && <button onClick={() => onComplete(r)}>{t('已完成', lang)}</button>}
                  <button onClick={() => onEdit(r)}>{t('編輯', lang)}</button>
                  <button className="danger" onClick={() => onRemove(r.id)}>{t('刪除', lang)}</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}

const STATUS_OPTIONS = ['辦理中', '已完成'];

function VisaProcessingFormModal({ initial, students, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯印尼簽證辦理', lang) : t('新增印尼簽證辦理', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('學生', lang)}
              <select required disabled={!!initial.id} value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                <option value="">{t('請選擇', lang)}</option>
                {students.map((s) => <option key={s.id} value={s.id}>{studentFullLabel(s)}</option>)}
              </select>
            </label>
            <label>
              {t('狀態', lang)}
              <select value={form.status || ''} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{t(o, lang)}</option>)}
              </select>
            </label>
            <label>
              {t('辦理簽證時間', lang)}
              <input type="date" value={form.visaStartDate || ''} onChange={(e) => setForm({ ...form, visaStartDate: e.target.value })} />
            </label>
            <label>
              {t('簽證完成時間', lang)}
              <input type="date" value={form.visaCompleteDate || ''} onChange={(e) => setForm({ ...form, visaCompleteDate: e.target.value })} />
            </label>
          </div>
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
