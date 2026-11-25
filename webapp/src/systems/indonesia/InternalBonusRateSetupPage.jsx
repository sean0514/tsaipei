import { Fragment, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { VN_RATE_ROLE_KEYS, VN_RATE_ROLE_LABELS } from '../../lib/indonesiaBonus';
import { t } from '../../lib/i18n';

const RATE_FIELDS = VN_RATE_ROLE_KEYS.map((key, i) => ({ key, label: VN_RATE_ROLE_LABELS[i] }));
const CURRENCIES = ['新台幣', '美金', '越盾'];
const DEFAULT_CURRENCY = '新台幣';

// 內部獎金的角色費率設定——依學校分類，每所學校各自一筆開發業務/行政主管/
// 行政招募/行政簽證/外務人員月費率，學校清單沿用「學校費用設定」
// (indonesia_schoolSetup) 已建檔過的學校。供「內部獎金計算」試算：學生安排
// 「印尼送機行程」後，依自己就讀的學校找到對應費率，一次性計算（不分月、
// 不按天數比例分攤，見 lib/indonesiaBonus.js 的 computeIndonesiaInternalBonusByPerson）。
export default function InternalBonusRateSetupPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'internalBonusRateSetup', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('indonesia_internalBonusRateSetup');
  const { rows: schoolRows, loading: loadingSchools } = useCollection('indonesia_schoolSetup');
  const [editing, setEditing] = useState(null);

  const schoolNames = [...new Set(schoolRows.map((s) => s.name).filter(Boolean))].sort();
  const ratedSchools = new Set(rows.map((r) => r.school));
  const unratedSchools = schoolNames.filter((name) => !ratedSchools.has(name));
  const sortedRows = [...rows].sort((a, b) => (a.school || '').localeCompare(b.school || ''));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      const payload = { school: data.school };
      RATE_FIELDS.forEach((f) => {
        payload[f.key] = Number(data[f.key]) || 0;
        payload[`${f.key}Currency`] = data[`${f.key}Currency`] || DEFAULT_CURRENCY;
      });
      await add(payload);
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('內部獎金設定', lang)}</h2>
          <div className="page-desc">{t('依學校設定開發業務/行政主管/行政招募/行政簽證/外務人員每月固定費率，供「內部獎金計算」依學生就讀學校一次性試算（學生安排送機後才算一次）', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        {canEditPage && unratedSchools.length > 0 && (
          <button className="primary" onClick={() => setEditing({})}>+ {t('新增學校費率', lang)}</button>
        )}
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        {(loading || loadingSchools) ? <p className="muted">{t('載入中…', lang)}</p> : (
          sortedRows.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>{t('尚未設定任何學校的內部獎金費率。', lang)}</p>
          ) : (
            <div className="table-wrap"><table>
              <thead>
                <tr>
                  <th>{t('學校', lang)}</th>
                  {RATE_FIELDS.map((f) => (
                    <Fragment key={f.key}>
                      <th>{t(f.label, lang)}</th>
                      <th>{t('幣別', lang)}</th>
                    </Fragment>
                  ))}
                  {canEditPage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.school}</td>
                    {RATE_FIELDS.map((f) => (
                      <Fragment key={f.key}>
                        <td>{(r[f.key] || 0).toLocaleString()}</td>
                        <td>{t(r[`${f.key}Currency`] || DEFAULT_CURRENCY, lang)}</td>
                      </Fragment>
                    ))}
                    {canEditPage && (
                      <td className="row-actions">
                        <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                        <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table></div>
          )
        )}
      </div>
      {editing && (
        <RateFormModal initial={editing} schoolOptions={unratedSchools} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />
      )}
    </div>
  );
}

function RateFormModal({ initial, schoolOptions, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯學校費率', lang) : t('新增學校費率', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('學校', lang)}
              <select required disabled={!!initial.id} value={form.school || ''} onChange={(e) => setForm({ ...form, school: e.target.value })}>
                <option value="">{t('請選擇', lang)}</option>
                {initial.id && <option value={initial.school}>{initial.school}</option>}
                {schoolOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            {RATE_FIELDS.map((f) => (
              <Fragment key={f.key}>
                <label>
                  {t(f.label, lang)}（{t('每月', lang)}）
                  <input type="number" min="0" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                </label>
                <label>
                  {t(f.label, lang)}{t('幣別', lang)}
                  <select value={form[`${f.key}Currency`] || DEFAULT_CURRENCY} onChange={(e) => setForm({ ...form, [`${f.key}Currency`]: e.target.value })}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{t(c, lang)}</option>)}
                  </select>
                </label>
              </Fragment>
            ))}
          </div>
          <div className="row-actions" style={{ marginTop: 12 }}>
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
