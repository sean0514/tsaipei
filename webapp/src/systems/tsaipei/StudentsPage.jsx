import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, deleteDoc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import Tag from '../../components/Tag';
import { STUDENT_TAG } from '../../lib/tags';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { backfillBirthDatesFromVietnam } from '../../lib/vietnamTsaipeiStudentSync';

// Ported 1:1 from apps-script/Index.html STUDENT_STATUS.
const STUDENT_STATUS = ['媒合中', '待面試', '已面試', '送審中', '補件中', '企業用印', '收到函文', '辦理簽證中', '已入台實習', '已完成', '取消'];

// 年齡用年份直接相減估算（現在年份－出生年份），不是精確到生日當天的
// 歲數，簡化計算、符合這裡只是列表上快速參考的用途。
function ageFromBirthDate(birthDate) {
  if (!birthDate) return null;
  const birthYear = parseInt(birthDate.slice(0, 4), 10);
  if (!birthYear) return null;
  return new Date().getFullYear() - birthYear;
}

// 期望產業別存成 JSON 字串陣列（跟越南系統 StudentsPage.jsx 同一套存法），
// 這裡用逗號分隔的文字輸入框編輯，存檔時再轉回 JSON 陣列；不是合法 JSON
// 就當成一個項目處理。
function parseList(json) {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return arr;
  } catch { /* 不是 JSON，當作舊版單一文字欄位處理 */ }
  return [json];
}

// Full schema ported from apps-script/Code.gs SHEET_FIELDS.Students.
const FIELDS = [
  { key: 'chineseName', label: '中文姓名' },
  { key: 'originalName', label: '原始姓名(護照名稱)' },
  { key: 'school', label: '就讀學校' },
  { key: 'department1', label: '系所1' },
  { key: 'department2', label: '系所2' },
  { key: 'nationality', label: '國籍', options: ['', '越南', '印尼', '泰國', '菲律賓', '台灣'] },
  { key: 'gender', label: '性別', options: ['', '男', '女'] },
  { key: 'birthDate', label: '出生日期', type: 'date' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: '電話' },
  { key: 'startDate', label: '實習開始日', type: 'date' },
  { key: 'endDate', label: '實習結束日', type: 'date' },
  { key: 'langProofType', label: '語言能力證明類別', options: ['', '華語', '多益', '雅思'] },
  { key: 'langProofLevel', label: '語言能力證明等級', options: ['', 'A1', 'A2', 'B1'] },
  { key: 'langProofStatus', label: '語言能力證明狀態', options: ['未收到', '已收到'] },
  { key: 'enrollStart', label: '在學證明_入學年月' },
  { key: 'enrollEnd', label: '在學證明_畢業年月' },
  { key: 'enrollProofStatus', label: '在學證明狀態', options: ['未收到', '已收到'] },
  { key: 'passportCopy', label: '護照影本', options: ['未收到', '已收到'] },
  { key: 'passportNumber', label: '護照號碼' },
  { key: 'otherDocs', label: '其他文件' },
  { key: 'extensionNeeded', label: '是否延畢', options: ['無', '有'] },
  { key: 'extensionProof', label: '延畢證明（須載明實習結束後返國辦理畢業手續）', options: ['未收到', '已收到'] },
  { key: 'nightInternshipDoc', label: '夜間實習同意書', options: ['未收到', '已收到', '不適用'] },
  { key: 'firstEntryDate', label: '第一次入境日期', type: 'date' },
  { key: 'firstExitDate', label: '第一次離境日期', type: 'date' },
  { key: 'secondEntryDate', label: '第二次入境日期', type: 'date' },
  { key: 'secondExitDate', label: '第二次離境日期', type: 'date' },
  // 以下兩個欄位主要是元凱（越南系統）同步新增學生時帶過來的（見
  // lib/vietnamTsaipeiStudentSync.js），tsaipei 自己新增的學生這兩欄預設
  // 是空的，要填也可以直接在這裡編輯。
  { key: 'hasCert', label: '是否有華語證照(元凱同步)', options: ['', '有', '已考試未領取證照', '無'] },
  { key: 'desiredIndustries', label: '期望產業別(元凱同步)', type: 'tags' },
  { key: 'status', label: '狀態' },
  { key: 'notes', label: '備註' },
  { key: 'sourceSupplier', label: '學生來源(國外供應商)' },
];
// age 是依 birthDate 自動算出來存回去的衍生欄位（見 StudentsPage 裡的
// useEffect），不放進 FIELDS（編輯表單不需要手動填），只額外補進下載
// 用的 CSV_FIELDS，讓下載完整資料、CSV 匯出也能帶到年齡。
const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'age', label: '年齡' }, { key: 'confirmedClosed', label: '結案' }];

// 舊資料（Excel 遷移進來的、CSV 匯入覆蓋的）沒有 createdAt，顯示「—」，
// 不是程式漏存。
function formatCreatedAt(r) {
  const d = r.createdAt?.toDate?.();
  if (!d) return '—';
  return d.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

// 系統來源：純粹依 syncedFromVietnamId 這個既有欄位（元凱/越南系統同步
// 新增學生時，見 lib/vietnamTsaipeiStudentSync.js 的 createSyncedTsaipeiStudent
// 自動帶上）自動判別，不是另外存一個新欄位、也不能手動編輯——跟
// PositionBenefitsPage.jsx 的「來源系統」概念一致，只是那邊是整頁資料
// 分兩個 collection 來源，這裡是同一個 collection 裡依欄位判斷。
function systemSourceLabel(student) {
  return student.syncedFromVietnamId ? '越南實習生系統' : '境外生實習系統';
}

// Ported from docChecklist/docSummary in apps-script/Index.html — 5-item
// checklist of document fields stored directly on the student record.
function docSummary(s) {
  const list = [
    s.langProofStatus === '已收到',
    s.enrollProofStatus === '已收到',
    s.passportCopy === '已收到',
    s.extensionNeeded === '無' || s.extensionProof === '已收到',
    s.nightInternshipDoc === '已收到' || s.nightInternshipDoc === '不適用',
  ];
  const done = list.filter(Boolean).length;
  return { done, total: list.length, complete: done === list.length };
}

export default function StudentsPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'students', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_students');
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {...} = editing
  const [q, setQ] = useState('');

  // 年齡不只是列表上現場算一次顯示，也存回 Firestore 的 age 欄位，讓下載
  // 完整資料／CSV 匯出能帶到；不用排程，每次打開這個頁面、資料載入時就
  // 比對一次，跟目前算出來的值不同就補寫回去（例如跨年後第一次打開），
  // 算出來相同就不寫，不會一直重複觸發。
  useEffect(() => {
    if (!canEditPage) return;
    rows.forEach((r) => {
      const computed = ageFromBirthDate(r.birthDate);
      if (computed !== null && r.age !== computed) update(r.id, { age: computed });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, canEditPage]);

  // 補跑：出生日期同步到越南系統同步欄位這件事是後來才補上的（見
  // lib/vietnamTsaipeiStudentSync.js 的 tsaipeiStudentFields），在那之前
  // 就已經從越南系統同步過來的學生，這裡 birthDate 一直是空的——每次打開
  // 這個頁面，對「有 syncedFromVietnamId 但 birthDate 還空著」的學生主動
  // 補跑一次，從越南系統對應的學生資料把出生日期帶過來；已經有值的學生
  // 不會被覆蓋。
  useEffect(() => {
    if (!canEditPage) return;
    const missing = rows
      .filter((r) => !r.birthDate && r.syncedFromVietnamId)
      .map((r) => ({ id: r.id, syncedFromVietnamId: r.syncedFromVietnamId }));
    if (missing.length) backfillBirthDatesFromVietnam(missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, canEditPage]);

  // 依使用者要求：新增的學生排在最上面。既有（遷移進來、沒有 createdAt）的
  // 學生沒有時間戳記可比較，維持原本用中文姓名排序；新增的學生一律浮到最上面。
  const sorted = [...rows].sort((a, b) => {
    const at = a.createdAt?.toMillis?.() ?? 0;
    const bt = b.createdAt?.toMillis?.() ?? 0;
    if (at !== bt) return bt - at;
    return (a.chineseName || '').localeCompare(b.chineseName || '');
  });
  // 按過「結案」的紀錄從清單消失（資料還在，下載完整資料時仍會包含，也可以
  // 到「已結案名單」頁面按「復原」把它找回來）。
  const filtered = sorted
    .filter((r) => !r.confirmedClosed)
    .filter((r) => !q || [r.chineseName, r.originalName, r.school, r.nationality].some((v) => v?.includes(q)));
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_students', CSV_FIELDS, { entityLabel: '學生資料', canEdit: canEditPage });

  // 新增學生存檔後自動在「媒合紀錄」建立一筆「媒合中」的空白紀錄（職缺待補），
  // 沿用原本 Apps Script 版的行為。
  async function handleSave(data) {
    try {
      if (data.id) {
        const { id, ...rest } = data;
        await update(id, rest);
      } else {
        const ref = await add({ ...data, createdAt: serverTimestamp() });
        await addDoc(collection(db, 'tsaipei_matches'), {
          studentId: ref.id, positionId: '', status: '媒合中', matchDate: '', notes: '（系統依學生建檔自動建立）', createdAt: serverTimestamp(),
        });
      }
      setEditing(null);
    } catch (err) {
      alert(`存檔失敗：${err.message || err}`);
    }
  }

  // Ported from deleteStudent() in apps-script/Code.gs: cascade-delete every
  // record that references this student before removing the student itself.
  async function handleDelete(studentId) {
    if (!window.confirm('確定要刪除這位學生嗎？')) return;
    try {
      const matchesSnap = await getDocs(query(collection(db, 'tsaipei_matches'), where('studentId', '==', studentId)));
      const matchIds = matchesSnap.docs.map((d) => d.id);
      const dependentSnaps = await Promise.all([
        matchIds.length ? getDocs(query(collection(db, 'tsaipei_secondInterviews'), where('matchId', 'in', matchIds.slice(0, 30)))) : null,
        matchIds.length ? getDocs(query(collection(db, 'tsaipei_admittedList'), where('matchId', 'in', matchIds.slice(0, 30)))) : null,
        getDocs(query(collection(db, 'tsaipei_internshipDocs'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'tsaipei_applicationProgress'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'tsaipei_housingRecords'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'tsaipei_inTaiwanVisa'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'tsaipei_inTaiwanCare'), where('studentId', '==', studentId))),
      ]);
      const refs = [
        ...matchesSnap.docs.map((d) => d.ref),
        ...dependentSnaps.flatMap((snap) => (snap ? snap.docs.map((d) => d.ref) : [])),
      ];
      for (let i = 0; i < refs.length; i += 450) {
        const batch = writeBatch(db);
        refs.slice(i, i + 450).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
      await remove(studentId);
    } catch (err) {
      alert(`刪除失敗：${err.message || err}`);
    }
  }

  // 結案時同步把跟這個學生相關、同樣用「結案」機制隱藏列表的其他分頁紀錄
  // 一起標記結案（媒合紀錄/二面進度/錄取名單/申辦進度追蹤/日常支出申請），
  // 不用每個分頁各自手動點一次按鈕；住宿安排/在台簽證追蹤/在台關懷紀錄/
  // 開戶進度追蹤已經各自有自己的「完成/確認離台」機制(不是用這個標記)，
  // 不在這次同步範圍內，維持原本各自的流程。
  async function handleCloseCase(studentId) {
    try {
      const matchesSnap = await getDocs(query(collection(db, 'tsaipei_matches'), where('studentId', '==', studentId)));
      const matchIds = matchesSnap.docs.map((d) => d.id);
      const dependentSnaps = await Promise.all([
        matchIds.length ? getDocs(query(collection(db, 'tsaipei_secondInterviews'), where('matchId', 'in', matchIds.slice(0, 30)))) : null,
        matchIds.length ? getDocs(query(collection(db, 'tsaipei_admittedList'), where('matchId', 'in', matchIds.slice(0, 30)))) : null,
        getDocs(query(collection(db, 'tsaipei_applicationProgress'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'tsaipei_dailyExpenseApplications'), where('studentId', '==', studentId))),
      ]);
      const refs = [
        ...matchesSnap.docs.map((d) => d.ref),
        ...dependentSnaps.flatMap((snap) => (snap ? snap.docs.map((d) => d.ref) : [])),
      ];
      for (let i = 0; i < refs.length; i += 450) {
        const batch = writeBatch(db);
        refs.slice(i, i + 450).forEach((ref) => batch.update(ref, { confirmedClosed: true }));
        await batch.commit();
      }
      await update(studentId, { confirmedClosed: true });
    } catch (err) {
      alert(`結案失敗：${err.message || err}`);
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>學生資料</h2>
          <div className="page-desc">管理來台實習之國際學生基本資料與狀態；按「結案」會同步把這個學生的媒合紀錄/二面進度/錄取名單/申辦進度追蹤/日常支出申請一起標記結案(住宿安排/在台簽證追蹤/在台關懷紀錄/開戶進度追蹤各自有自己的完成機制，不受影響){!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({ status: STUDENT_STATUS[0] })}>+ 新增學生</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」欄位需與「下載完整資料」的 CSV 欄位一致；上傳後會完全取代目前所有學生資料，請先下載備份再匯入。</p>}
      <div className="card">
        <input placeholder="搜尋姓名/學校/國籍" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap sticky-header"><table>
            <thead>
              <tr>
                <th>姓名 / 國籍</th><th>年齡</th><th>學校 / 系所</th><th>電話</th><th>入境 / 離境</th><th>文件</th><th>是否有華語證照</th><th>期望產業別</th><th>狀態</th><th>系統來源</th><th>建立時間</th>
                {canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const doc = docSummary(r);
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.chineseName}{r.originalName ? `（${r.originalName}）` : ''}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{r.nationality || '—'}</div>
                    </td>
                    <td>{ageFromBirthDate(r.birthDate) ?? '—'}</td>
                    <td>
                      {r.school || '—'}
                      <div className="muted" style={{ fontSize: 12 }}>{[r.department1, r.department2].filter(Boolean).join(' / ')}</div>
                    </td>
                    <td>{r.phone || '—'}</td>
                    <td>{r.firstEntryDate || '—'} ~ {r.firstExitDate || '—'}</td>
                    <td><span className={`tag ${doc.complete ? 'tag-green' : 'tag-amber'}`}>{doc.done}/{doc.total}</span></td>
                    <td>{r.hasCert && r.hasCert !== '無' ? `${r.hasCert}${r.certType ? `（${r.certType} ${r.certLevel || ''}）` : ''}` : (r.hasCert === '無' ? '無' : '—')}</td>
                    <td>{parseList(r.desiredIndustries).join('、') || '—'}</td>
                    <td><Tag value={r.status} map={STUDENT_TAG} /></td>
                    <td className="muted">{systemSourceLabel(r)}</td>
                    <td className="muted">{formatCreatedAt(r)}</td>
                    {canEditPage && (
                      <td>
                        <div className="row-actions">
                          <button onClick={() => setEditing(r)}>編輯</button>
                          <button className="danger" onClick={() => handleDelete(r.id)}>刪除</button>
                          <button onClick={() => handleCloseCase(r.id)}>結案</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={11} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && (
        <StudentFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />
      )}
    </div>
  );
}

function StudentFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯學生' : '新增學生'}</h3>
        {initial.id && <p className="muted" style={{ marginTop: -8 }}>系統來源：{systemSourceLabel(initial)}</p>}
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                {f.key === 'status' ? (
                  <select value={form.status || STUDENT_STATUS[0]} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {STUDENT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : f.options ? (
                  <select value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    {f.options.map((o) => <option key={o} value={o}>{o || '請選擇'}</option>)}
                  </select>
                ) : f.type === 'tags' ? (
                  <input
                    placeholder="用逗號分隔多個項目"
                    defaultValue={parseList(form[f.key]).join('、')}
                    onBlur={(e) => setForm({ ...form, [f.key]: JSON.stringify(e.target.value.split(/[,、]/).map((s) => s.trim()).filter(Boolean)) })}
                  />
                ) : (
                  <input
                    type={f.type || 'text'}
                    required={f.required}
                    value={form[f.key] || ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
                )}
              </label>
            ))}
          </div>
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
