import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

// Ported from the user-supplied 宿舍租賃 spreadsheet — same欄位順序/名稱，日期
// 維持原始的民國年格式（例如 112/02/01）以文字儲存，不轉換成西元日期。
const FIELDS = [
  { key: 'category', label: '科目' },
  { key: 'name', label: '分類' },
  { key: 'address', label: '地址' },
  { key: 'leaseStart', label: '起租日' },
  { key: 'leaseEnd', label: '結束日' },
  { key: 'terminationDate', label: '解約日' },
  { key: 'deposit', label: '押金', type: 'number' },
  { key: 'depositRefundDate', label: '押金退還日' },
  { key: 'rent', label: '金額', type: 'number' },
  { key: 'paymentDay', label: '每月付款時間' },
  { key: 'lesseeName', label: '承租單位名稱' },
  { key: 'contactName', label: '聯絡人' },
  { key: 'contactPhone', label: '電話' },
  { key: 'bankAccountName', label: '帳戶名稱' },
  { key: 'bank', label: '銀行' },
  { key: 'branch', label: '分行' },
  { key: 'branchCode', label: '分支代號' },
  { key: 'bankAccount', label: '帳號' },
  { key: 'notes', label: '備註' },
];
const ROC_DATE_KEYS = ['leaseStart', 'leaseEnd', 'terminationDate', 'depositRefundDate'];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

const HIDDEN_COLUMNS_STORAGE_KEY = 'dormMgmt_leases_hiddenColumns';

// 只是記住這個瀏覽器上次勾選的顯示欄位，不是關鍵資料，讀寫失敗（例如無痕視窗）
// 就忽略，不影響頁面正常運作。
function loadHiddenColumns() {
  try {
    const raw = localStorage.getItem(HIDDEN_COLUMNS_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch { return new Set(); }
}
function saveHiddenColumns(set) {
  try { localStorage.setItem(HIDDEN_COLUMNS_STORAGE_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
}

const EXPIRY_REMINDER_DAYS = 60;

// 租約日期是民國年格式（例如 112/02/01），這裡轉成西元 Date 才能算到期天數。
// 這裡 export 出去讓「宿舍匯款」頁面（RemittancePage.jsx）判斷租約是否落在
// 選定月份內時共用同一套解析邏輯。
export function parseROCDate(str) {
  if (!str) return null;
  const parts = String(str).trim().split('/');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y + 1911, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date - today) / 86400000);
}

function ExpiryTag({ leaseEnd }) {
  const date = parseROCDate(leaseEnd);
  if (!date) return <span className="muted">—</span>;
  const days = daysUntil(date);
  if (days < 0) return <span className="tag tag-red">已到期 {Math.abs(days)} 天</span>;
  if (days <= EXPIRY_REMINDER_DAYS) return <span className="tag tag-amber">即將到期（{days} 天）</span>;
  return <span className="tag tag-green">承租中</span>;
}

export default function LeasesPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'leases', role, overrides);
  const { rows, loading, error, add, update, remove } = useCollection('dormMgmt_leases');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [hiddenColumns, setHiddenColumns] = useState(loadHiddenColumns);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const { handleExport, handleImport } = useCsvOverwrite('dormMgmt_leases', CSV_FIELDS, { entityLabel: '宿舍租賃主檔', canEdit: canEditPage });

  const visibleFields = FIELDS.filter((f) => !hiddenColumns.has(f.key));

  function toggleColumn(key) {
    const next = new Set(hiddenColumns);
    if (next.has(key)) next.delete(key); else next.add(key);
    setHiddenColumns(next);
    saveHiddenColumns(next);
  }

  async function handleDeleteAll() {
    if (rows.length === 0) return;
    const ok = window.confirm(`即將刪除全部 ${rows.length} 筆租賃主檔資料，此動作無法復原，確定要繼續嗎？`);
    if (!ok) return;
    await Promise.all(rows.map((r) => remove(r.id)));
  }

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows.filter((r) => !searchQuery || [r.category, r.name, r.address, r.lesseeName].some((v) => v?.toLowerCase().includes(searchQuery)));

  // 有填「解約日」就視為已退租，跟原始試算表的紀錄習慣一致。
  const active = filteredRows.filter((r) => !r.terminationDate);
  const terminated = filteredRows.filter((r) => r.terminationDate);

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add(data);
    }
    setEditing(null);
  }

  function LeaseTable({ items, showExpiry }) {
    return (
      <div className="table-wrap"><table>
        <thead><tr>{visibleFields.map((f) => <th key={f.key}>{f.label}</th>)}{showExpiry && <th>到期提醒</th>}{canEditPage && <th></th>}</tr></thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              {visibleFields.map((f) => <td key={f.key}>{f.type === 'number' ? (r[f.key] ? Number(r[f.key]).toLocaleString() : '—') : (r[f.key] || '—')}</td>)}
              {showExpiry && <td><ExpiryTag leaseEnd={r.leaseEnd} /></td>}
              {canEditPage && (
                <td className="row-actions">
                  <button onClick={() => setEditing(r)}>編輯</button>
                  <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                </td>
              )}
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={visibleFields.length + (showExpiry ? 1 : 0) + (canEditPage ? 1 : 0)} className="muted">沒有資料</td></tr>}
        </tbody>
      </table></div>
    );
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>宿舍租賃主檔</h2>
          <div className="page-desc">分承租中／已退租（依「解約日」是否填寫判斷），承租中的租約會提示是否即將到期（{EXPIRY_REMINDER_DAYS} 天內）或已到期{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增租約</button>}
          {canEditPage && <button className="danger" onClick={handleDeleteAll}>全部刪除</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有租賃主檔資料，請先下載備份再匯入。日期欄位請維持民國年格式（例如 112/02/01）。</p>}
      <div className="row-actions" style={{ marginBottom: 16 }}>
        <input placeholder="搜尋科目、分類、地址或承租單位" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        <button onClick={() => setShowColumnPicker((v) => !v)}>顯示欄位設定</button>
      </div>
      {showColumnPicker && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
            {FIELDS.map((f) => (
              <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                <input type="checkbox" checked={!hiddenColumns.has(f.key)} onChange={() => toggleColumn(f.key)} />
                {f.label}
              </label>
            ))}
          </div>
        </div>
      )}
      {error ? (
        <p className="muted">讀取失敗，可能是這個帳號還沒有「宿舍租賃主檔」的檢視權限，請聯絡系統管理員確認。（錯誤訊息：{error.message}）</p>
      ) : loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>承租中 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {active.length} 筆</span></h3>
            <div className="card"><LeaseTable items={active} showExpiry /></div>
          </div>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>已退租 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {terminated.length} 筆</span></h3>
            <div className="card"><LeaseTable items={terminated} /></div>
          </div>
        </div>
      )}
      {editing && <LeaseFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function LeaseFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 640 }}>
        <h3>{initial.id ? '編輯租約' : '新增租約'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input type={f.type || 'text'} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={ROC_DATE_KEYS.includes(f.key) ? '例如 112/02/01' : ''} />
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
