import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { useColumnVisibility } from '../../lib/useColumnVisibility';
import ColumnPicker from '../../components/ColumnPicker';
import { deleteWorkerCascade } from '../../lib/yujianCascade';

// 履歷表存成 data URL（含 MIME type）直接存在人員文件裡，跟客戶請款範本上傳
// 同一套做法；上限抓 700KB 避免超過 Firestore 單一文件 1MB 的限制。
const MAX_RESUME_SIZE = 700 * 1024;
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
// Chrome 不允許直接把 data: URL 當成分頁導覽目標開新分頁（會被靜默擋下、
// 按了「顯示」沒有任何反應），要先轉成 Blob URL 才能正常在新分頁開啟或下載。
function dataUrlToBlobUrl(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*?);base64/)?.[1] || 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function viewResume(dataUrl) {
  window.open(dataUrlToBlobUrl(dataUrl), '_blank');
}

function downloadResume(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrlToBlobUrl(dataUrl);
  a.download = filename || '履歷表';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export const WORKER_STATUS = ['待媒合', '媒合中', '已媒合', '在職中', '轉出中', '已轉出', '已離境', '取消'];

// 其他分頁顯示/選擇人員時一律改用工人編號（沒有編號的舊資料才退回姓名）。
export function workerLabel(w) {
  return w?.workerNo || w?.chineseName || w?.originalName || '(未設定)';
}
const NATIONALITIES = ['印尼', '菲律賓', '越南', '泰國'];
export const WORK_TYPES = ['家庭看護工', '家庭幫傭'];

const FIELDS = [
  { key: 'workerNo', label: '工人編號', required: true },
  { key: 'chineseName', label: '中文姓名' },
  { key: 'originalName', label: '護照姓名' },
  { key: 'nationality', label: '國籍', options: NATIONALITIES },
  { key: 'gender', label: '性別', options: ['男', '女'] },
  { key: 'birthDate', label: '出生日期', type: 'date' },
  { key: 'birthCertificate', label: '出生證明', options: ['未收到', '已收到'] },
  { key: 'birthCertificateCorrect', label: '出生證明是否正確', options: ['正確', '不正確'] },
  { key: 'passportNumber', label: '護照號碼' },
  { key: 'phone', label: '聯絡電話' },
  { key: 'workType', label: '工作類型', options: WORK_TYPES },
  { key: 'foreignAgency', label: '國外仲介' },
  { key: 'entryDate', label: '入境日期', type: 'date' },
  { key: 'status', label: '狀態', options: WORKER_STATUS },
  { key: 'notes', label: '備註' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'confirmedClosed', label: '已結案' }];

export default function WorkersPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'workers', role, overrides);
  const { rows, loading, add, update } = useCollection('yujian_workers');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('yujian_workers', CSV_FIELDS, { entityLabel: '看護/家事人員資料', requiredKeys: ['workerNo'], canEdit: canEditPage });
  // 國外仲介當成分類的群組標題，不用再重複顯示同一欄。
  const rowFields = FIELDS.filter((f) => f.key !== 'foreignAgency');
  const { visibleKeys, toggleColumn } = useColumnVisibility(rowFields);

  const searchQuery = q.trim().toLowerCase();
  // 按過「已結案」的紀錄從清單消失（資料還在，下載完整資料時仍會包含）。
  const filtered = rows
    .filter((r) => !r.confirmedClosed)
    .filter((r) => !searchQuery || `${r.workerNo || ''} ${r.chineseName || ''} ${r.originalName || ''} ${r.nationality || ''}`.toLowerCase().includes(searchQuery));
  const columns = rowFields.filter((f) => visibleKeys.has(f.key));

  const groups = {};
  filtered.forEach((r) => {
    const agency = r.foreignAgency || '未指定國外仲介';
    (groups[agency] ||= []).push(r);
  });
  const agencyNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  // 新增人員完成後自動在媒合紀錄建立一筆待指定雇主的紀錄，不用再手動去
  // 媒合紀錄那邊重新建一筆。入境日期第一次填入時，狀態如果還停留在媒合
  // 階段（待媒合/媒合中/已媒合），自動帶成「在職中」，兩者不用分開手動改。
  // 狀態變成「轉出中」時自動在安置中名單建立一筆紀錄，不用再手動去那邊新增。
  async function ensurePlacementRecord(workerId) {
    const existing = await getDocs(query(collection(db, 'yujian_placementList'), where('workerId', '==', workerId)));
    if (!existing.empty) return;
    await addDoc(collection(db, 'yujian_placementList'), { workerId, status: '安置中' });
  }

  async function handleSave(data) {
    const payload = { ...data };
    const prevEntryDate = editing?.entryDate || '';
    const prevStatus = editing?.status || '';
    if (payload.entryDate && !prevEntryDate && ['待媒合', '媒合中', '已媒合'].includes(payload.status)) {
      payload.status = '在職中';
    }
    if (payload.id) {
      const { id, ...rest } = payload;
      await update(id, rest);
      if (payload.status === '轉出中' && prevStatus !== '轉出中') await ensurePlacementRecord(id);
    } else {
      const ref = await add({ ...payload, status: payload.status || '待媒合' });
      await addDoc(collection(db, 'yujian_matches'), { workerId: ref.id, employerId: '', status: '媒合中' });
      if (payload.status === '轉出中') await ensurePlacementRecord(ref.id);
    }
    setEditing(null);
  }

  // 刪除人員時一併清掉相關聯的媒合紀錄（及再往下連動出去的二面進度/錄取
  // 名單/申辦進度追蹤/已入台名單/安置中名單），避免留下孤兒紀錄。
  async function handleRemove(id) {
    if (!confirm('刪除這位人員會一併清除相關的媒合紀錄、二面進度、錄取名單、申辦進度追蹤、已入台名單與安置中名單，確定要刪除嗎？')) return;
    try {
      await deleteWorkerCascade(id);
    } catch (err) {
      alert(`刪除失敗：${err.message || err}`);
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>看護/家事人員資料</h2>
          <div className="page-desc">管理外籍看護工／家庭幫傭人員的基本資料與狀態{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({ status: WORKER_STATUS[0] })}>+ 新增人員</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有人員資料，請先下載備份再匯入。</p>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'start', marginBottom: 12, flexWrap: 'wrap' }}>
        <input placeholder="搜尋工人編號、姓名或國籍" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        <ColumnPicker columns={rowFields} visibleKeys={visibleKeys} onToggle={toggleColumn} />
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        agencyNames.length === 0 ? <p className="muted">沒有資料</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {agencyNames.map((agency) => (
              <div className="card" key={agency} style={{ overflowX: 'auto' }}>
                <h4 style={{ marginTop: 0 }}>{agency} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[agency].length} 位人員</span></h4>
                <div className="table-wrap"><table>
                  <thead><tr>{columns.map((f) => <th key={f.key}>{f.label}</th>)}{canEditPage && <th></th>}</tr></thead>
                  <tbody>
                    {groups[agency].map((r) => (
                      <tr key={r.id}>
                        {columns.map((f) => <td key={f.key}>{r[f.key] || '—'}</td>)}
                        {canEditPage && (
                          <td className="row-actions">
                            <button onClick={() => setEditing(r)}>編輯</button>
                            <button className="danger" onClick={() => handleRemove(r.id)}>刪除</button>
                            <button onClick={() => update(r.id, { confirmedClosed: true })}>已結案</button>
                            {r.resumeData && <button onClick={() => viewResume(r.resumeData)}>顯示履歷表</button>}
                            {r.resumeData && <button onClick={() => downloadResume(r.resumeData, r.resumeName)}>下載履歷表</button>}
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
      {editing && <WorkerFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function WorkerFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);

  async function handleResumeUpload(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_RESUME_SIZE) {
      alert('履歷表檔案太大（上限約 700KB），請精簡後再上傳。');
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setForm({ ...form, resumeData: dataUrl, resumeName: file.name });
  }

  function handleRemoveResume() {
    setForm({ ...form, resumeData: '', resumeName: '' });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯人員' : '新增人員'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                {f.options ? (
                  <select required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    <option value="">請選擇</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
          </div>
          <h4>履歷表</h4>
          {form.resumeName ? (
            <div className="row-actions" style={{ marginBottom: 16 }}>
              <span>{form.resumeName}</span>
              <button type="button" onClick={() => viewResume(form.resumeData)}>顯示</button>
              <button type="button" onClick={() => downloadResume(form.resumeData, form.resumeName)}>下載</button>
              <button type="button" className="danger" onClick={handleRemoveResume}>移除</button>
            </div>
          ) : (
            <label style={{ display: 'block', marginBottom: 16 }}>
              上傳履歷表（圖片或 PDF，上限約 700KB）
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleResumeUpload} />
            </label>
          )}
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
