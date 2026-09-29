import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// 彙整各分頁按下「結案」後被隱藏的紀錄，依來源分頁分類，並提供「復原」
// 按鈕把 confirmedClosed 改回 false，讓那筆紀錄回到原本分頁的清單裡。只涵蓋
// 目前還沒有自己一套結案/完成機制的分頁（實習單位/住宿安排/在台簽證追蹤/
// 在台關懷紀錄/開戶進度追蹤都已經有各自的機制，不重複加這個按鈕）。
export default function ClosedCasesPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'closedCases', role, overrides);
  const { rows: students, loading: l1 } = useCollection('tsaipei_students');
  const { rows: matches, loading: l2 } = useCollection('tsaipei_matches');
  const { rows: secondInterviews, loading: l3 } = useCollection('tsaipei_secondInterviews');
  const { rows: admittedList, loading: l4 } = useCollection('tsaipei_admittedList');
  const { rows: applicationProgress, loading: l5 } = useCollection('tsaipei_applicationProgress');
  const { rows: dormitories, loading: l6 } = useCollection('tsaipei_dormitories');
  const { rows: positions } = useCollection('tsaipei_positions');
  const [q, setQ] = useState('');
  const loading = l1 || l2 || l3 || l4 || l5 || l6;

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

  // 每種來源各自解析「識別名稱」，統一成同一組資料結構，才能一起依來源分頁分組顯示。
  const closedItems = [
    ...students.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'tsaipei_students', sourceLabel: '學生資料', name: studentFullLabel(r),
    })),
    ...matches.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'tsaipei_matches', sourceLabel: '媒合紀錄',
      name: `${studentName(r.studentId)} · ${positionLabel(r.positionId)}`,
    })),
    ...secondInterviews.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'tsaipei_secondInterviews', sourceLabel: '二面進度', name: matchLabel(r.matchId),
    })),
    ...admittedList.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'tsaipei_admittedList', sourceLabel: '錄取名單', name: matchLabel(r.matchId),
    })),
    ...applicationProgress.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'tsaipei_applicationProgress', sourceLabel: '申辦進度追蹤', name: studentName(r.studentId),
    })),
    ...dormitories.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'tsaipei_dormitories', sourceLabel: '宿舍管理', name: r.name || '(未設定)',
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
          <h2>已結案名單</h2>
          <div className="page-desc">彙整各分頁按下「結案」的紀錄，依來源分頁分類{!canEditPage && '（唯讀）'}</div>
        </div>
      </div>
      <input placeholder="搜尋名稱或來源分頁" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        sourceLabels.length === 0 ? <p className="muted">目前沒有已結案的紀錄。</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {sourceLabels.map((label) => (
              <div className="card" key={label} style={{ overflowX: 'auto' }}>
                <h4 style={{ marginTop: 0 }}>{label} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[label].length} 筆</span></h4>
                <div className="table-wrap"><table>
                  <thead><tr><th>名稱</th>{canEditPage && <th></th>}</tr></thead>
                  <tbody>
                    {groups[label].map((item) => (
                      <tr key={`${item.collectionName}-${item.id}`}>
                        <td>{item.name}</td>
                        {canEditPage && (
                          <td className="row-actions">
                            <button onClick={() => handleRestore(item)}>復原</button>
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
