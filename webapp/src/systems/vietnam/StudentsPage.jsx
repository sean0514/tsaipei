import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, deleteDoc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import Tag from '../../components/Tag';
import { STUDENT_TAG } from '../../lib/tags';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';

// Ported 1:1 from apps-script/Index.html STUDENT_STATUS.
const STUDENT_STATUS = ['媒合中', '待面試', '已面試', '送審中', '補件中', '企業用印', '收到函文', '辦理簽證中', '已入台實習', '已完成', '取消'];
const CERT_LEVELS = ['A1', 'A2', 'B1', 'B2'];
const DESIRED_INDUSTRY_PRESETS = ['餐飲業', '旅館業', '製造業', '服務業', '物流業'];
const MAX_PHOTO_SIZE = 3 * 1024 * 1024;

// 期望產業別存成 JSON 字串陣列（跟 PositionsPage.jsx 的 otherBenefits 同一套
// 存法），可複選預設的五個產業，也可以自行新增項目；不是合法 JSON（例如
// 舊資料是單一文字）就當成一個項目處理。
function parseList(json) {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return arr;
  } catch { /* 不是 JSON，當作舊版單一文字欄位處理 */ }
  return [json];
}

// 欄位跟公開線上履歷填寫頁面（pages/VietnamResumeApplyPage.jsx，依「外國籍
// 學生基本資料表」製作）一模一樣，這樣履歷轉入學生資料時欄位能直接對應。
// 多保留 status/sourceSupplier 這兩個履歷表沒有的欄位——這兩個是系統運作
// 必要的操作性欄位（status 給主管報表/儀表板算狀態統計、媒合流程用；
// sourceSupplier 給國外補助申請篩選學生來源用），拿掉會讓其他頁面壞掉，
// 不是履歷表「個人資料」的一部分，所以不跟著改。
// 注意：InternshipDocsPage.jsx 原本會同步寫入 langProofStatus/passportCopy/
// enrollProofStatus/extensionNeeded/extensionProof/nightInternshipDoc 這幾個
// 舊欄位到學生資料，這裡拿掉後那幾個寫入動作還是會成功（Firestore 沒有
// schema 限制），只是變成這個頁面看不到、也不會再用到的欄位，不影響
// InternshipDocsPage 本身的文件追蹤功能。
const FIELDS = [
  { key: 'originalName', label: '英文姓名（與護照相符）', required: true },
  { key: 'chineseName', label: '中文姓名' },
  { key: 'vietnameseName', label: '越南姓名' },
  { key: 'photoUrl', label: '大頭貼', type: 'photo' },
  { key: 'hasPassport', label: '是否有護照', options: ['', 'Yes', 'No'] },
  { key: 'passportNumber', label: '護照號碼', visibleIf: (f) => f.hasPassport === 'Yes' },
  { key: 'passportPhotoUrl', label: '護照照片', type: 'photo', visibleIf: (f) => f.hasPassport === 'Yes' },
  { key: 'gender', label: '性別', options: ['', '男', '女'] },
  { key: 'birthDate', label: '出生日期', type: 'date' },
  { key: 'nationality', label: '國籍' },
  { key: 'height', label: '身高(cm)', type: 'number' },
  { key: 'weight', label: '體重(kg)', type: 'number' },
  { key: 'school', label: '就讀學校' },
  { key: 'enrollDate', label: '入學日期', type: 'date' },
  { key: 'programYears', label: '學制（年）', type: 'number' },
  { key: 'department', label: '科系' },
  { key: 'expectedGraduation', label: '預計畢業時間', type: 'date' },
  { key: 'hasCert', label: '是否有華語證照', options: ['', '有', '已考試未領取證照', '無'] },
  { key: 'certType', label: '證照類別', options: ['', 'TOCFL', 'TOEIC'], visibleIf: (f) => f.hasCert === '有' || f.hasCert === '已考試未領取證照' },
  { key: 'certLevel', label: '等級', options: ['', ...CERT_LEVELS], visibleIf: (f) => f.hasCert === '有' || f.hasCert === '已考試未領取證照' },
  { key: 'certPickupDate', label: '證照領取日期', type: 'date', visibleIf: (f) => f.hasCert === '已考試未領取證照' },
  { key: 'expectedExamDate', label: '預計考試日期', type: 'date', visibleIf: (f) => f.hasCert === '無' },
  { key: 'workExperience', label: '工作經驗', type: 'textarea' },
  { key: 'desiredIndustries', label: '期望產業別', type: 'multiselect', options: DESIRED_INDUSTRY_PRESETS },
  { key: 'status', label: '狀態' },
  { key: 'sourceSupplier', label: '學生來源(國外供應商)' },
];
const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'confirmedClosed', label: '結案' }];

// 複製自 systems/tsaipei/StudentsPage.jsx，collection 字首改成 vietnam_，
// 介面文字（標題/按鈕/欄位標籤/表格欄位）包上 t(...) 依語言切換顯示；下拉
// 選單的選項值（國籍/性別等）維持中文儲存，不在這個分頁翻譯顯示文字。
export default function StudentsPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'students', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('vietnam_students');
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {...} = editing
  const [q, setQ] = useState('');

  const sorted = [...rows].sort((a, b) => {
    const at = a.createdAt?.toMillis?.() ?? 0;
    const bt = b.createdAt?.toMillis?.() ?? 0;
    if (at !== bt) return bt - at;
    return (a.chineseName || '').localeCompare(b.chineseName || '');
  });
  const filtered = sorted
    .filter((r) => !r.confirmedClosed)
    .filter((r) => !q || [r.chineseName, r.vietnameseName, r.originalName, r.school, r.nationality].some((v) => v?.includes(q)));
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_students', CSV_FIELDS, { entityLabel: '學生資料', canEdit: canEditPage });

  async function handleSave(data) {
    try {
      if (data.id) {
        const { id, ...rest } = data;
        await update(id, rest);
      } else {
        const ref = await add({ ...data, createdAt: serverTimestamp() });
        await addDoc(collection(db, 'vietnam_matches'), {
          studentId: ref.id, positionId: '', status: '媒合中', matchDate: '', notes: '（系統依學生建檔自動建立）', createdAt: serverTimestamp(),
        });
      }
      setEditing(null);
    } catch (err) {
      alert(`存檔失敗：${err.message || err}`);
    }
  }

  async function handleDelete(studentId) {
    if (!window.confirm('確定要刪除這位學生嗎？')) return;
    try {
      const matchesSnap = await getDocs(query(collection(db, 'vietnam_matches'), where('studentId', '==', studentId)));
      const matchIds = matchesSnap.docs.map((d) => d.id);
      const dependentSnaps = await Promise.all([
        matchIds.length ? getDocs(query(collection(db, 'vietnam_secondInterviews'), where('matchId', 'in', matchIds.slice(0, 30)))) : null,
        matchIds.length ? getDocs(query(collection(db, 'vietnam_admittedList'), where('matchId', 'in', matchIds.slice(0, 30)))) : null,
        getDocs(query(collection(db, 'vietnam_internshipDocs'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'vietnam_applicationProgress'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'vietnam_housingRecords'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'vietnam_inTaiwanVisa'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'vietnam_inTaiwanCare'), where('studentId', '==', studentId))),
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

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('學生資料', lang)}</h2>
          <div className="page-desc">{t('管理來台實習之國際學生基本資料與狀態，欄位比照外國籍學生基本資料表', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({ status: STUDENT_STATUS[0] })}>+ {t('新增學生', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」欄位需與「下載完整資料」的 CSV 欄位一致；上傳後會完全取代目前所有學生資料，請先下載備份再匯入。', lang)}</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <input placeholder={t('搜尋姓名/學校/國籍', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>{t('姓名', lang)} / {t('國籍', lang)}</th><th>{t('就讀學校', lang)} / {t('科系', lang)}</th><th>{t('性別', lang)}</th><th>{t('是否有華語證照', lang)}</th><th>{t('期望產業別', lang)}</th><th>{t('狀態', lang)}</th>
                {canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.chineseName}{r.originalName ? `（${r.originalName}）` : ''}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{[r.vietnameseName, r.nationality].filter(Boolean).join(' · ') || '—'}</div>
                  </td>
                  <td>
                    {r.school || '—'}
                    <div className="muted" style={{ fontSize: 12 }}>{r.department || ''}</div>
                  </td>
                  <td>{r.gender || '—'}</td>
                  <td>{r.hasCert && r.hasCert !== '無' ? `${r.hasCert}${r.certType ? `（${r.certType} ${r.certLevel || ''}）` : ''}` : (r.hasCert === '無' ? t('無', lang) : '—')}</td>
                  <td>{parseList(r.desiredIndustries).join('、') || '—'}</td>
                  <td><Tag value={r.status} map={STUDENT_TAG} /></td>
                  {canEditPage && (
                    <td>
                      <div className="row-actions">
                        <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                        <button className="danger" onClick={() => handleDelete(r.id)}>{t('刪除', lang)}</button>
                        <button onClick={() => update(r.id, { confirmedClosed: true })}>{t('結案', lang)}</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="muted">{t('沒有資料', lang)}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && (
        <StudentFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />
      )}
    </div>
  );
}

async function uploadStudentPhoto(file, prefix) {
  const path = `vietnam_resumePhotos/${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}

// 複選預設選項＋自行新增項目：checkbox 勾選預設選項，額外加過的自訂項目
// 也會各自顯示成一個可勾選/移除的項目，整組存回 JSON 陣列字串。
function MultiSelectEditor({ value, options, onChange, lang }) {
  const [newItem, setNewItem] = useState('');
  const selected = parseList(value);
  const extraItems = selected.filter((v) => !options.includes(v));

  function toggle(item) {
    if (selected.includes(item)) onChange(selected.filter((v) => v !== item));
    else onChange([...selected, item]);
  }
  function addCustom() {
    const text = newItem.trim();
    if (!text || selected.includes(text)) return;
    onChange([...selected, text]);
    setNewItem('');
  }
  function removeCustom(item) {
    onChange(selected.filter((v) => v !== item));
  }

  return (
    <div>
      <div className="row-actions" style={{ flexWrap: 'wrap' }}>
        {[...options, ...extraItems].map((item) => (
          <label key={item} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 400 }}>
            <input type="checkbox" checked={selected.includes(item)} onChange={() => toggle(item)} />
            {item}
            {!options.includes(item) && (
              <button type="button" className="danger small" onClick={() => removeCustom(item)}>×</button>
            )}
          </label>
        ))}
      </div>
      <div className="row-actions" style={{ marginTop: 8 }}>
        <input
          placeholder={t('輸入自訂項目', lang)}
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          style={{ flex: 1 }}
        />
        <button type="button" onClick={addCustom}>+ {t('新增項目', lang)}</button>
      </div>
    </div>
  );
}

function StudentFormModal({ initial, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const [uploadingKey, setUploadingKey] = useState(null);
  const [uploadError, setUploadError] = useState('');

  async function handlePhotoChange(key, e) {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    setUploadError('');
    if (file.size > MAX_PHOTO_SIZE) {
      setUploadError(t('照片檔案太大（上限 3MB）', lang));
      e.target.value = '';
      return;
    }
    setUploadingKey(key);
    try {
      const url = await uploadStudentPhoto(file, key);
      setForm((f) => ({ ...f, [key]: url }));
    } catch (err) {
      setUploadError(`${t('上傳失敗', lang)}：${err.message || err}`);
    } finally {
      setUploadingKey(null);
      e.target.value = '';
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯學生', lang) : t('新增學生', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.filter((f) => !f.visibleIf || f.visibleIf(form)).map((f) => (
              <label key={f.key}>
                {t(f.label, lang)}
                {f.key === 'status' ? (
                  <select value={form.status || STUDENT_STATUS[0]} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {STUDENT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : f.type === 'photo' ? (
                  <div>
                    {form[f.key] && <img src={form[f.key]} alt="" style={{ width: 90, height: 90, objectFit: 'cover', display: 'block', marginBottom: 6 }} />}
                    <input type="file" accept="image/*" onChange={(e) => handlePhotoChange(f.key, e)} disabled={uploadingKey === f.key} />
                    {uploadingKey === f.key && <div className="muted">{t('上傳中…', lang)}</div>}
                  </div>
                ) : f.type === 'textarea' ? (
                  <textarea rows={4} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                ) : f.type === 'multiselect' ? (
                  <MultiSelectEditor
                    value={form[f.key]}
                    options={f.options}
                    onChange={(next) => setForm({ ...form, [f.key]: JSON.stringify(next) })}
                    lang={lang}
                  />
                ) : f.options ? (
                  <select value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    {f.options.map((o) => <option key={o} value={o}>{o || t('請選擇', lang)}</option>)}
                  </select>
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
          {uploadError && <div className="error-text">{uploadError}</div>}
          <div className="row-actions">
            <button type="submit" className="primary" disabled={!!uploadingKey}>{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
