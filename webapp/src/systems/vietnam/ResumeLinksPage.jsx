import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { serverTimestamp } from 'firebase/firestore';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';
import { createSyncedTsaipeiStudent } from '../../lib/vietnamTsaipeiStudentSync';

const CERT_TYPE_LABEL = { TOCFL: '華語文能力測驗 TOCFL', TOEIC: '英文多益測驗 TOEIC' };

function copyLink(url) {
  navigator.clipboard?.writeText(url).then(
    () => alert(`已複製連結：\n${url}`),
    () => window.prompt('複製失敗，請手動複製以下連結：', url),
  );
}

// 履歷表連結：每個使用人員一條專屬的公開線上履歷填寫連結
// （/apply/vietnam?ref=專員姓名，見 pages/VietnamResumeApplyPage.jsx），
// 跟 UsersPage.jsx 裡 dispatch 系統「複製履歷連結」同樣的模式；下方列出
// 學生送出的履歷，可以直接轉入「學生資料」（vietnam_students），轉入後
// 標記 processed 避免重複轉入。
export default function ResumeLinksPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'resumeLinks', role, overrides);
  const canEditStudents = computeCanEdit(system, 'students', role, overrides);
  const { rows: staff, loading: loadingStaff } = useCollection('vietnam_users');
  const { rows: submissions, loading: loadingSubmissions, update: updateSubmission, remove: removeSubmission } = useCollection('vietnam_resumeSubmissions');
  const { add: addStudent, update: updateStudent } = useCollection('vietnam_students');
  const [q, setQ] = useState('');
  const [viewing, setViewing] = useState(null);

  function handleCopyLink(member) {
    const url = `${window.location.origin}/apply/vietnam?ref=${encodeURIComponent(member.displayName || '')}`;
    copyLink(url);
  }

  // 學生資料（StudentsPage.jsx）的欄位已經改成比照履歷表製作，這裡逐欄位
  // 直接對應轉入，不用再塞進備註欄位。轉入後同步建立一筆對應的境外生
  // 實習系統學生資料，跟 StudentsPage.jsx 自己新增學生時的同步邏輯共用
  // lib/vietnamTsaipeiStudentSync.js，避免兩個入口各自維護一份、漏改。
  async function handleConvertToStudent(sub) {
    if (sub.studentId) return;
    if (!window.confirm(t('確定要把這筆履歷轉入學生資料嗎？', lang))) return;
    const studentData = {
      originalName: sub.originalName || '',
      chineseName: sub.chineseName || '',
      vietnameseName: sub.vietnameseName || '',
      photoUrl: sub.photoUrl || '',
      hasPassport: sub.hasPassport || '',
      passportNumber: sub.hasPassport === 'Yes' ? (sub.passportId || '') : '',
      passportPhotoUrl: sub.passportPhotoUrl || '',
      gender: sub.gender || '',
      birthDate: sub.birthDate || '',
      nationality: sub.nationality || '',
      height: sub.height || '',
      weight: sub.weight || '',
      school: sub.school || '',
      enrollDate: sub.enrollDate || '',
      programYears: sub.programYears || '',
      department: sub.department || '',
      expectedGraduation: sub.expectedGraduation || '',
      hasCert: sub.hasCert || '',
      certType: sub.certType || '',
      certLevel: sub.certLevel || '',
      certPickupDate: sub.certPickupDate || '',
      expectedExamDate: sub.expectedExamDate || '',
      workExperience: sub.personalExperience || '',
      sourceSupplier: sub.assignedStaff || '',
      status: '媒合中',
      createdAt: serverTimestamp(),
    };
    const studentDoc = await addStudent(studentData);
    const tsaipeiStudentId = await createSyncedTsaipeiStudent(studentDoc.id, studentData);
    await updateSubmission(sub.id, { studentId: studentDoc.id, processedAt: serverTimestamp() });
    await updateStudent(studentDoc.id, { syncedTsaipeiStudentId: tsaipeiStudentId });
  }

  async function handleDeleteSubmission(sub) {
    if (!window.confirm(t('確定要刪除這筆履歷嗎？', lang))) return;
    await removeSubmission(sub.id);
  }

  const query = q.trim().toLowerCase();
  const filteredSubmissions = [...submissions]
    .filter((s) => !query || `${s.chineseName || ''} ${s.vietnameseName || ''} ${s.originalName || ''} ${s.assignedStaff || ''}`.toLowerCase().includes(query))
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('履歷表連結', lang)}</h2>
          <div className="page-desc">{t('每位使用人員都有一條專屬的線上履歷填寫連結，分享給學生填寫後會自動記錄是哪位專員負責；學生填寫格式比照「外國籍學生基本資料表」。履歷送出後會先列在下方清單，確認資料後可以直接轉入「學生資料」。', lang)}</div>
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
          <h3 style={{ margin: 0 }}>{t('學生填寫的履歷', lang)}</h3>
          <input placeholder={t('搜尋姓名或專員', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        </div>
        {loadingSubmissions ? <p className="muted">{t('載入中…', lang)}</p> : (
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>{t('中文姓名', lang)}</th><th>{t('越南姓名', lang)}</th><th>{t('英文姓名', lang)}</th><th>{t('性別', lang)}</th><th>{t('國籍', lang)}</th>
                <th>{t('負責專員', lang)}</th><th>{t('提交時間', lang)}</th><th>{t('狀態', lang)}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filteredSubmissions.map((sub) => (
                <tr key={sub.id}>
                  <td>{sub.chineseName || '—'}</td>
                  <td>{sub.vietnameseName || '—'}</td>
                  <td>{sub.originalName || '—'}</td>
                  <td>{sub.gender || '—'}</td>
                  <td>{sub.nationality || '—'}</td>
                  <td>{sub.assignedStaff || '—'}</td>
                  <td>{sub.createdAt?.toDate?.().toLocaleString?.() || '—'}</td>
                  <td>{sub.studentId ? t('已轉入', lang) : t('待處理', lang)}</td>
                  <td className="row-actions">
                    <button onClick={() => setViewing(sub)}>{t('查看詳情', lang)}</button>
                    {canEditStudents && !sub.studentId && (
                      <button className="primary" onClick={() => handleConvertToStudent(sub)}>{t('轉入學生資料', lang)}</button>
                    )}
                    {canEditPage && <button className="danger" onClick={() => handleDeleteSubmission(sub)}>{t('刪除', lang)}</button>}
                  </td>
                </tr>
              ))}
              {filteredSubmissions.length === 0 && <tr><td colSpan={9} className="muted">{query ? t('沒有符合搜尋條件的紀錄。', lang) : t('目前沒有履歷。', lang)}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>

      {viewing && (
        <div className="modal-backdrop" onClick={() => setViewing(null)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: '100%' }}>
            <h3 style={{ marginTop: 0 }}>{viewing.chineseName || viewing.vietnameseName || viewing.originalName}</h3>
            <div className="row-actions" style={{ marginBottom: 12 }}>
              {viewing.photoUrl && <img src={viewing.photoUrl} alt="" style={{ width: 120, height: 120, objectFit: 'cover' }} />}
              {viewing.passportPhotoUrl && <img src={viewing.passportPhotoUrl} alt="" style={{ width: 120, height: 120, objectFit: 'cover' }} />}
            </div>
            <div className="form-grid">
              <div><strong>{t('英文姓名', lang)}：</strong>{viewing.originalName || '—'}</div>
              <div><strong>{t('中文姓名', lang)}：</strong>{viewing.chineseName || '—'}</div>
              <div><strong>{t('越南姓名', lang)}：</strong>{viewing.vietnameseName || '—'}</div>
              <div><strong>{t('是否有護照', lang)}：</strong>{viewing.hasPassport || '—'}{viewing.hasPassport === 'Yes' && ` (ID: ${viewing.passportId || '—'})`}</div>
              <div><strong>{t('性別', lang)}：</strong>{viewing.gender || '—'}</div>
              <div><strong>{t('出生日期', lang)}：</strong>{viewing.birthDate || '—'}</div>
              <div><strong>{t('國籍', lang)}：</strong>{viewing.nationality || '—'}</div>
              <div><strong>{t('身高/體重', lang)}：</strong>{viewing.height || '—'} cm / {viewing.weight || '—'} kg</div>
              <div><strong>{t('就讀學校', lang)}：</strong>{viewing.school || '—'}</div>
              <div><strong>{t('入學日期', lang)}：</strong>{viewing.enrollDate || '—'}</div>
              <div><strong>{t('學制（年）', lang)}：</strong>{viewing.programYears || '—'}</div>
              <div><strong>{t('科系', lang)}：</strong>{viewing.department || '—'}</div>
              <div><strong>{t('預計畢業時間', lang)}：</strong>{viewing.expectedGraduation || '—'}</div>
              <div><strong>{t('華語證照', lang)}：</strong>
                {viewing.hasCert === '有' || viewing.hasCert === '已考試未領取證照'
                  ? `${viewing.hasCert}${CERT_TYPE_LABEL[viewing.certType] ? `（${CERT_TYPE_LABEL[viewing.certType]} ${viewing.certLevel || ''}）` : ''}`.trim()
                  : t('無', lang)}
              </div>
              {viewing.hasCert === '已考試未領取證照' && <div><strong>{t('證照領取日期', lang)}：</strong>{viewing.certPickupDate || '—'}</div>}
              {viewing.hasCert === '無' && <div><strong>{t('預計考試日期', lang)}：</strong>{viewing.expectedExamDate || '—'}</div>}
              <div style={{ gridColumn: '1 / -1' }}><strong>{t('工作經驗', lang)}：</strong>{viewing.personalExperience || '—'}</div>
              <div><strong>{t('負責專員', lang)}：</strong>{viewing.assignedStaff || '—'}</div>
            </div>
            <div className="row-actions" style={{ marginTop: 16 }}>
              <button onClick={() => setViewing(null)}>{t('關閉', lang)}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
