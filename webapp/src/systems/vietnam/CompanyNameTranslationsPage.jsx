import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';

// 這個頁面是給管理者手動維護「客戶名稱越南文對照表」：境外生實習系統的
// 職缺/客戶名稱是使用者填的中文專有名詞，機器翻譯不可靠，所以採人工對照
// 而不是自動翻譯——這裡建立的對照，會套用在元凱系統那幾個唯讀同步頁面
// （媒合紀錄、二面進度、錄取名單、辦理簽證提醒、實習文件追蹤、申辦進度
// 追蹤、在台簽證追蹤、預計入台/離台）的客戶分組標題上，查不到對照就照樣
// 顯示中文原文。
export default function CompanyNameTranslationsPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'companyNameTranslations', role, overrides);
  const { rows: translations, loading: loadingTranslations, add, update, remove } = useCollection('vietnam_companyNameTranslations');
  const { rows: positions, loading: loadingPositions } = useCollection('tsaipei_positions');
  const loading = loadingTranslations || loadingPositions;
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');

  const translatedCompanies = new Set(translations.map((r) => r.company));
  const allCompanies = [...new Set(positions.map((p) => p.company).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const untranslatedCompanies = allCompanies.filter((c) => !translatedCompanies.has(c));

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = translations
    .filter((r) => !searchQuery || `${r.company || ''} ${r.viName || ''}`.toLowerCase().includes(searchQuery))
    .sort((a, b) => (a.company || '').localeCompare(b.company || ''));

  async function handleSave(data) {
    const payload = { company: data.company.trim(), viName: data.viName.trim() };
    if (data.id) {
      const { id } = data;
      await update(id, payload);
    } else {
      await add(payload);
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('客戶名稱翻譯', lang)}</h2>
          <div className="page-desc">{t('人工維護境外生實習系統客戶名稱(公司名稱)的越南文對照，套用在媒合紀錄等唯讀同步頁面的客戶分組標題上；查不到對照就照樣顯示中文原文', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增翻譯', lang)}</button>}
      </div>
      <div className="card">
        <input placeholder={t('搜尋客戶名稱/越南文翻譯', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>{t('客戶名稱（中文原文）', lang)}</th><th>{t('越南文翻譯', lang)}</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.company}</td>
                  <td>{r.viName || '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                      <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={3} className="muted">{t('沒有資料', lang)}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {canEditPage && untranslatedCompanies.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>{t('尚未翻譯的客戶', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{untranslatedCompanies.length}</span></h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {untranslatedCompanies.map((c) => (
              <button key={c} onClick={() => setEditing({ company: c, viName: '' })}>{c}</button>
            ))}
          </div>
        </div>
      )}
      {editing && <TranslationFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function TranslationFormModal({ initial, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯翻譯', lang) : t('新增翻譯', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('客戶名稱（中文原文）', lang)}
              <input required value={form.company || ''} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </label>
            <label>
              {t('越南文翻譯', lang)}
              <input required value={form.viName || ''} onChange={(e) => setForm({ ...form, viName: e.target.value })} />
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
