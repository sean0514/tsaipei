import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { ensurePlacementRecord, hasTransferStatus } from '../../lib/yujianCascade';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { useColumnVisibility } from '../../lib/useColumnVisibility';
import ColumnPicker from '../../components/ColumnPicker';
import { workerLabel } from './WorkersPage';
import { fileToDataUrl, viewFile, downloadFile } from '../../lib/fileAttachment';

// 附件大小上限；同一筆案件可能同時有好幾個關卡的附件，抓小一點避免超過
// Firestore 單一文件 1MB 的限制。
export const MAX_MILESTONE_ATTACHMENT_SIZE = 400 * 1024;
export function attachmentDataKey(key) { return `${key}AttachmentData`; }
export function attachmentNameKey(key) { return `${key}AttachmentName`; }
export function attachmentsKey(key) { return `${key}Attachments`; }

export const NATIONALITIES = ['印尼', '菲律賓', '越南', '泰國'];
export const CASE_STATUS = [
  '辦理簽證', 'IN MECO', '尚未收到函文', '收到函文', '製作認證', '認證完畢',
  '準備送認證', '寄達國外', '已入台', '已接離', '轉出中', '已轉出', '已離台', '準備入境', '進行中', '已取消',
];

// 轉出/離境流程的分段紀錄：申辦流程清單裡可以自由新增這幾個階段各自的
// 日期，跟進度狀態共用同一組選項。
export const TRANSFER_STEP_STATUS = ['已接離', '轉出中', '已轉出', '已離台'];

// 「資料總檔」：案件基本資訊，雇主姓名放第一欄並 sticky，列表橫向捲動時
// 仍固定在畫面左側。
export const INFO_FIELDS = [
  { key: 'employerName', label: '雇主姓名', required: true, sticky: true },
  { key: 'caseNo', label: '編號' },
  { key: 'workerId', label: '工人編號' },
  { key: 'selectionStatus', label: '選工狀態' },
  { key: 'foreignAgency', label: '國外仲介' },
  { key: 'taiwanAgency', label: '國內仲介' },
  { key: 'nationality', label: '國籍', options: NATIONALITIES },
];

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// 申辦流程清單：對應實際申辦流程從選工到送工的每個關卡；日期欄位留空代表
// 尚未完成，標籤上的「（N天）」是預期作業天數，僅供填寫時參考。
// 認證領件日期有 overdueFrom/overdueDays：超過送件日期＋天數還沒填領件
// 日期時，該欄位標籤會變紅色提醒逾期。
// attachment: 'single' 可上傳一個檔案，'multiple' 可上傳多個檔案；檔案存成
// data URL 直接放在案件文件裡（見 fileAttachment.js），不列入 CSV 匯出/匯入。
export const MILESTONES = [
  { key: 'admissionConfirmedDate', label: '確認錄取日' },
  { key: 'certCompleteDate', label: '認證（14天）送件日期', attachment: 'single' },
  { key: 'certReceiveDate', label: '認證領件日期', overdueFrom: 'certCompleteDate', overdueDays: 14 },
  { key: 'sentAbroadDate', label: '寄出國外日期' },
  { key: 'healthCheckInDate', label: '體檢/時間 IN' },
  { key: 'healthCheckOutDate', label: '體檢/時間 OUT', attachment: 'single' },
  { key: 'trainingInDate', label: '訓練/時間 IN' },
  { key: 'trainingOutDate', label: '訓練/時間 OUT' },
  { key: 'owwaDate', label: '福利部OWWA（2天）' },
  { key: 'laborLetterDate', label: '台灣勞動部函' },
  { key: 'poeaInDate', label: '海外勞工署POEA（3-4天）IN' },
  { key: 'poeaOutDate', label: '海外勞工署POEA（3-4天）OUT' },
  { key: 'tecoVisaInDate', label: '中華商會TECO VISA IN' },
  { key: 'visaOutDate', label: 'VISA OUT' },
  { key: 'oecDate', label: '海外工作證OEC' },
  { key: 'preDepartureDate', label: 'PDOS海外就業講習', attachment: 'single' },
  { key: 'entryDate', label: '入境時間', attachment: 'multiple' },
  { key: 'dispatchDate', label: '送工時間' },
];

export function milestoneNoteKey(key) {
  return `${key}Note`;
}

export const FIELDS = [
  ...INFO_FIELDS,
  { key: 'status', label: '進度狀態', options: CASE_STATUS },
  ...MILESTONES.flatMap((m) => [m, { key: milestoneNoteKey(m.key), label: `${m.label}備註` }]),
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'confirmedClosed', label: '已結案' }];

// 列表頁用的欄位（案件基本識別＋進度概況），跟詳細視窗裡「資料總檔」用的
// INFO_FIELDS 是分開的兩組。
export const LIST_COLUMNS = [
  { key: 'employerName', label: '雇主姓名', sticky: true },
  { key: 'caseNo', label: '編號' },
  { key: 'workerName', label: '工人編號' },
  { key: 'nationality', label: '國籍' },
  { key: 'workerType', label: '工人類型' },
  { key: 'workerStatus', label: '工人狀態' },
  { key: 'status', label: '進度狀態' },
  { key: 'progress', label: '進度' },
  { key: 'notes', label: '備註' },
];

export function newNoteId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 領件日期逾期提醒：送件日期＋overdueDays 天已過，領件日期卻還沒填。
export function isMilestoneOverdue(m, p) {
  return !!(m.overdueFrom && p?.[m.overdueFrom] && !p?.[m.key]
    && new Date() >= new Date(`${addDays(p[m.overdueFrom], m.overdueDays)}T00:00:00`));
}

// 進度圖示：只保留「最近完成的一步」到「送工時間」之間的步驟，已經完成很久的
// 步驟不用一直佔畫面；都還沒開始的話就整條鏈完整顯示，讓人知道下一步是什麼。
// 逾期的步驟（目前只有認證領件日期）不管在不在這個範圍內都會顯示紅色提醒。
// 如果先把日期填成未來的時間（預約/預計日期），時間還沒到之前不算「已完成」，
// 不會影響進度顯示（不會被當成已完成而跳過前面步驟）。
// 申辦流程欄位共用元件：「申辦進度追蹤」和「已入台名單」的編輯視窗都是同一組
// 關卡欄位（含逾期提醒、附件上傳），抽成共用元件避免兩邊各寫一份互相漏改。
// onDateChange 沒帶入時，日期變更就直接寫回 form；帶入的話（例如認證送件
// 日期要自動推算領件日期）交給呼叫端決定怎麼處理。
export function MilestoneFields({ form, setForm, onDateChange, showOverdue = true }) {
  async function handleSingleUpload(key, e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_MILESTONE_ATTACHMENT_SIZE) {
      alert('檔案太大（上限約 400KB），請精簡後再上傳。');
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setForm({ ...form, [attachmentDataKey(key)]: dataUrl, [attachmentNameKey(key)]: file.name });
  }

  function handleRemoveSingle(key) {
    setForm({ ...form, [attachmentDataKey(key)]: '', [attachmentNameKey(key)]: '' });
  }

  async function handleMultiUpload(key, e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    if (files.some((f) => f.size > MAX_MILESTONE_ATTACHMENT_SIZE)) {
      alert('檔案太大（上限約 400KB），請精簡後再上傳。');
      return;
    }
    const items = await Promise.all(files.map(async (f) => ({ id: newNoteId(), name: f.name, dataUrl: await fileToDataUrl(f) })));
    setForm({ ...form, [attachmentsKey(key)]: [...(form[attachmentsKey(key)] || []), ...items] });
  }

  function handleRemoveMulti(key, id) {
    setForm({ ...form, [attachmentsKey(key)]: (form[attachmentsKey(key)] || []).filter((it) => it.id !== id) });
  }

  return (
    <div className="form-grid">
      {MILESTONES.map((m) => {
        const isOverdue = showOverdue && isMilestoneOverdue(m, form);
        return (
          <div key={m.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label>
              <span style={isOverdue ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>{m.label}{isOverdue && '（已逾期）'}</span>
              <input
                type="date"
                value={form[m.key] || ''}
                onChange={(e) => (onDateChange ? onDateChange(m.key, e.target.value) : setForm({ ...form, [m.key]: e.target.value }))}
              />
            </label>
            <input placeholder="備註" value={form[milestoneNoteKey(m.key)] || ''} onChange={(e) => setForm({ ...form, [milestoneNoteKey(m.key)]: e.target.value })} />
            {m.attachment === 'single' && (
              form[attachmentNameKey(m.key)] ? (
                <div className="row-actions">
                  <span style={{ fontSize: 12 }}>{form[attachmentNameKey(m.key)]}</span>
                  <button type="button" onClick={() => viewFile(form[attachmentDataKey(m.key)])}>顯示</button>
                  <button type="button" onClick={() => downloadFile(form[attachmentDataKey(m.key)], form[attachmentNameKey(m.key)])}>下載</button>
                  <button type="button" className="danger" onClick={() => handleRemoveSingle(m.key)}>移除</button>
                </div>
              ) : (
                <label style={{ fontSize: 12 }}>
                  上傳檔案（上限約 400KB）
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => handleSingleUpload(m.key, e)} />
                </label>
              )
            )}
            {m.attachment === 'multiple' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(form[attachmentsKey(m.key)] || []).map((it) => (
                  <div className="row-actions" key={it.id}>
                    <span style={{ fontSize: 12 }}>{it.name}</span>
                    <button type="button" onClick={() => viewFile(it.dataUrl)}>顯示</button>
                    <button type="button" onClick={() => downloadFile(it.dataUrl, it.name)}>下載</button>
                    <button type="button" className="danger" onClick={() => handleRemoveMulti(m.key, it.id)}>移除</button>
                  </div>
                ))}
                <label style={{ fontSize: 12 }}>
                  上傳檔案（可多選，每個上限約 400KB）
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple onChange={(e) => handleMultiUpload(m.key, e)} />
                </label>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ProgressPipeline({ p }) {
  const today = new Date().toISOString().slice(0, 10);
  let lastDoneIdx = -1;
  MILESTONES.forEach((m, i) => { if (p?.[m.key] && p[m.key] <= today) lastDoneIdx = i; });
  const visible = lastDoneIdx === -1 ? MILESTONES : MILESTONES.slice(lastDoneIdx);
  return (
    <div className="pipeline">
      {visible.map((m, i) => (
        <span key={m.key} className={`pip-step${lastDoneIdx !== -1 && i === 0 ? ' done' : ''}${isMilestoneOverdue(m, p) ? ' overdue' : ''}`}>{m.label}</span>
      ))}
    </div>
  );
}

export default function ApplicationProgressPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'applicationProgress', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('yujian_applicationProgress');
  const { rows: matches } = useCollection('yujian_matches');
  const { rows: workers } = useCollection('yujian_workers');
  const { rows: employers } = useCollection('yujian_employers');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('yujian_applicationProgress', CSV_FIELDS, { entityLabel: '申辦進度追蹤', requiredKeys: ['employerName'], canEdit: canEditPage });
  const { visibleKeys, toggleColumn } = useColumnVisibility(LIST_COLUMNS);

  // 資料總檔的「工人姓名」是直接選的 workerId；沒有選過（例如舊資料）就退回
  // 用 matchId 找對應人員，兩種來源都支援。
  function resolveWorkerId(r) {
    return r.workerId || matches.find((x) => x.id === r.matchId)?.workerId;
  }
  function workerStatusFor(r) {
    return workers.find((x) => x.id === resolveWorkerId(r))?.status || '—';
  }
  function workerNameFor(r) {
    return workerLabel(workers.find((x) => x.id === resolveWorkerId(r)));
  }
  function workerTypeFor(r) {
    return workers.find((x) => x.id === resolveWorkerId(r))?.recruitType || '—';
  }

  const searchQuery = q.trim().toLowerCase();
  // 按過「已結案」的紀錄從清單消失（資料還在，下載完整資料時仍會包含）。
  const filtered = rows
    .map((r) => ({ ...r, workerStatus: workerStatusFor(r), workerName: workerNameFor(r), workerType: workerTypeFor(r) }))
    .filter((r) => !r.confirmedClosed)
    .filter((r) => !searchQuery || `${r.employerName || ''} ${r.caseNo || ''} ${r.foreignAgency || ''}`.toLowerCase().includes(searchQuery))
    .slice()
    .sort((a, b) => {
      const numA = Number(a.caseNo);
      const numB = Number(b.caseNo);
      if (a.caseNo && b.caseNo && !Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
      return (a.caseNo || '').localeCompare(b.caseNo || '');
    });
  const columns = LIST_COLUMNS.filter((c) => visibleKeys.has(c.key));
  // 入境時間如果先填成未來的日期，時間還沒到之前仍算「未入台」，不受預先
  // 輸入的日期影響分類。
  const today = new Date().toISOString().slice(0, 10);
  const notArrived = filtered.filter((r) => !r.entryDate || r.entryDate > today);
  const arrived = filtered.filter((r) => r.entryDate && r.entryDate <= today);

  // 入境時間到了（跟這一頁「已入台」分類同一套判斷）自動把這筆案件帶入已入台
  // 名單；一旦已經帶入過，之後案件本身任何欄位（包含進度狀態）再變更，都
  // 同步更新已入台名單那筆對應紀錄，兩邊不會分家、畫面上的分類也會一致。
  async function syncArrivedList(saved) {
    const today = new Date().toISOString().slice(0, 10);
    if (!saved.entryDate || saved.entryDate > today) return;
    const existing = await getDocs(query(collection(db, 'yujian_arrivedList'), where('sourceCaseId', '==', saved.id)));
    const { id, ...rest } = saved;
    if (existing.empty) {
      await addDoc(collection(db, 'yujian_arrivedList'), { ...rest, sourceCaseId: id });
    } else {
      await updateDoc(existing.docs[0].ref, rest);
    }
  }

  // 送工時間第一次填入時，進度狀態自動改成「已入台」，不用分開手動改兩個欄位。
  async function handleSave(data) {
    const prevDispatchDate = editing?.dispatchDate || '';
    const payload = { ...data };
    if (payload.dispatchDate && !prevDispatchDate) payload.status = '已入台';
    // 進度狀態或轉出/離境紀錄清單裡任一筆變成「已接離／轉出中／已轉出／
    // 已離台」時，自動在安置中名單建立一筆紀錄（要案件有連結到媒合紀錄才能
    // 找到對應人員，手動新增、沒有媒合來源的案件無法自動連動）。
    if (hasTransferStatus(payload, TRANSFER_STEP_STATUS) && !hasTransferStatus(editing, TRANSFER_STEP_STATUS) && payload.matchId) {
      const match = matches.find((m) => m.id === payload.matchId);
      if (match?.workerId) await ensurePlacementRecord(match.workerId);
    }
    if (payload.id) {
      const { id, ...rest } = payload;
      await update(id, rest);
      await syncArrivedList(payload);
    } else {
      const ref = await add({ status: '進行中', ...payload });
      await syncArrivedList({ ...payload, id: ref.id });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>申辦進度追蹤</h2>
          <div className="page-desc">依雇主需求案件追蹤從選工到送工的整體申辦流程{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增案件</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有進度紀錄，請先下載備份再匯入。「入境時間」到了（本頁「已入台」分類同一套判斷）會自動把該筆案件帶入「已入台名單」；「送工時間」第一次填入日期時，進度狀態會自動改成「已入台」。之後這筆案件的任何欄位異動，只要已經帶入過已入台名單，都會同步更新到那筆紀錄。</p>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'start', marginBottom: 16, flexWrap: 'wrap' }}>
        <input placeholder="搜尋編號、雇主姓名或國外仲介" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        <ColumnPicker columns={LIST_COLUMNS} visibleKeys={visibleKeys} onToggle={toggleColumn} />
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card" style={{ overflowX: 'auto' }}>
            <h4 style={{ marginTop: 0 }}>未入台 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{notArrived.length} 個案件</span></h4>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              流程：確認錄取 → 認證送件／領件（14天）→ 寄出國外 → 體檢 IN/OUT → 訓練 IN/OUT →
              福利部OWWA（2天）→ 台灣勞動部函 → 海外勞工署POEA IN/OUT（3-4天）→ 中華商會TECO VISA IN → VISA OUT →
              海外工作證OEC → PDOS海外就業講習 → 入境時間 → 送工時間（自動改為已入台）。
            </p>
            <ProgressTable items={notArrived} columns={columns} canEditPage={canEditPage} onEdit={setEditing} onRemove={remove} onClose={(id) => update(id, { confirmedClosed: true })} />
          </div>
          <div className="card" style={{ overflowX: 'auto' }}>
            <h4 style={{ marginTop: 0 }}>已入台 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{arrived.length} 個案件</span></h4>
            <ProgressTable items={arrived} columns={columns} canEditPage={canEditPage} onEdit={setEditing} onRemove={remove} onClose={(id) => update(id, { confirmedClosed: true })} />
          </div>
        </div>
      )}
      {editing && <ProgressFormModal initial={editing} workers={workers} matches={matches} employers={employers} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function ProgressTable({ items, columns, canEditPage, onEdit, onRemove, onClose }) {
  return (
    <div className="table-wrap"><table>
      <thead>
        <tr>
          {columns.map((c) => <th key={c.key} className={c.sticky ? 'sticky-col' : ''}>{c.label}</th>)}
          {canEditPage && <th></th>}
        </tr>
      </thead>
      <tbody>
        {items.map((r) => {
          const notes = r.notes || [];
          const lastNote = notes[notes.length - 1];
          return (
            <tr key={r.id}>
              {columns.map((c) => {
                if (c.key === 'status') {
                  return (
                    <td key={c.key}>
                      <span className={`tag ${r.status === '已入台' ? 'tag-green' : r.status === '已取消' ? 'tag-grey' : 'tag-amber'}`}>{r.status || '進行中'}</span>
                    </td>
                  );
                }
                if (c.key === 'progress') return <td key={c.key}><ProgressPipeline p={r} /></td>;
                if (c.key === 'notes') return <td key={c.key}>{lastNote ? `${lastNote.text}${notes.length > 1 ? `（共 ${notes.length} 則）` : ''}` : '—'}</td>;
                return <td key={c.key} className={c.sticky ? 'sticky-col' : ''}>{r[c.key] || '—'}</td>;
              })}
              {canEditPage && (
                <td className="row-actions">
                  <button onClick={() => onEdit(r)}>管理</button>
                  <button className="danger" onClick={() => onRemove(r.id)}>刪除</button>
                  <button onClick={() => onClose(r.id)}>已結案</button>
                </td>
              )}
            </tr>
          );
        })}
        {items.length === 0 && <tr><td colSpan={columns.length + (canEditPage ? 1 : 0)} className="muted">沒有資料</td></tr>}
      </tbody>
    </table></div>
  );
}

function ProgressFormModal({ initial, workers, matches, employers, onCancel, onSave }) {
  const [form, setForm] = useState({ ...initial, notes: initial.notes || [], transferSteps: initial.transferSteps || [] });
  const [newNoteText, setNewNoteText] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [newStepStatus, setNewStepStatus] = useState(TRANSFER_STEP_STATUS[0]);
  const [newStepDate, setNewStepDate] = useState('');

  // 選擇工人編號時，自動帶入資料總檔其他欄位：該工人的國外仲介、國籍，以及
  // 該工人媒合紀錄裡的雇主姓名、國內仲介（仍可手動修改）。
  function handleWorkerChange(workerId) {
    const w = workers.find((x) => x.id === workerId);
    const m = matches.find((x) => x.workerId === workerId);
    const e = employers.find((x) => x.id === m?.employerId);
    setForm({
      ...form, workerId,
      employerName: e?.employerName || form.employerName,
      foreignAgency: w?.foreignAgency || form.foreignAgency,
      nationality: w?.nationality || form.nationality,
      taiwanAgency: m?.taiwanAgency || e?.taiwanAgency || form.taiwanAgency,
    });
  }

  // 送件日期每次變更都自動把領件日期改成送件日期＋14天（存檔後仍可再手動
  // 覆蓋領件日期，但下次送件日期一變，又會重新蓋回去）。
  function handleCertCompleteDateChange(value) {
    setForm({ ...form, certCompleteDate: value, certReceiveDate: value ? addDays(value, 14) : '' });
  }

  function addTransferStep() {
    setForm({ ...form, transferSteps: [...form.transferSteps, { id: newNoteId(), status: newStepStatus, date: newStepDate }] });
    setNewStepDate('');
  }

  function updateTransferStep(id, patch) {
    setForm({ ...form, transferSteps: form.transferSteps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  function removeTransferStep(id) {
    setForm({ ...form, transferSteps: form.transferSteps.filter((s) => s.id !== id) });
  }

  function addNote() {
    const text = newNoteText.trim();
    if (!text) return;
    setForm({ ...form, notes: [...form.notes, { id: newNoteId(), text, createdAt: new Date().toISOString() }] });
    setNewNoteText('');
  }

  function startEditNote(note) {
    setEditingNoteId(note.id);
    setEditingNoteText(note.text);
  }

  function saveEditNote() {
    const text = editingNoteText.trim();
    if (!text) return;
    setForm({ ...form, notes: form.notes.map((n) => (n.id === editingNoteId ? { ...n, text } : n)) });
    setEditingNoteId(null);
    setEditingNoteText('');
  }

  function deleteNote(id) {
    setForm({ ...form, notes: form.notes.filter((n) => n.id !== id) });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? `編輯案件${initial.employerName ? ` · ${initial.employerName}` : ''}` : '新增案件'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <h4 style={{ marginTop: 0 }}>進度狀態</h4>
          <select value={form.status || '進行中'} onChange={(e) => setForm({ ...form, status: e.target.value })} style={{ marginBottom: 8 }}>
            {CASE_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <h4 style={{ marginTop: 20 }}>申辦流程</h4>
          <MilestoneFields
            form={form}
            setForm={setForm}
            onDateChange={(key, value) => (key === 'certCompleteDate' ? handleCertCompleteDateChange(value) : setForm({ ...form, [key]: value }))}
          />

          <h4 style={{ marginTop: 20 }}>轉出/離境紀錄</h4>
          <ul className="note-list">
            {form.transferSteps.map((s) => (
              <li key={s.id}>
                <div className="row-actions">
                  <select value={s.status} onChange={(e) => updateTransferStep(s.id, { status: e.target.value })}>
                    {TRANSFER_STEP_STATUS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input type="date" value={s.date || ''} onChange={(e) => updateTransferStep(s.id, { date: e.target.value })} />
                  <button type="button" className="danger" onClick={() => removeTransferStep(s.id)}>刪除</button>
                </div>
              </li>
            ))}
            {form.transferSteps.length === 0 && <li className="muted">尚無紀錄</li>}
          </ul>
          <div className="row-actions">
            <select value={newStepStatus} onChange={(e) => setNewStepStatus(e.target.value)}>
              {TRANSFER_STEP_STATUS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <input type="date" value={newStepDate} onChange={(e) => setNewStepDate(e.target.value)} />
            <button type="button" onClick={addTransferStep}>+ 新增紀錄</button>
          </div>

          <h4 style={{ marginTop: 20 }}>進度圖示</h4>
          <ProgressPipeline p={form} />

          <h4 style={{ marginTop: 20 }}>資料總檔</h4>
          <div className="form-grid">
            {INFO_FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                {f.key === 'workerId' ? (
                  <select value={form.workerId || ''} onChange={(e) => handleWorkerChange(e.target.value)}>
                    <option value="">請選擇</option>
                    {workers.map((w) => <option key={w.id} value={w.id}>{workerLabel(w)}</option>)}
                  </select>
                ) : f.options ? (
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

          <h4 style={{ marginTop: 20 }}>備註</h4>
          <ul className="note-list">
            {form.notes.map((n) => (
              <li key={n.id}>
                {editingNoteId === n.id ? (
                  <div className="row-actions">
                    <input value={editingNoteText} onChange={(e) => setEditingNoteText(e.target.value)} style={{ flex: 1 }} />
                    <button type="button" onClick={saveEditNote}>儲存</button>
                    <button type="button" onClick={() => setEditingNoteId(null)}>取消</button>
                  </div>
                ) : (
                  <div className="row-actions">
                    <span style={{ flex: 1 }}>{n.text}</span>
                    <button type="button" onClick={() => startEditNote(n)}>修改</button>
                    <button type="button" className="danger" onClick={() => deleteNote(n.id)}>刪除</button>
                  </div>
                )}
              </li>
            ))}
            {form.notes.length === 0 && <li className="muted">尚無備註</li>}
          </ul>
          <div className="row-actions">
            <input placeholder="新增備註內容" value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} style={{ flex: 1 }} />
            <button type="button" onClick={addNote}>+ 新增備註</button>
          </div>

          <div className="row-actions" style={{ marginTop: 20 }}>
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
