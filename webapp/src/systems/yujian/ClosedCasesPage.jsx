import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { workerLabel } from './WorkersPage';

// 彙整各分頁按下「已結案」後被隱藏的紀錄，依國外仲介分類，並提供「復原」
// 按鈕把 confirmedClosed 改回 false，讓那筆紀錄回到原本分頁的清單裡。
export default function ClosedCasesPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'closedCases', role, overrides);
  const { rows: workers, loading: l1 } = useCollection('yujian_workers');
  const { rows: employers, loading: l2 } = useCollection('yujian_employers');
  const { rows: matches, loading: l3 } = useCollection('yujian_matches');
  const { rows: secondInterviews, loading: l4 } = useCollection('yujian_secondInterviews');
  const { rows: admittedList, loading: l5 } = useCollection('yujian_admittedList');
  const { rows: applicationProgress, loading: l6 } = useCollection('yujian_applicationProgress');
  const { rows: arrivedList, loading: l7 } = useCollection('yujian_arrivedList');
  const [q, setQ] = useState('');
  const loading = l1 || l2 || l3 || l4 || l5 || l6 || l7;

  function workerName(id) {
    return workerLabel(workers.find((x) => x.id === id));
  }
  function employerName(id) {
    return employers.find((x) => x.id === id)?.employerName || '(未設定)';
  }
  function workerForMatch(matchId) {
    const m = matches.find((x) => x.id === matchId);
    return m ? workers.find((x) => x.id === m.workerId) : null;
  }
  function matchLabel(matchId) {
    const m = matches.find((x) => x.id === matchId);
    if (!m) return '(未設定)';
    return `${workerName(m.workerId)} · ${employerName(m.employerId)}`;
  }

  // 每種來源各自解析「識別名稱」與「國外仲介」，統一成同一組資料結構，
  // 才能一起依國外仲介分組顯示。
  const closedItems = [
    ...workers.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'yujian_workers', sourceLabel: '看護/家事人員資料',
      name: workerLabel(r), foreignAgency: r.foreignAgency,
    })),
    ...employers.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'yujian_employers', sourceLabel: '雇主家庭/需求單',
      name: r.employerName || '(未設定)', foreignAgency: '',
    })),
    ...matches.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'yujian_matches', sourceLabel: '媒合紀錄',
      name: `${workerName(r.workerId)} · ${employerName(r.employerId)}`, foreignAgency: workers.find((w) => w.id === r.workerId)?.foreignAgency,
    })),
    ...secondInterviews.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'yujian_secondInterviews', sourceLabel: '二面進度',
      name: matchLabel(r.matchId), foreignAgency: workerForMatch(r.matchId)?.foreignAgency,
    })),
    ...admittedList.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'yujian_admittedList', sourceLabel: '錄取名單',
      name: matchLabel(r.matchId), foreignAgency: workerForMatch(r.matchId)?.foreignAgency,
    })),
    ...applicationProgress.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'yujian_applicationProgress', sourceLabel: '申辦進度追蹤',
      name: `${r.employerName || '(未設定)'}${r.caseNo ? ` #${r.caseNo}` : ''}`, foreignAgency: r.foreignAgency,
    })),
    ...arrivedList.filter((r) => r.confirmedClosed).map((r) => ({
      id: r.id, collectionName: 'yujian_arrivedList', sourceLabel: '已入台名單',
      name: `${r.employerName || '(未設定)'}${r.caseNo ? ` #${r.caseNo}` : ''}`, foreignAgency: r.foreignAgency,
    })),
  ];

  const searchQuery = q.trim().toLowerCase();
  const filtered = closedItems.filter((r) => !searchQuery || `${r.name} ${r.sourceLabel}`.toLowerCase().includes(searchQuery));

  const groups = {};
  filtered.forEach((r) => {
    const agency = r.foreignAgency || '未指定國外仲介';
    (groups[agency] ||= []).push(r);
  });
  const agencyNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

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
          <div className="page-desc">彙整各分頁按下「已結案」的紀錄，依國外仲介分類{!canEditPage && '（唯讀）'}</div>
        </div>
      </div>
      <input placeholder="搜尋名稱或來源分頁" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        agencyNames.length === 0 ? <p className="muted">目前沒有已結案的紀錄。</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {agencyNames.map((agency) => (
              <div className="card" key={agency} style={{ overflowX: 'auto' }}>
                <h4 style={{ marginTop: 0 }}>{agency} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[agency].length} 筆</span></h4>
                <div className="table-wrap"><table>
                  <thead><tr><th>來源分頁</th><th>名稱</th>{canEditPage && <th></th>}</tr></thead>
                  <tbody>
                    {groups[agency].map((item) => (
                      <tr key={`${item.collectionName}-${item.id}`}>
                        <td>{item.sourceLabel}</td>
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
