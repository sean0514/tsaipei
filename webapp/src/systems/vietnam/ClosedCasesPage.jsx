import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// 複製自 systems/tsaipei/ClosedCasesPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function ClosedCasesPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'closedCases', role, overrides);
  const { rows: students, loading: l1 } = useCollection('vietnam_students');
  const { rows: matches, loading: l2 } = useCollection('vietnam_matches');
  const { rows: secondInterviews, loading: l3 } = useCollection('vietnam_secondInterviews');
  const { rows: admittedList, loading: l4 } = useCollection('vietnam_admittedList');
  const { rows: applicationProgress, loading: l5 } = useCollection('vietnam_applicationProgress');
  const { rows: dormitories, loading: l6 } = useCollection('vietnam_dormitories');
  const { rows: dailyExpenseApplications, loading: l7 } = useCollection('vietnam_dailyExpenseApplications');
  const { rows: positions } = useCollection('vietnam_positions');
  const [q, setQ] = useState('');
  const loading = l1 || l2 || l3 || l4 || l5 || l6 || l7;

  function studentName(id) {
    return studentFullLabel(students.find((x) => x.id === id));
  }
  function positionLabel(id) {
    const p = positions.find((x) => x.id === id);
    return p ? `${p.projectCode} ${p.company}` : '(未設定)';
  }
  function matchLabel(matchId) {
    const m = matches.find((x) => x.id === matchId);
    if (!m) return '(未設定)';
    return `${studentName(m.studentId)} · ${positionLabel(m.positionId)}`;
  }

  const closedItems = [
    ...students.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'vietnam_students', sourceLabel: '學生資料', name: studentFullLabel(r),
    })),
    ...matches.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'vietnam_matches', sourceLabel: '媒合紀錄',
      name: `${studentName(r.studentId)} · ${positionLabel(r.positionId)}`,
    })),
    ...secondInterviews.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'vietnam_secondInterviews', sourceLabel: '二面進度', name: matchLabel(r.matchId),
    })),
    ...admittedList.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'vietnam_admittedList', sourceLabel: '錄取名單', name: matchLabel(r.matchId),
    })),
    ...applicationProgress.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'vietnam_applicationProgress', sourceLabel: '申辦進度追蹤', name: studentName(r.studentId),
    })),
    ...dormitories.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'vietnam_dormitories', sourceLabel: '宿舍管理', name: r.name || '(未設定)',
    })),
    ...dailyExpenseApplications.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'vietnam_dailyExpenseApplications', sourceLabel: '日常支出申請',
      name: `${r.applicant || studentName(r.studentId) || '(未填申請人)'} · ${r.item || '(未填項目)'}${r.amount ? ` · ${r.currency || '台幣'} ${Number(r.amount).toLocaleString()}` : ''}`,
    })),
  ];

  const searchQuery = q.trim().toLowerCase();
  const filtered = closedItems.filter((r) => !searchQuery || `${r.name} ${r.sourceLabel}`.toLowerCase().includes(searchQuery));

  const groups = {};
  filtered.forEach((r) => { (groups[r.sourceLabel] ||= []).push(r); });
  const sourceLabels = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  async function handleRestore(item) {
    try {
      await updateDoc(doc(db, item.collectionName, item.id), { confirmedClosed: false });
    } catch (err) {
      alert(`復原失敗：${err.message || err}`);
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('已結案名單', lang)}</h2>
          <div className="page-desc">{t('彙整各分頁按下「結案」的紀錄，依來源分頁分類', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
      </div>
      <input placeholder={t('搜尋名稱或來源分頁', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        sourceLabels.length === 0 ? <p className="muted">{t('目前沒有已結案的紀錄。', lang)}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {sourceLabels.map((label) => (
              <div className="card" key={label} style={{ overflowX: 'auto' }}>
                <h4 style={{ marginTop: 0 }}>{t(label, lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[label].length} {t('筆', lang)}</span></h4>
                <div className="table-wrap"><table>
                  <thead><tr><th>{t('名稱', lang)}</th>{canEditPage && <th></th>}</tr></thead>
                  <tbody>
                    {groups[label].map((item) => (
                      <tr key={`${item.collectionName}-${item.id}`}>
                        <td>{item.name}</td>
                        {canEditPage && (
                          <td className="row-actions">
                            <button onClick={() => handleRestore(item)}>{t('復原', lang)}</button>
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
    </div>
  );
}
