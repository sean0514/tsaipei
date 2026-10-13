import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { ALLOWED_SOURCE_SUPPLIERS, studentFullLabel, studentCompanyLabel, groupByLabel } from '../../lib/tsaipeiSourceFilter';
import { t } from '../../lib/i18n';

// 唯讀：改成顯示境外生實習系統（tsaipei_internshipDocs）的資料，只篩選
// 學生來源(國外供應商)是 ALLOWED_SOURCE_SUPPLIERS 這幾個的紀錄；這個分頁
// 在元凱系統不能新增/編輯/刪除，實際編輯請到境外生實習系統的「實習文件
// 追蹤」頁面。依客戶（學生所媒合的實習單位）分組顯示。
function submittedText(docs, lang) {
  const names = docs.filter((d) => d.status !== '未提供').map((d) => d.docType);
  return names.length ? names.join('、') : t('（尚未繳交）', lang);
}

export default function InternshipDocsPage() {
  const { lang } = useOutletContext();
  const { rows: docs, loading: loadingDocs } = useCollection('tsaipei_internshipDocs');
  const { rows: students, loading: loadingStudents } = useCollection('tsaipei_students');
  const { rows: matches, loading: loadingMatches } = useCollection('tsaipei_matches');
  const { rows: admittedList, loading: loadingAdmitted } = useCollection('tsaipei_admittedList');
  const { rows: positions, loading: loadingPositions } = useCollection('tsaipei_positions');
  const loading = loadingDocs || loadingStudents || loadingMatches || loadingAdmitted || loadingPositions;
  const ctx = { matches, admittedList, positions };

  const allowedStudentIds = new Set(students.filter((s) => ALLOWED_SOURCE_SUPPLIERS.includes(s.sourceSupplier)).map((s) => s.id));
  const byStudent = {};
  docs.filter((d) => allowedStudentIds.has(d.studentId)).forEach((d) => {
    (byStudent[d.studentId] ||= []).push(d);
  });
  const rows = Object.keys(byStudent)
    .map((studentId) => {
      const studentDocs = byStudent[studentId];
      const total = studentDocs.length;
      const collected = studentDocs.filter((d) => d.status !== '未提供').length;
      return { studentId, student: students.find((s) => s.id === studentId), docs: studentDocs, total, collected };
    })
    .sort((a, b) => studentFullLabel(a.student).localeCompare(studentFullLabel(b.student)));

  const groups = groupByLabel(rows, (r) => studentCompanyLabel(r.studentId, ctx));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('實習文件追蹤', lang)}</h2>
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
                  <thead><tr><th>{t('學生', lang)}</th><th>{t('已繳交文件', lang)}</th><th>{t('狀態', lang)}</th></tr></thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.studentId}>
                        <td style={{ fontWeight: 600 }}>{studentFullLabel(r.student)}</td>
                        <td>{submittedText(r.docs, lang)}</td>
                        <td><span className={`tag ${r.collected === r.total ? 'tag-green' : 'tag-amber'}`}>{r.collected}/{r.total}</span></td>
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
