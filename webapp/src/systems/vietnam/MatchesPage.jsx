import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import Tag from '../../components/Tag';
import { MATCH_TAG } from '../../lib/tags';
import { ALLOWED_SOURCE_SUPPLIERS, studentFullLabel } from '../../lib/tsaipeiSourceFilter';
import { t } from '../../lib/i18n';

// 唯讀：改成顯示境外生實習系統（tsaipei_matches）的資料，只篩選學生來源
// (國外供應商) 是 ALLOWED_SOURCE_SUPPLIERS 這幾個的紀錄；這個分頁在元凱
// 系統不能新增/編輯/刪除，實際編輯請到境外生實習系統的「媒合紀錄」頁面。
export default function MatchesPage() {
  const { lang } = useOutletContext();
  const { rows: matches, loading: loadingMatches } = useCollection('tsaipei_matches');
  const { rows: students, loading: loadingStudents } = useCollection('tsaipei_students');
  const { rows: positions, loading: loadingPositions } = useCollection('tsaipei_positions');
  const loading = loadingMatches || loadingStudents || loadingPositions;

  const rows = matches
    .filter((m) => !m.confirmedClosed)
    .map((m) => ({ ...m, student: students.find((s) => s.id === m.studentId), position: positions.find((p) => p.id === m.positionId) }))
    .filter((m) => ALLOWED_SOURCE_SUPPLIERS.includes(m.student?.sourceSupplier))
    .sort((a, b) => studentFullLabel(a.student).localeCompare(studentFullLabel(b.student)));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('媒合紀錄', lang)}</h2>
          <div className="page-desc">{t('資料來源：境外生實習系統，僅顯示學生來源(國外供應商)為阮氏芳草、阿草、阿草（鳳仙）的紀錄，唯讀顯示，編輯請到境外生實習系統操作', lang)}</div>
        </div>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>{t('學生', lang)}</th><th>{t('職缺', lang)}</th><th>{t('實習場域', lang)}</th><th>{t('狀態', lang)}</th><th>{t('媒合日期', lang)}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{studentFullLabel(r.student)}</td>
                  <td>{r.position ? [r.position.projectCode, r.position.company].filter(Boolean).join(' ') : '—'}</td>
                  <td>{r.venue || '—'}</td>
                  <td><Tag value={r.status} map={MATCH_TAG} /></td>
                  <td>{r.matchDate || '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="muted">{t('沒有資料', lang)}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
