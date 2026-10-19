import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { exportEntityCSV } from '../../lib/csv';
import { t } from '../../lib/i18n';

function studentFullLabel(s) {
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// 期望產業別存成 JSON 字串陣列(跟 StudentsPage.jsx 同一套存法)，舊資料如果
// 不是合法 JSON 就當作單一文字欄位處理，不會整欄消失。
function parseList(json) {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return arr;
  } catch { /* 不是 JSON，當作舊版單一文字欄位處理 */ }
  return [json];
}

function certSummary(s, lang) {
  if (s.hasCert === '有' || s.hasCert === '已考試未領取證照') {
    return `${s.hasCert}${s.certType ? `（${s.certType} ${s.certLevel || ''}）` : ''}`.trim();
  }
  if (s.hasCert === '無') return t('無', lang);
  return '—';
}

// 複製自 systems/tsaipei/UnmatchedStudentsPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。StudentsPage.jsx 的欄位改成比照「外國籍
// 學生基本資料表」後，department1/department2/startDate/phone 已經不是
// 學生資料的欄位了，改用現有的 department/predicted graduation；「國外
// 供應商」欄位拿掉，改顯示「是否有語文證照」。
export default function UnmatchedStudentsPage() {
  const { lang } = useOutletContext();
  const { rows: students, loading } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const [q, setQ] = useState('');

  const matchedStudentIds = new Set(matches.filter((m) => m.positionId).map((m) => m.studentId));
  const unmatched = students.filter((s) => !s.confirmedClosed && !matchedStudentIds.has(s.id));

  const searchQuery = q.trim().toLowerCase();
  const filtered = unmatched
    .filter((s) => !searchQuery || `${studentFullLabel(s)} ${s.school || ''} ${s.department || ''} ${s.nationality || ''}`.toLowerCase().includes(searchQuery))
    .sort((a, b) => studentFullLabel(a).localeCompare(studentFullLabel(b)));

  const groups = {};
  filtered.forEach((s) => {
    const key = s.nationality || '未填國籍';
    (groups[key] ||= []).push(s);
  });
  const groupKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  function handleDownload() {
    const rows = filtered.map((s) => ({
      name: studentFullLabel(s), gender: s.gender || '', nationality: s.nationality || '', hasCert: certSummary(s, lang), school: s.school || '', department: s.department || '',
      desiredIndustries: parseList(s.desiredIndustries).join('、'), status: s.status || '', expectedGraduation: s.expectedGraduation || '',
    }));
    exportEntityCSV(rows, [
      { key: 'name', label: '學生姓名' }, { key: 'gender', label: '性別' }, { key: 'nationality', label: '國籍' }, { key: 'hasCert', label: '是否有華語證照' },
      { key: 'school', label: '就讀學校' }, { key: 'department', label: '科系' }, { key: 'desiredIndustries', label: '期望產業別' },
      { key: 'status', label: '狀態' }, { key: 'expectedGraduation', label: '預計畢業時間' },
    ], '學生尚未安排');
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('學生尚未安排', lang)}</h2>
          <div className="page-desc">{t('自動列出目前在「媒合紀錄」裡還沒有任何一筆填上實際職缺的學生，依國籍分類顯示；一旦幫學生配對職缺，就會自動從這裡消失，不用手動維護', lang)}</div>
        </div>
        <div className="row-actions">
          <button onClick={handleDownload}>{t('下載名單', lang)}</button>
        </div>
      </div>
      <input placeholder={t('搜尋學生、學校、科系或國籍', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        groupKeys.length === 0 ? (
          <p className="muted">{searchQuery ? t('沒有符合搜尋條件的學生。', lang) : t('目前所有學生都已經安排媒合了。', lang)}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <p className="muted" style={{ margin: 0 }}>{t('共', lang)} {filtered.length} {t('位學生尚未安排，依國籍分類如下', lang)}</p>
            {groupKeys.map((key) => (
              <div className="card" key={key}>
                <h3 style={{ marginTop: 0 }}>{key} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[key].length} {t('位學生', lang)}</span></h3>
                <div className="table-wrap"><table>
                  <thead><tr><th>{t('學生姓名', lang)}</th><th>{t('性別', lang)}</th><th>{t('是否有華語證照', lang)}</th><th>{t('就讀學校', lang)}</th><th>{t('科系', lang)}</th><th>{t('期望產業別', lang)}</th><th>{t('狀態', lang)}</th><th>{t('預計畢業時間', lang)}</th></tr></thead>
                  <tbody>
                    {groups[key].map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>{studentFullLabel(s)}</td>
                        <td>{s.gender || '—'}</td>
                        <td>{certSummary(s, lang)}</td>
                        <td>{s.school || '—'}</td>
                        <td>{s.department || '—'}</td>
                        <td>{parseList(s.desiredIndustries).join('、') || '—'}</td>
                        <td>{s.status || '—'}</td>
                        <td>{s.expectedGraduation || '—'}</td>
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
