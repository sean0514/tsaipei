import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { ROLE_FIELDS } from './PositionsPage';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'projectCode', label: '專案編號' }, { key: 'client', label: '客戶名稱' },
  ...ROLE_FIELDS,
];

// 複製自 systems/tsaipei/InternalFeeSetupPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function InternalFeeSetupPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'internalFeeSetup', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('vietnam_internalFeeSetup');
  const { rows: positions } = useCollection('vietnam_positions');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_internalFeeSetup', CSV_FIELDS, { entityLabel: '內部費用建檔', requiredKeys: ['projectCode', 'client'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows
    .filter((r) => !searchQuery || `${r.projectCode || ''} ${r.client || ''}`.toLowerCase().includes(searchQuery))
    .sort((a, b) => (a.projectCode || '').localeCompare(b.projectCode || ''));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add(data);
    }
    setEditing(null);
  }

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
          <h2>{t('內部費用建檔', lang)}</h2>
          <div className="page-desc">{t('依專案設定各客戶底下各職務的內部費用金額', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增費率', lang)}</button>}
          {canEditPage && <button onClick={handleCopyFromPositions}>{t('從實習單位複製帶入', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有內部費用設定，請先下載備份再匯入。', lang)}</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <p className="muted" style={{ marginTop: 0 }}>{t('「內部獎金計算」的費率來源，一個專案＋客戶一列，不是計算結果本身。', lang)}</p>
        <input placeholder={t('搜尋專案編號或客戶', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>{t('專案編號', lang)}</th><th>{t('客戶', lang)}</th>{ROLE_FIELDS.map((f) => <th key={f.key}>{t(f.label, lang)}</th>)}{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.projectCode}</td>
                  <td>{r.client}</td>
                  {ROLE_FIELDS.map((f) => <td key={f.key}>{r[f.key] || 0}</td>)}
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                      <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={ROLE_FIELDS.length + 3} className="muted">{t('沒有資料', lang)}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <FeeFormModal initial={editing} positions={positions} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function FeeFormModal({ initial, positions, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const projectCodes = [...new Set(positions.map((p) => p.projectCode).filter(Boolean))].sort();
  const companies = [...new Set(positions.map((p) => p.company).filter(Boolean))].sort();
  if (form.client && !companies.includes(form.client)) companies.push(form.client);
  const companyByProjectCode = {};
  positions.forEach((p) => { if (p.projectCode && p.company && !companyByProjectCode[p.projectCode]) companyByProjectCode[p.projectCode] = p.company; });

  function handleProjectCodeChange(code) {
    setForm({ ...form, projectCode: code, client: companyByProjectCode[code] || form.client });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯費率', lang) : t('新增費率', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('專案編號', lang)}
              <select value={form.projectCode || ''} onChange={(e) => handleProjectCodeChange(e.target.value)}>
                <option value="">{t('請選擇', lang)}</option>
                {projectCodes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              {t('客戶名稱', lang)}
              <select required value={form.client || ''} onChange={(e) => setForm({ ...form, client: e.target.value })}>
                <option value="">{t('請選擇客戶', lang)}</option>
                {companies.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {ROLE_FIELDS.map((f) => (
              <label key={f.key}>
                {t(f.label, lang)}（{t('每月', lang)}）
                <input type="number" value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="row-actions">
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
