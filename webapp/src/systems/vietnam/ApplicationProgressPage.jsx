import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { ProgressPipeline } from '../tsaipei/ApplicationProgressPage';
import { ALLOWED_SOURCE_SUPPLIERS, studentFullLabel, studentCompanyLabel, groupByLabel, buildTranslationMap } from '../../lib/tsaipeiSourceFilter';
import { t } from '../../lib/i18n';

// 唯讀：改成顯示境外生實習系統（tsaipei_applicationProgress）的資料，
// 只篩選學生來源(國外供應商)是 ALLOWED_SOURCE_SUPPLIERS 這幾個的紀錄；
// 這個分頁在元凱系統不能新增/編輯/刪除，實際編輯請到境外生實習系統的
// 「申辦進度追蹤」頁面。進度圖示沿用 tsaipei 自己的 ProgressPipeline
// 元件，兩邊顯示邏輯完全一致。依客戶（學生所媒合的實習單位）分組顯示。
export default function ApplicationProgressPage() {
  const { lang } = useOutletContext();
  const { rows: progress, loading: loadingProgress } = useCollection('tsaipei_applicationProgress');
  const { rows: students, loading: loadingStudents } = useCollection('tsaipei_students');
  const { rows: matches, loading: loadingMatches } = useCollection('tsaipei_matches');
  const { rows: admittedList, loading: loadingAdmitted } = useCollection('tsaipei_admittedList');
  const { rows: positions, loading: loadingPositions } = useCollection('tsaipei_positions');
  const { rows: companyTranslations } = useCollection('vietnam_companyNameTranslations');
  const loading = loadingProgress || loadingStudents || loadingMatches || loadingAdmitted || loadingPositions;
  const ctx = { matches, admittedList, positions };
  const translations = buildTranslationMap(companyTranslations);

  const rows = progress
    .filter((r) => !r.confirmedClosed)
    .map((r) => ({ ...r, student: students.find((s) => s.id === r.studentId) }))
    .filter((r) => ALLOWED_SOURCE_SUPPLIERS.includes(r.student?.sourceSupplier))
    .sort((a, b) => studentFullLabel(a.student).localeCompare(studentFullLabel(b.student)));

  const groups = groupByLabel(rows, (r) => studentCompanyLabel(r.studentId, ctx, translations, lang));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('申辦進度追蹤', lang)}</h2>
          <div className="page-desc">{t('資料來源：境外生實習系統，僅顯示學生來源(國外供應商)為阮氏芳草、阿草、阿草（鳳仙）、SON LE、NGOC LINH 的紀錄，唯讀顯示，編輯請到境外生實習系統操作', lang)}</div>
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        groups.length === 0 ? <p className="muted">{t('沒有資料', lang)}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {groups.map((g) => (
              <div className="card" key={g.label}>
                <h3 style={{ marginTop: 0 }}>{g.label} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{g.rows.length} {t('位學生', lang)}</span></h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {g.rows.map((r) => (
                    <div key={r.id}>
                      <div style={{ fontWeight: 600 }}>{studentFullLabel(r.student)}</div>
                      <ProgressPipeline p={r} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
