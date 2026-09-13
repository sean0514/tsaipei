import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { ROLE_FIELDS } from './PositionsPage';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'projectCode', label: '專案編號' }, { key: 'client', label: '客戶名稱' },
  ...ROLE_FIELDS,
];

export default function InternalFeeSetupPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'bonus', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_internalFeeSetup');
  const { rows: positions } = useCollection('tsaipei_positions');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_internalFeeSetup', CSV_FIELDS, { entityLabel: '內部費用建檔', requiredKeys: ['projectCode', 'client'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows.filter((r) => !searchQuery || `${r.projectCode || ''} ${r.client || ''}`.toLowerCase().includes(searchQuery));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add(data);
    }
    setEditing(null);
  }

  // 把「實習單位」裡有、但這裡還沒有的專案編號＋公司名稱直接複製成新的一列，
  // 使用者再補上費用金額即可，不用手動一筆一筆新增選擇。
  async function handleCopyFromPositions() {
    const existing = new Set(rows.map((r) => r.projectCode));
    const seen = new Set();
    const toAdd = [];
    positions.forEach((p) => {
      if (!p.projectCode || !p.company) return;
      if (existing.has(p.projectCode) || seen.has(p.projectCode)) return;
      seen.add(p.projectCode);
      toAdd.push({ projectCode: p.projectCode, client: p.company });
    });
    if (toAdd.length === 0) { alert('實習單位裡的專案編號都已經在這裡了，沒有新的可以帶入。'); return; }
    for (const item of toAdd) await add(item);
    alert(`已從實習單位複製帶入 ${toAdd.length} 筆，請補上費用金額。`);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>內部費用建檔</h2>
          <div className="page-desc">依專案設定各客戶底下各職務的內部費用金額{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增費率</button>}
          {canEditPage && <button onClick={handleCopyFromPositions}>從實習單位複製帶入</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有內部費用設定，請先下載備份再匯入。</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <p className="muted" style={{ marginTop: 0 }}>「內部獎金計算」的費率來源，一個專案＋客戶一列，不是計算結果本身。</p>
        <input placeholder="搜尋專案編號或客戶" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>專案編號</th><th>客戶</th>{ROLE_FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.projectCode}</td>
                  <td>{r.client}</td>
                  {ROLE_FIELDS.map((f) => <td key={f.key}>{r[f.key] || 0}</td>)}
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={ROLE_FIELDS.length + 3} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <FeeFormModal initial={editing} positions={positions} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function FeeFormModal({ initial, positions, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const projectCodes = [...new Set(positions.map((p) => p.projectCode).filter(Boolean))].sort();
  const companies = [...new Set(positions.map((p) => p.company).filter(Boolean))].sort();
  if (form.client && !companies.includes(form.client)) companies.push(form.client);
  // 專案編號在「實習單位」裡已經跟公司名稱綁在一起，選了專案編號就自動帶入對應公司。
  const companyByProjectCode = {};
  positions.forEach((p) => { if (p.projectCode && p.company && !companyByProjectCode[p.projectCode]) companyByProjectCode[p.projectCode] = p.company; });

  function handleProjectCodeChange(code) {
    setForm({ ...form, projectCode: code, client: companyByProjectCode[code] || form.client });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯費率' : '新增費率'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              專案編號
              <select value={form.projectCode || ''} onChange={(e) => handleProjectCodeChange(e.target.value)}>
                <option value="">請選擇</option>
                {projectCodes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              客戶名稱
              <select required value={form.client || ''} onChange={(e) => setForm({ ...form, client: e.target.value })}>
                <option value="">請選擇客戶</option>
                {companies.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {ROLE_FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}（每月）
                <input type="number" value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
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
