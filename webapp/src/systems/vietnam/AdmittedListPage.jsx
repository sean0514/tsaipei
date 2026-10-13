import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import Tag from '../../components/Tag';
import { ADMITTED_TAG } from '../../lib/tags';
import { ALLOWED_SOURCE_SUPPLIERS, studentFullLabel } from '../../lib/tsaipeiSourceFilter';
import { t } from '../../lib/i18n';

// 唯讀：改成顯示境外生實習系統（tsaipei_admittedList）的資料，只篩選學生
// 來源(國外供應商)是 ALLOWED_SOURCE_SUPPLIERS 這幾個的紀錄；這個分頁在
// 元凱系統不能新增/編輯/刪除，實際編輯請到境外生實習系統的「錄取名單」
// 頁面。
export default function AdmittedListPage() {
  const { lang } = useOutletContext();
  const { rows: admittedList, loading: loadingAdmitted } = useCollection('tsaipei_admittedList');
  const { rows: matches, loading: loadingMatches } = useCollection('tsaipei_matches');
  const { rows: students, loading: loadingStudents } = useCollection('tsaipei_students');
  const { rows: positions, loading: loadingPositions } = useCollection('tsaipei_positions');
  const loading = loadingAdmitted || loadingMatches || loadingStudents || loadingPositions;

  const rows = admittedList
    .filter((r) => !r.confirmedClosed)
    .map((r) => {
      const match = matches.find((m) => m.id === r.matchId);
      const student = match ? students.find((s) => s.id === match.studentId) : null;
      const position = match ? positions.find((p) => p.id === match.positionId) : null;
      return { ...r, student, position };
    })
    .filter((r) => ALLOWED_SOURCE_SUPPLIERS.includes(r.student?.sourceSupplier))
    .sort((a, b) => studentFullLabel(a.student).localeCompare(studentFullLabel(b.student)));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('錄取名單', lang)}</h2>
          <div className="page-desc">{t('資料來源：境外生實習系統，僅顯示學生來源(國外供應商)為阮氏芳草、阿草、阿草（鳳仙）的紀錄，唯讀顯示，編輯請到境外生實習系統操作', lang)}</div>
        </div>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>{t('學生', lang)}</th><th>{t('職缺', lang)}</th><th>{t('錄取日期', lang)}</th><th>{t('狀態', lang)}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{studentFullLabel(r.student)}</td>
                  <td>{r.position ? [r.position.projectCode, r.position.company].filter(Boolean).join(' ') : '—'}</td>
                  <td>{r.admitDate || '—'}</td>
                  <td><Tag value={r.status} map={ADMITTED_TAG} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="muted">{t('沒有資料', lang)}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
