import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'name', label: '學校名稱' }, { key: 'schoolRep', label: '學校代表' },
  { key: 'monthlyFee', label: '學校代表獎金月費率' }, { key: 'scholarshipAmount', label: '獎學金金額' },
];
const ROLE_CUSTOM = '__custom__';

// 學校資料建檔：每所學校設定一位「學校代表」負責人＋獎金月費率（給「內部
// 獎金計算」依學生就讀學校、在台天數比例試算），以及這所學校的「獎學金
// 金額」（給「獎學金紀錄」新增時自動帶入）。學校名稱要跟學生資料「就讀
// 學校」欄位的值完全一致才能對上，所以學校名稱改成下拉選單，選項是學生
// 資料「就讀學校」出現過的學校名稱＋這裡已經建檔過的學校名稱，避免兩邊
// 打字不一致對不上；找不到想要的學校（學生資料還沒有這個學校）可以選
// 「自行輸入…」。
export default function SchoolSetupPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'schoolSetup', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('vietnam_schoolSetup');
  const { rows: users } = useCollection('vietnam_users');
  const { rows: students } = useCollection('vietnam_students');
  const schoolOptions = [...new Set([
    ...students.map((s) => s.school).filter(Boolean),
    ...rows.map((r) => r.name).filter(Boolean),
  ])].sort();
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_schoolSetup', CSV_FIELDS, { entityLabel: '學校資料', requiredKeys: ['name'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows
    .filter((r) => !searchQuery || (r.name || '').toLowerCase().includes(searchQuery))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add(data);
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('學校資料建檔', lang)}</h2>
          <div className="page-desc">{t('每所學校設定一位學校代表＋獎金月費率（給內部獎金計算用）、以及獎學金金額（給獎學金紀錄自動帶入）', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增學校', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有學校資料，請先下載備份再匯入。', lang)}</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <input placeholder={t('搜尋學校名稱', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>{t('學校名稱', lang)}</th><th>{t('學校代表', lang)}</th><th>{t('學校代表獎金月費率', lang)}</th><th>{t('獎學金金額', lang)}</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.schoolRep || '—'}</td>
                  <td>{r.monthlyFee || 0}</td>
                  <td>{r.scholarshipAmount || 0}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                      <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={5} className="muted">{t('沒有資料', lang)}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <SchoolFormModal initial={editing} users={users} schoolOptions={schoolOptions} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function SchoolFormModal({ initial, users, schoolOptions, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const staffOptions = [...new Set((users || []).map((u) => u.displayName || u.email).filter(Boolean))].sort();
  const [customRep, setCustomRep] = useState(() => !!(initial.schoolRep && !staffOptions.includes(initial.schoolRep)));
  const [customName, setCustomName] = useState(() => !!(initial.name && !schoolOptions.includes(initial.name)));

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯學校', lang) : t('新增學校', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('學校名稱', lang)}
              {customName ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input required value={form.name || ''} placeholder={t('自行輸入學校名稱', lang)} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <button type="button" onClick={() => { setCustomName(false); setForm({ ...form, name: '' }); }}>{t('改選清單', lang)}</button>
                </div>
              ) : (
                <select
                  required
                  value={form.name || ''}
                  onChange={(e) => {
                    if (e.target.value === ROLE_CUSTOM) { setCustomName(true); setForm({ ...form, name: '' }); }
                    else setForm({ ...form, name: e.target.value });
                  }}
                >
                  <option value="">{t('請選擇', lang)}</option>
                  {schoolOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                  <option value={ROLE_CUSTOM}>{t('自行輸入…', lang)}</option>
                </select>
              )}
            </label>
            <label>
              {t('學校代表', lang)}
              {customRep ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={form.schoolRep || ''} placeholder={t('自行輸入姓名', lang)} onChange={(e) => setForm({ ...form, schoolRep: e.target.value })} />
                  <button type="button" onClick={() => { setCustomRep(false); setForm({ ...form, schoolRep: '' }); }}>{t('改選清單', lang)}</button>
                </div>
              ) : (
                <select
                  value={form.schoolRep || ''}
                  onChange={(e) => {
                    if (e.target.value === ROLE_CUSTOM) { setCustomRep(true); setForm({ ...form, schoolRep: '' }); }
                    else setForm({ ...form, schoolRep: e.target.value });
                  }}
                >
                  <option value="">{t('（未設定）', lang)}</option>
                  {staffOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                  <option value={ROLE_CUSTOM}>{t('自行輸入…', lang)}</option>
                </select>
              )}
            </label>
            <label>
              {t('學校代表獎金月費率', lang)}
              <input type="number" value={form.monthlyFee || ''} onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })} />
            </label>
            <label>
              {t('獎學金金額', lang)}
              <input type="number" value={form.scholarshipAmount || ''} onChange={(e) => setForm({ ...form, scholarshipAmount: e.target.value })} />
            </label>
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
