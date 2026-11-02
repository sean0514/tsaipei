import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { serverTimestamp } from 'firebase/firestore';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { STAGE_KEYS } from './constants';

function copyLink(url) {
  navigator.clipboard?.writeText(url).then(
    () => alert(`已複製連結：\n${url}`),
    () => window.prompt('複製失敗，請手動複製以下連結：', url),
  );
}

function parseExperience(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// 履歷表連結：每位使用人員一條專屬的公開線上履歷填寫連結
// （/apply/laborAgency?ref=專員姓名，見 pages/LaborAgencyResumeApplyPage.jsx），
// 跟 vietnam 系統的 ResumeLinksPage.jsx 同一套模式。移工送出的履歷先列在
// 下方清單，確認資料後可以轉入「移工管理」（laborAgency_workers），轉入
// 後標記 workerId 避免重複轉入；完整的家庭/學歷/工作經歷資料只保留在
// 這份履歷紀錄裡，移工管理頁面維持原本精簡的欄位。
export default function ResumeLinksPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'resumeLinks', role, overrides);
  const canEditWorkers = computeCanEdit(system, 'workers', role, overrides);
  const { rows: staff, loading: loadingStaff } = useCollection('laborAgency_users');
  const { rows: submissions, loading: loadingSubmissions, update: updateSubmission, remove: removeSubmission } = useCollection('laborAgency_resumeSubmissions');
  const { add: addWorker } = useCollection('laborAgency_workers');
  const [q, setQ] = useState('');
  const [viewing, setViewing] = useState(null);

  function handleCopyLink(member) {
    const url = `${window.location.origin}/apply/laborAgency?ref=${encodeURIComponent(member.displayName || '')}`;
    copyLink(url);
  }

  async function handleConvertToWorker(sub) {
    if (sub.workerId) return;
    if (!window.confirm('確定要把這筆履歷轉入移工管理嗎？')) return;
    const workerData = {
      name: sub.chineseName || sub.vietnameseName || '',
      vietnameseName: sub.vietnameseName || '',
      chineseName: sub.chineseName || '',
      gender: sub.gender || '',
      province: sub.hometown || '',
      photoUrl: sub.photoUrl || '',
      note: sub.specialties || '',
      stage: STAGE_KEYS[0],
      updatedAt: Date.now(),
    };
    const workerDoc = await addWorker(workerData);
    await updateSubmission(sub.id, { workerId: workerDoc.id, processedAt: serverTimestamp() });
  }

  async function handleDeleteSubmission(sub) {
    if (!window.confirm('確定要刪除這筆履歷嗎？')) return;
    await removeSubmission(sub.id);
  }

  const query = q.trim().toLowerCase();
  const filteredSubmissions = [...submissions]
    .filter((s) => !query || `${s.chineseName || ''} ${s.vietnameseName || ''} ${s.assignedStaff || ''}`.toLowerCase().includes(query))
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>履歷表連結</h2>
          <div className="page-desc">每位使用人員都有一條專屬的線上履歷填寫連結，分享給移工填寫後會自動記錄是哪位專員負責；移工填寫格式比照「工廠移工人員履歷表」，可切換中文/越南文。履歷送出後先列在下方清單，確認資料後可以直接轉入「移工管理」。</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>各專員連結</h3>
        {loadingStaff ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>姓名</th><th>Email</th><th>角色</th><th></th></tr></thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id}>
                  <td>{member.displayName || '—'}</td>
                  <td>{member.email}</td>
                  <td>{member.role}</td>
                  <td><button onClick={() => handleCopyLink(member)}>複製履歷連結</button></td>
                </tr>
              ))}
              {staff.length === 0 && <tr><td colSpan={4} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="card">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>移工填寫的履歷</h3>
          <input placeholder="搜尋姓名或專員" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        </div>
        {loadingSubmissions ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead>
              <tr><th>中文姓名</th><th>越文姓名</th><th>性別</th><th>負責專員</th><th>提交時間</th><th>狀態</th><th></th></tr>
            </thead>
            <tbody>
              {filteredSubmissions.map((sub) => (
                <tr key={sub.id}>
                  <td>{sub.chineseName || '—'}</td>
                  <td>{sub.vietnameseName || '—'}</td>
                  <td>{sub.gender || '—'}</td>
                  <td>{sub.assignedStaff || '—'}</td>
                  <td>{sub.createdAt?.toDate?.().toLocaleString?.() || '—'}</td>
                  <td>{sub.workerId ? '已轉入' : '待處理'}</td>
                  <td className="row-actions">
                    <button onClick={() => setViewing(sub)}>查看詳情</button>
                    {canEditWorkers && !sub.workerId && <button className="primary" onClick={() => handleConvertToWorker(sub)}>轉入移工管理</button>}
                    {canEditPage && <button className="danger" onClick={() => handleDeleteSubmission(sub)}>刪除</button>}
                  </td>
                </tr>
              ))}
              {filteredSubmissions.length === 0 && <tr><td colSpan={7} className="muted">{query ? '沒有符合搜尋條件的紀錄。' : '目前沒有履歷。'}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>

      {viewing && <ViewingModal sub={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function ViewingModal({ sub, onClose }) {
  const domestic = parseExperience(sub.domesticExperience);
  const overseas = parseExperience(sub.overseasExperience);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: '100%' }}>
        <h3 style={{ marginTop: 0 }}>{sub.chineseName || sub.vietnameseName}</h3>
        {sub.photoUrl && <img src={sub.photoUrl} alt="" style={{ width: 120, height: 120, objectFit: 'cover', marginBottom: 12 }} />}
        <div className="form-grid">
          <div><strong>越文姓名：</strong>{sub.vietnameseName || '—'}</div>
          <div><strong>中文姓名：</strong>{sub.chineseName || '—'}</div>
          <div><strong>性別：</strong>{sub.gender || '—'}</div>
          <div><strong>地區：</strong>{sub.hometown || '—'}</div>
          <div><strong>出生日期：</strong>{sub.birthDate || '—'}</div>
          <div><strong>身高/體重：</strong>{sub.height || '—'} cm / {sub.weight || '—'} kg</div>
          <div><strong>視力：</strong>{sub.eyesight || '—'}</div>
          <div><strong>宗教：</strong>{sub.religion || '—'}</div>
          <div><strong>民族：</strong>{sub.ethnicity || '—'}</div>
          <div><strong>慣用手：</strong>{sub.dominantHand || '—'}</div>
          <div><strong>重大手術：</strong>{sub.majorSurgery || '—'}</div>
          <div><strong>婚姻狀況：</strong>{sub.maritalStatus || '—'}</div>
        </div>
        <h4>家庭狀況</h4>
        <div className="form-grid">
          <div><strong>父親：</strong>{sub.fatherName || '—'}（{sub.fatherAlive || '—'}／{sub.fatherAge || '—'}歲／{sub.fatherOccupation || '—'}）</div>
          <div><strong>母親：</strong>{sub.motherName || '—'}（{sub.motherAlive || '—'}／{sub.motherAge || '—'}歲／{sub.motherOccupation || '—'}）</div>
          <div><strong>配偶：</strong>{sub.spouseName || '—'}（{sub.spouseAge || '—'}歲／{sub.spouseOccupation || '—'}）</div>
          <div><strong>子女人數：</strong>{sub.childrenCount || '—'}</div>
          <div><strong>兄弟姐妹：</strong>{sub.siblingsCount || '—'}</div>
          <div><strong>家中排行：</strong>{sub.birthOrder || '—'}</div>
          <div><strong>在台親戚：</strong>{sub.relativesInTaiwan || '—'}{sub.relativesInTaiwan === '有' && `（${sub.relativesLocation || '—'}）`}</div>
        </div>
        <h4>學歷、語言</h4>
        <div className="form-grid">
          <div><strong>最高學歷：</strong>{sub.educationLevel || '—'}</div>
          <div><strong>中文程度：</strong>{sub.chineseLevel || '—'}</div>
          <div><strong>英文程度：</strong>{sub.englishLevel || '—'}</div>
        </div>
        <h4>國內工作經驗</h4>
        {domestic.length === 0 ? <p className="muted">—</p> : domestic.map((r, i) => (
          <p key={i} className="muted" style={{ margin: '4px 0' }}>{r.year}　{r.description}{r.reason ? `（離職原因：${r.reason}）` : ''}</p>
        ))}
        <h4>國外工作經驗</h4>
        {overseas.length === 0 ? <p className="muted">—</p> : overseas.map((r, i) => (
          <p key={i} className="muted" style={{ margin: '4px 0' }}>{r.year}　{r.description}{r.reason ? `（離職原因：${r.reason}）` : ''}</p>
        ))}
        <h4>專長</h4>
        <p className="muted">{sub.specialties || '—'}</p>
        <div><strong>負責專員：</strong>{sub.assignedStaff || '—'}</div>
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button onClick={onClose}>關閉</button>
        </div>
      </div>
    </div>
  );
}
