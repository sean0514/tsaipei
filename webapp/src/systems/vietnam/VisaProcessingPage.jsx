import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { ALLOWED_SOURCE_SUPPLIERS, studentFullLabel, studentCompanyLabel, groupByLabel, buildTranslationMap } from '../../lib/tsaipeiSourceFilter';
import { ensureVietnamStudentForTsaipeiStudent } from '../../lib/vietnamTsaipeiStudentSync';
import { t } from '../../lib/i18n';

// 越南簽證辦理：資料本身存在越南系統（vietnam_visaProcessing），學生則是
// 境外生實習系統（tsaipei_students）裡學生來源(國外供應商)為
// ALLOWED_SOURCE_SUPPLIERS 的紀錄——境外生實習系統「申辦進度追蹤」的
// 「經濟部/交通部審核」或「發函後寄國外」任一關第一次填入日期時，會自動
// 在這裡建立一筆「辦理中」的紀錄（見 tsaipei/ApplicationProgressPage.jsx
// 的 handleSave），不用等越南端的人員自己盯著境外生實習系統手動建立；
// 辦理簽證時間/簽證完成時間則是越南端的人員自己在這裡填寫。依客戶（學生
// 所媒合的實習單位）分組顯示，跟「辦理簽證提醒」「在台簽證追蹤」同一套
// 分組方式。建立紀錄時（手動新增或上面的自動連動）會順便確保越南系統
// （vietnam_students）也有這位學生的對應紀錄，這樣「越南送機行程」才能
// 選到這位學生、建立送機紀錄（見 lib/vietnamTsaipeiStudentSync.js 的
// ensureVietnamStudentForTsaipeiStudent）。
export default function VisaProcessingPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'visaProcessing', role, overrides);
  const { rows, loading: loadingRows, add, update, remove } = useCollection('vietnam_visaProcessing');
  const { rows: students, loading: loadingStudents } = useCollection('tsaipei_students');
  const { rows: matches, loading: loadingMatches } = useCollection('tsaipei_matches');
  const { rows: admittedList, loading: loadingAdmitted } = useCollection('tsaipei_admittedList');
  const { rows: positions, loading: loadingPositions } = useCollection('tsaipei_positions');
  const { rows: companyTranslations } = useCollection('vietnam_companyNameTranslations');
  const [editing, setEditing] = useState(null);
  const loading = loadingRows || loadingStudents || loadingMatches || loadingAdmitted || loadingPositions;
  const ctx = { matches, admittedList, positions };
  const translations = buildTranslationMap(companyTranslations);

  const eligibleStudents = students.filter((s) => ALLOWED_SOURCE_SUPPLIERS.includes(s.sourceSupplier));
  const unrecordedStudents = eligibleStudents.filter((s) => !rows.some((r) => r.studentId === s.id));

  const withStudent = rows
    .map((r) => ({ ...r, student: students.find((s) => s.id === r.studentId) }))
    .filter((r) => ALLOWED_SOURCE_SUPPLIERS.includes(r.student?.sourceSupplier));
  const groups = groupByLabel(withStudent, (r) => studentCompanyLabel(r.studentId, ctx, translations, lang));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add(data);
      // 同步確保越南系統（vietnam_students）也有這位學生的對應紀錄，這樣
      // 「越南送機行程」才能選到這位學生、建立送機紀錄（見
      // lib/vietnamTsaipeiStudentSync.js 的 ensureVietnamStudentForTsaipeiStudent）。
      const student = students.find((s) => s.id === data.studentId);
      await ensureVietnamStudentForTsaipeiStudent(data.studentId, student);
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('越南簽證辦理', lang)}</h2>
          <div className="page-desc">{t('境外生實習系統「申辦進度追蹤」的經濟部/交通部審核或發函後寄國外任一完成後會自動建立「辦理中」紀錄，辦理簽證時間/簽證完成時間在這裡手動填寫', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        {canEditPage && <button className="primary" onClick={() => setEditing({ status: '辦理中' })}>+ {t('新增紀錄', lang)}</button>}
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        groups.length === 0 ? (
          <p className="muted">{t('目前沒有越南簽證辦理中的學生。', lang)}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {groups.map((g) => (
              <div className="card" key={g.label} style={{ overflowX: 'auto' }}>
                <h3 style={{ marginTop: 0 }}>{g.label} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{g.rows.length} {t('位學生', lang)}</span></h3>
                <div className="table-wrap"><table>
                  <thead>
                    <tr><th>{t('學生', lang)}</th><th>{t('狀態', lang)}</th><th>{t('辦理簽證時間', lang)}</th><th>{t('簽證完成時間', lang)}</th><th>{t('備註', lang)}</th>{canEditPage && <th></th>}</tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{studentFullLabel(r.student)}</td>
                        <td>{t(r.status, lang) || '—'}</td>
                        <td>{r.visaStartDate || '—'}</td>
                        <td>{r.visaCompleteDate || '—'}</td>
                        <td className="muted">{r.note || '—'}</td>
                        {canEditPage && (
                          <td className="row-actions">
                            <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                            <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            ))}
          </div>
        )
      )}
      {editing && (
        <VisaProcessingFormModal initial={editing} students={editing.id ? students : unrecordedStudents} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />
      )}
    </div>
  );
}

const STATUS_OPTIONS = ['辦理中', '已完成'];

function VisaProcessingFormModal({ initial, students, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯越南簽證辦理', lang) : t('新增越南簽證辦理', lang)}</h3>
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
