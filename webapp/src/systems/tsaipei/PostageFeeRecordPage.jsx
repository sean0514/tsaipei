import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { exportEntityCSV } from '../../lib/csv';

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

const STATUSES = ['待審核', '已核准', '已匯款', '退回'];
// 已匯款之後的「封存」只開放財務人員（跟系統管理員）能按，跟日常支出
// 申請／國外補助申請同一套規則。
const ARCHIVE_ROLES = ['系統管理員', '財務人員'];

const FIELDS = [
  { key: 'serialNumber', label: '編號' },
  { key: 'shipDate', label: '寄件日期', type: 'date' },
  { key: 'trackingNumber', label: '寄件編號' },
  { key: 'senderName', label: '寄件人' },
  { key: 'senderPhone', label: '電話(寄件人)' },
  { key: 'recipientName', label: '收件人' },
  { key: 'recipientPhone', label: '電話(收件人)' },
  { key: 'address', label: '地址' },
  { key: 'documentContent', label: '文件內容' },
  { key: 'amount', label: '金額', type: 'number' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'status', label: '狀態' }, { key: 'confirmedClosed', label: '結案' }, { key: 'archived', label: '封存' }];

export default function PostageFeeRecordPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'postageFee', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_postageFeeRecords');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [month, setMonth] = useState(currentMonthStr());
  const [showClosed, setShowClosed] = useState(false);
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_postageFeeRecords', CSV_FIELDS, { entityLabel: '郵資費用紀錄', requiredKeys: ['trackingNumber'], canEdit: canEditPage });

  function handleDownloadMonth() {
    const monthRows = rows.filter((r) => (r.shipDate || '').slice(0, 7) === month);
    exportEntityCSV(monthRows, CSV_FIELDS, `郵資費用紀錄_${month}`);
  }

  const canArchive = () => canEditPage && ARCHIVE_ROLES.includes(role);

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows
    .filter((r) => !r.confirmedClosed && !r.archived)
    .filter((r) => !searchQuery || `${r.trackingNumber || ''} ${r.senderName || ''} ${r.recipientName || ''} ${r.documentContent || ''}`.toLowerCase().includes(searchQuery));
  const groups = { 待審核: [], 已核准: [], 已匯款: [], 退回: [] };
  filtered.forEach((r) => groups[STATUSES.includes(r.status) ? r.status : '待審核'].push(r));
  STATUSES.forEach((s) => groups[s].sort((a, b) => (b.shipDate || '').localeCompare(a.shipDate || '')));

  // 結案/封存後從上面分類清單隱藏，但不是完全查不到——「顯示已結案/封存」
  // 收合區塊點開才會渲染，不用下載完整資料 CSV 再自己篩選。
  const closedList = rows.filter((r) => r.confirmedClosed || r.archived).sort((a, b) => (b.shipDate || '').localeCompare(a.shipDate || ''));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ status: '待審核', ...data });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>郵資費用紀錄</h2>
          <div className="page-desc">依待審核／已核准／已匯款／退回分類；已核准的紀錄可以按「結案」歸檔，已匯款的紀錄可以按「封存」歸檔（僅財務人員／系統管理員），結案或封存後從列表隱藏（資料還在，下載完整資料時仍會包含）{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增紀錄</button>}
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button onClick={handleDownloadMonth}>下載此月份資料</button>
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有郵資費用紀錄，請先下載備份再匯入。「下載此月份資料」依「寄件日期」篩選。</p>}
      <div className="row-actions" style={{ marginBottom: 16 }}>
        <input placeholder="搜尋寄件編號、寄件人、收件人或文件內容" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />
        <button onClick={() => setShowClosed(!showClosed)}>{showClosed ? '隱藏' : '顯示'}已結案／已封存（{closedList.length}）</button>
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {STATUSES.map((status) => (
            <div className="card" key={status} style={{ overflowX: 'auto' }}>
              <h3 style={{ marginTop: 0 }}>{status}（{groups[status].length}）</h3>
              <div className="table-wrap"><table>
                <thead><tr>
                  <th>編號</th><th>寄件日期</th><th>寄件編號</th><th>寄件人</th><th>電話</th>
                  <th>收件人</th><th>電話</th><th>地址</th><th>文件內容</th><th>金額</th>{canEditPage && <th></th>}
                </tr></thead>
                <tbody>
                  {groups[status].map((r) => (
                    <tr key={r.id}>
                      <td>{r.serialNumber || '—'}</td>
                      <td>{r.shipDate || '—'}</td>
                      <td>{r.trackingNumber || '—'}</td>
                      <td>{r.senderName || '—'}</td>
                      <td>{r.senderPhone || '—'}</td>
                      <td>{r.recipientName || '—'}</td>
                      <td>{r.recipientPhone || '—'}</td>
                      <td>{r.address || '—'}</td>
                      <td>{r.documentContent || '—'}</td>
                      <td>{r.amount ? Number(r.amount).toLocaleString() : '—'}</td>
                      {canEditPage && (
                        <td className="row-actions">
                          {status === '待審核' && (
                            <>
                              <button onClick={() => update(r.id, { status: '已核准' })}>已核准</button>
                              <button onClick={() => update(r.id, { status: '已匯款' })}>已匯款</button>
                              <button onClick={() => update(r.id, { status: '退回' })}>退回</button>
                            </>
                          )}
                          {status === '已核准' && (
                            <>
                              <button onClick={() => update(r.id, { status: '已匯款' })}>已匯款</button>
                              <button onClick={() => update(r.id, { status: '待審核' })}>退回(回到待審核)</button>
                            </>
                          )}
                          {status === '已匯款' && (
                            <button onClick={() => update(r.id, { status: '已核准' })}>退回(回到已核准)</button>
                          )}
                          {status === '退回' && STATUSES.filter((s) => s !== status).map((s) => (
                            <button key={s} onClick={() => update(r.id, { status: s })}>{s}</button>
                          ))}
                          <button onClick={() => setEditing(r)}>編輯</button>
                          {status === '已核准' && <button onClick={() => update(r.id, { confirmedClosed: true })}>結案</button>}
                          {status === '已匯款' && canArchive() && <button onClick={() => update(r.id, { archived: true })}>封存</button>}
                          <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {groups[status].length === 0 && <tr><td colSpan={canEditPage ? 11 : 10} className="muted">沒有資料</td></tr>}
                </tbody>
              </table></div>
            </div>
          ))}
        </div>
      )}
      {!loading && showClosed && (
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>已結案／已封存 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{closedList.length} 筆</span></h3>
          <div className="table-wrap"><table>
            <thead><tr>
              <th>編號</th><th>寄件日期</th><th>寄件編號</th><th>寄件人</th><th>收件人</th><th>文件內容</th><th>金額</th><th>狀態</th>{canEditPage && <th></th>}
            </tr></thead>
            <tbody>
              {closedList.map((r) => (
                <tr key={r.id}>
                  <td>{r.serialNumber || '—'}</td>
                  <td>{r.shipDate || '—'}</td>
                  <td>{r.trackingNumber || '—'}</td>
                  <td>{r.senderName || '—'}</td>
                  <td>{r.recipientName || '—'}</td>
                  <td>{r.documentContent || '—'}</td>
                  <td>{r.amount ? Number(r.amount).toLocaleString() : '—'}</td>
                  <td>{r.archived ? '已封存' : '已結案'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      {r.confirmedClosed && <button onClick={() => update(r.id, { confirmedClosed: false })}>取消結案</button>}
                      {r.archived && canArchive() && <button onClick={() => update(r.id, { archived: false })}>取消封存</button>}
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {closedList.length === 0 && <tr><td colSpan={canEditPage ? 9 : 8} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}
      {editing && <PostageFeeFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function PostageFeeFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯郵資紀錄' : '新增郵資紀錄'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
            {initial.id && (
              <label>
                狀態
                <select value={form.status || '未匯款'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            )}
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
