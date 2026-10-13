import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import Tag from '../../components/Tag';
import { SECOND_INTERVIEW_TAG } from '../../lib/tags';
import { ALLOWED_SOURCE_SUPPLIERS, studentFullLabel, groupByLabel } from '../../lib/tsaipeiSourceFilter';
import { t } from '../../lib/i18n';

// 唯讀：改成顯示境外生實習系統（tsaipei_secondInterviews）的資料，只篩選
// 學生來源(國外供應商)是 ALLOWED_SOURCE_SUPPLIERS 這幾個的紀錄；這個分頁
// 在元凱系統不能新增/編輯/刪除，實際編輯請到境外生實習系統的「二面進度」
// 頁面。依客戶（職缺所屬的實習單位）分組顯示。
export default function SecondInterviewsPage() {
  const { lang } = useOutletContext();
  const { rows: interviews, loading: loadingInterviews } = useCollection('tsaipei_secondInterviews');
  const { rows: matches, loading: loadingMatches } = useCollection('tsaipei_matches');
  const { rows: students, loading: loadingStudents } = useCollection('tsaipei_students');
  const { rows: positions, loading: loadingPositions } = useCollection('tsaipei_positions');
  const loading = loadingInterviews || loadingMatches || loadingStudents || loadingPositions;

  const rows = interviews
    .filter((r) => !r.confirmedClosed)
    .map((r) => {
      const match = matches.find((m) => m.id === r.matchId);
      const student = match ? students.find((s) => s.id === match.studentId) : null;
      const position = match ? positions.find((p) => p.id === match.positionId) : null;
      return { ...r, student, position };
    })
    .filter((r) => ALLOWED_SOURCE_SUPPLIERS.includes(r.student?.sourceSupplier))
    .sort((a, b) => studentFullLabel(a.student).localeCompare(studentFullLabel(b.student)));

  const groups = groupByLabel(rows, (r) => (r.position ? [r.position.projectCode, r.position.company].filter(Boolean).join(' ') : null));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('二面進度', lang)}</h2>
          <div className="page-desc">{t('資料來源：境外生實習系統，僅顯示學生來源(國外供應商)為阮氏芳草、阿草、阿草（鳳仙）的紀錄，唯讀顯示，編輯請到境外生實習系統操作', lang)}</div>
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        groups.length === 0 ? <p className="muted">{t('沒有資料', lang)}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {groups.map((g) => (
              <div className="card" key={g.label} style={{ overflowX: 'auto' }}>
                <h3 style={{ marginTop: 0 }}>{g.label} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{g.rows.length} {t('位學生', lang)}</span></h3>
                <div className="table-wrap"><table>
                  <thead><tr><th>{t('學生', lang)}</th><th>{t('二面日期', lang)}</th><th>{t('面試方式', lang)}</th><th>{t('狀態', lang)}</th></tr></thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{studentFullLabel(r.student)}</td>
                        <td>{r.date || '—'}</td>
                        <td>{r.method || '—'}</td>
                        <td><Tag value={r.status} map={SECOND_INTERVIEW_TAG} /></td>
                      </tr>
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
