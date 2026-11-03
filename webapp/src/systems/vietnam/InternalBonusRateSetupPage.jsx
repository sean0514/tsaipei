import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { VN_RATE_ROLE_KEYS, VN_RATE_ROLE_LABELS } from '../../lib/vietnamBonus';
import { t } from '../../lib/i18n';

// 內部獎金的角色費率設定——比照 laborAgency/BonusRateSetupPage.jsx 的做法：
// 全公司統一一筆固定月費率，不分客戶/專案，固定存在
// vietnam_internalBonusRateSetup/default，供「內部獎金計算」試算：每位
// 學生指派了哪個角色，對應角色的負責人就依該學生當月在台天數比例分攤這裡
// 設定的月費率（見 lib/vietnamBonus.js 的 computeVietnamInternalBonusForMonth/
// computeVietnamInternalBonusByPersonForMonth）。
const RATE_FIELDS = VN_RATE_ROLE_KEYS.map((key, i) => ({ key, label: VN_RATE_ROLE_LABELS[i] }));

export default function InternalBonusRateSetupPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'internalBonusRateSetup', role, overrides);
  const { rows, loading } = useCollection('vietnam_internalBonusRateSetup');
  const current = rows.find((r) => r.id === 'default');
  const [form, setForm] = useState({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (current) setForm(current);
  }, [current]);

  async function handleSave(e) {
    e.preventDefault();
    const payload = {};
    RATE_FIELDS.forEach((f) => { payload[f.key] = Number(form[f.key]) || 0; });
    await setDoc(doc(db, 'vietnam_internalBonusRateSetup', 'default'), payload);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('內部獎金設定', lang)}</h2>
          <div className="page-desc">{t('設定開發業務/行政主管/行政招募/行政簽證/外務人員每月固定費率，供「內部獎金計算」依學生當月在台天數比例試算', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 420 }}>
        {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
          <form onSubmit={handleSave}>
            <div className="form-grid">
              {RATE_FIELDS.map((f) => (
                <label key={f.key}>
                  {t(f.label, lang)}（{t('每月', lang)}）
                  <input type="number" min="0" disabled={!canEditPage} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                </label>
              ))}
            </div>
            {canEditPage && (
              <div className="row-actions" style={{ marginTop: 12 }}>
                <button type="submit" className="primary">{t('儲存', lang)}</button>
                {saved && <span className="muted">{t('已儲存', lang)}</span>}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
