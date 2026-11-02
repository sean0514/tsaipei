import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { serverTimestamp } from 'firebase/firestore';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';
import { STAGE_KEYS } from './constants';

function copyLink(url, lang) {
  navigator.clipboard?.writeText(url).then(
    () => alert(`${t('已複製連結：', lang)}\n${url}`),
    () => window.prompt(t('複製失敗，請手動複製以下連結：', lang), url),
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
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'resumeLinks', role, overrides);
  const canEditWorkers = computeCanEdit(system, 'workers', role, overrides);
  const { rows: staff, loading: loadingStaff } = useCollection('laborAgency_users');
  const { rows: submissions, loading: loadingSubmissions, update: updateSubmission, remove: removeSubmission } = useCollection('laborAgency_resumeSubmissions');
  const { add: addWorker } = useCollection('laborAgency_workers');
  const [q, setQ] = useState('');
  const [viewing, setViewing] = useState(null);

  function handleCopyLink(member) {
    const url = `${window.location.origin}/apply/laborAgency?ref=${encodeURIComponent(member.displayName || '')}`;
    copyLink(url, lang);
  }

  async function handleConvertToWorker(sub) {
    if (sub.workerId) return;
    if (!window.confirm(t('確定要把這筆履歷轉入移工管理嗎？', lang))) return;
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
    if (!window.confirm(t('確定要刪除這筆履歷嗎？', lang))) return;
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
          <h2>{t('履歷表連結', lang)}</h2>
          <div className="page-desc">{t('每位使用人員都有一條專屬的線上履歷填寫連結，分享給移工填寫後會自動記錄是哪位專員負責；移工填寫格式比照「工廠移工人員履歷表」，可切換中文/越南文。履歷送出後先列在下方清單，確認資料後可以直接轉入「移工管理」。', lang)}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('各專員連結', lang)}</h3>
        {loadingStaff ? <p className="muted">{t('載入中…', lang)}</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>{t('姓名', lang)}</th><th>Email</th><th>{t('角色', lang)}</th><th></th></tr></thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id}>
                  <td>{member.displayName || '—'}</td>
                  <td>{member.email}</td>
                  <td>{member.role}</td>
                  <td><button onClick={() => handleCopyLink(member)}>{t('複製履歷連結', lang)}</button></td>
                </tr>
              ))}
              {staff.length === 0 && <tr><td colSpan={4} className="muted">{t('沒有資料', lang)}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="card">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{t('移工填寫的履歷', lang)}</h3>
          <input placeholder={t('搜尋姓名或專員', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        </div>
        {loadingSubmissions ? <p className="muted">{t('載入中…', lang)}</p> : (
          <div className="table-wrap"><table>
            <thead>
              <tr><th>{t('中文姓名', lang)}</th><th>{t('越文姓名', lang)}</th><th>{t('性別', lang)}</th><th>{t('負責專員', lang)}</th><th>{t('提交時間', lang)}</th><th>{t('狀態', lang)}</th><th></th></tr>
            </thead>
            <tbody>
              {filteredSubmissions.map((sub) => (
                <tr key={sub.id}>
                  <td>{sub.chineseName || '—'}</td>
                  <td>{sub.vietnameseName || '—'}</td>
                  <td>{t(sub.gender, lang) || '—'}</td>
                  <td>{sub.assignedStaff || '—'}</td>
                  <td>{sub.createdAt?.toDate?.().toLocaleString?.() || '—'}</td>
                  <td>{sub.workerId ? t('已轉入', lang) : t('待處理', lang)}</td>
                  <td className="row-actions">
                    <button onClick={() => setViewing(sub)}>{t('查看詳情', lang)}</button>
                    {canEditWorkers && !sub.workerId && <button className="primary" onClick={() => handleConvertToWorker(sub)}>{t('轉入移工管理', lang)}</button>}
                    {canEditPage && <button className="danger" onClick={() => handleDeleteSubmission(sub)}>{t('刪除', lang)}</button>}
                  </td>
                </tr>
              ))}
              {filteredSubmissions.length === 0 && <tr><td colSpan={7} className="muted">{query ? t('沒有符合搜尋條件的紀錄。', lang) : t('目前沒有履歷。', lang)}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>

      {viewing && <ViewingModal sub={viewing} onClose={() => setViewing(null)} lang={lang} />}
    </div>
  );
}

function ViewingModal({ sub, onClose, lang }) {
  const domestic = parseExperience(sub.domesticExperience);
  const overseas = parseExperience(sub.overseasExperience);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: '100%' }}>
        <h3 style={{ marginTop: 0 }}>{sub.chineseName || sub.vietnameseName}</h3>
        {sub.photoUrl && <img src={sub.photoUrl} alt="" style={{ width: 120, height: 120, objectFit: 'cover', marginBottom: 12 }} />}
        <div className="form-grid">
          <div><strong>{t('越文姓名', lang)}：</strong>{sub.vietnameseName || '—'}</div>
          <div><strong>{t('中文姓名', lang)}：</strong>{sub.chineseName || '—'}</div>
          <div><strong>{t('性別', lang)}：</strong>{t(sub.gender, lang) || '—'}</div>
          <div><strong>{t('地區', lang)}：</strong>{sub.hometown || '—'}</div>
          <div><strong>{t('出生日期', lang)}：</strong>{sub.birthDate || '—'}</div>
          <div><strong>{t('身高/體重', lang)}：</strong>{sub.height || '—'} cm / {sub.weight || '—'} kg</div>
          <div><strong>{t('視力', lang)}：</strong>{sub.eyesight || '—'}</div>
          <div><strong>{t('宗教', lang)}：</strong>{sub.religion || '—'}</div>
          <div><strong>{t('民族', lang)}：</strong>{sub.ethnicity || '—'}</div>
          <div><strong>{t('慣用手', lang)}：</strong>{sub.dominantHand || '—'}</div>
          <div><strong>{t('重大手術', lang)}：</strong>{sub.majorSurgery || '—'}</div>
          <div><strong>{t('是否有刺青', lang)}：</strong>{sub.hasTattoo || '—'}</div>
        </div>
        {sub.tattooPhotoUrl && (
          <div style={{ marginBottom: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{t('刺青照片', lang)}</div>
            <img src={sub.tattooPhotoUrl} alt="" style={{ width: 160, maxHeight: 160, objectFit: 'cover' }} />
          </div>
        )}
        <h4>{t('家庭狀況', lang)}</h4>
        <div className="form-grid">
          <div><strong>{t('結婚狀況', lang)}：</strong>{sub.maritalStatus || '—'}</div>
          <div><strong>{t('父親', lang)}：</strong>{sub.fatherName || '—'}（{sub.fatherAlive || '—'}／{sub.fatherAge || '—'}{t('歲', lang)}／{sub.fatherOccupation || '—'}）</div>
          <div><strong>{t('母親', lang)}：</strong>{sub.motherName || '—'}（{sub.motherAlive || '—'}／{sub.motherAge || '—'}{t('歲', lang)}／{sub.motherOccupation || '—'}）</div>
          <div><strong>{t('配偶', lang)}：</strong>{sub.spouseName || '—'}（{sub.spouseAge || '—'}{t('歲', lang)}／{sub.spouseOccupation || '—'}）</div>
          <div><strong>{t('子女人數', lang)}：</strong>{sub.childrenCount || '—'}</div>
          <div><strong>{t('兄弟姐妹', lang)}：</strong>{sub.siblingsCount || '—'}</div>
          <div><strong>{t('家中排行', lang)}：</strong>{sub.birthOrder || '—'}</div>
          <div><strong>{t('在台親戚', lang)}：</strong>{t(sub.relativesInTaiwan, lang) || '—'}{sub.relativesInTaiwan === '有' && `（${sub.relativesLocation || '—'}）`}</div>
        </div>
        <h4>{t('學歷、語言', lang)}</h4>
        <div className="form-grid">
          <div><strong>{t('最高學歷', lang)}：</strong>{sub.educationLevel || '—'}</div>
          <div><strong>{t('中文程度', lang)}：</strong>{sub.chineseLevel || '—'}</div>
          <div><strong>{t('英文程度', lang)}：</strong>{sub.englishLevel || '—'}</div>
        </div>
        <h4>{t('國內工作經驗', lang)}</h4>
        {domestic.length === 0 ? <p className="muted">—</p> : domestic.map((r, i) => (
          <p key={i} className="muted" style={{ margin: '4px 0' }}>{r.year}　{r.description}{r.reason ? `（${t('離職原因：', lang)}${r.reason}）` : ''}</p>
        ))}
        <h4>{t('國外工作經驗', lang)}</h4>
        {overseas.length === 0 ? <p className="muted">—</p> : overseas.map((r, i) => (
          <p key={i} className="muted" style={{ margin: '4px 0' }}>{r.year}　{r.description}{r.reason ? `（${t('離職原因：', lang)}${r.reason}）` : ''}</p>
        ))}
        <h4>{t('專長', lang)}</h4>
        <p className="muted">{sub.specialties || '—'}</p>
        <div><strong>{t('負責專員', lang)}：</strong>{sub.assignedStaff || '—'}</div>
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button onClick={onClose}>{t('關閉', lang)}</button>
        </div>
      </div>
    </div>
  );
}
