import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { useColumnVisibility } from '../../lib/useColumnVisibility';
import ColumnPicker from '../../components/ColumnPicker';
import { deleteWorkerCascade } from '../../lib/yujianCascade';

export const WORKER_STATUS = ['待媒合', '媒合中', '已媒合', '在職中', '已離境', '取消'];
const NATIONALITIES = ['印尼', '菲律賓', '越南', '泰國'];
export const WORK_TYPES = ['家庭看護工', '家庭幫傭'];

const FIELDS = [
  { key: 'chineseName', label: '中文姓名', required: true },
  { key: 'originalName', label: '護照姓名' },
  { key: 'nationality', label: '國籍', options: NATIONALITIES },
  { key: 'gender', label: '性別', options: ['男', '女'] },
  { key: 'birthDate', label: '出生日期', type: 'date' },
  { key: 'passportNumber', label: '護照號碼' },
  { key: 'phone', label: '聯絡電話' },
  { key: 'workType', label: '工作類型', options: WORK_TYPES },
  { key: 'foreignAgency', label: '國外仲介' },
  { key: 'entryDate', label: '入境日期', type: 'date' },
  { key: 'status', label: '狀態', options: WORKER_STATUS },
  { key: 'notes', label: '備註' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

export default function WorkersPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'workers', role, overrides);
  const { rows, loading, add, update } = useCollection('yujian_workers');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('yujian_workers', CSV_FIELDS, { entityLabel: '看護/家事人員資料', requiredKeys: ['chineseName'], canEdit: canEditPage });
  // 國外仲介當成分類的群組標題，不用再重複顯示同一欄。
  const rowFields = FIELDS.filter((f) => f.key !== 'foreignAgency');
  const { visibleKeys, toggleColumn } = useColumnVisibility(rowFields);

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows.filter((r) => !searchQuery || `${r.chineseName || ''} ${r.originalName || ''} ${r.nationality || ''}`.toLowerCase().includes(searchQuery));
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
  async function handleSave(data) {
    const payload = { ...data };
    const prevEntryDate = editing?.entryDate || '';
    if (payload.entryDate && !prevEntryDate && ['待媒合', '媒合中', '已媒合'].includes(payload.status)) {
      payload.status = '在職中';
    }
    if (payload.id) {
      const { id, ...rest } = payload;
      await update(id, rest);
    } else {
      const ref = await add({ status: '待媒合', ...payload });
      await addDoc(collection(db, 'yujian_matches'), { workerId: ref.id, employerId: '', status: '媒合中' });
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
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增人員</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有人員資料，請先下載備份再匯入。</p>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'start', marginBottom: 12, flexWrap: 'wrap' }}>
        <input placeholder="搜尋姓名或國籍" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
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
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
