import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { lastCompletedMilestone } from '../tsaipei/ApplicationProgressPage';
import { ALLOWED_SOURCE_SUPPLIERS, studentFullLabel, studentCompanyLabel } from '../../lib/tsaipeiSourceFilter';
import { t } from '../../lib/i18n';

// 唯讀：改成顯示境外生實習系統（tsaipei_applicationProgress）的資料，
// 只篩選目前進度剛好停在「辦理簽證」這一關、且學生來源(國外供應商)是
// ALLOWED_SOURCE_SUPPLIERS 這幾個的學生；這個分頁在元凱系統不能新增/
// 編輯/刪除，實際編輯請到境外生實習系統的「申辦進度追蹤」頁面。
export default function VisaReminderPage() {
  const { lang } = useOutletContext();
  const { rows: progress, loading: loadingProgress } = useCollection('tsaipei_applicationProgress');
  const { rows: students, loading: loadingStudents } = useCollection('tsaipei_students');
  const { rows: matches, loading: loadingMatches } = useCollection('tsaipei_matches');
  const { rows: admittedList, loading: loadingAdmitted } = useCollection('tsaipei_admittedList');
  const { rows: positions, loading: loadingPositions } = useCollection('tsaipei_positions');
  const loading = loadingProgress || loadingStudents || loadingMatches || loadingAdmitted || loadingPositions;
  const ctx = { matches, admittedList, positions };

  const rows = progress
    .filter((r) => !r.confirmedClosed)
    .map((r) => ({ ...r, student: students.find((s) => s.id === r.studentId) }))
    .filter((r) => ALLOWED_SOURCE_SUPPLIERS.includes(r.student?.sourceSupplier))
    .filter((r) => lastCompletedMilestone(r)?.key === 'visaDate');

  const groups = {};
  rows.forEach((r) => {
    const key = studentCompanyLabel(r.studentId, ctx);
    (groups[key] ||= []).push(r);
  });
  const groupKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('辦理簽證提醒', lang)}</h2>
          <div className="page-desc">{t('資料來源：境外生實習系統，僅顯示學生來源(國外供應商)為阮氏芳草、阿草、阿草（鳳仙）的紀錄，唯讀顯示，編輯請到境外生實習系統操作', lang)}</div>
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        groupKeys.length === 0 ? (
          <p className="muted">{t('目前沒有需要辦理簽證的學生。', lang)}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {groupKeys.map((key) => (
              <div className="card" key={key}>
                <h3 style={{ marginTop: 0 }}>{key} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[key].length} {t('位學生', lang)}</span></h3>
                <div className="table-wrap"><table>
                  <thead><tr><th>{t('學生', lang)}</th></tr></thead>
                  <tbody>
                    {groups[key].map((r) => (
                      <tr key={r.id}><td style={{ fontWeight: 600 }}>{studentFullLabel(r.student)}</td></tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
