import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';

// 內部獎金的角色費率設定——「招募人員」的獎金金額直接在「費用計算」每位
// 移工各自填固定金額，不是公司統一費率；這裡只設定其餘 4 個角色（行政
// (履歷表)/會計人員/外務人員/主管）每案固定發放的獎金金額，全公司統一
// 一筆設定，固定存在 laborAgency_bonusRateSetup/default，供「內部獎金」
// 頁面試算：每位移工指派了哪個角色，對應角色的負責人就拿到這裡設定的
// 金額（不是按月比例分攤，是整個案件固定一筆）。
const RATE_FIELDS = [
  { key: 'adminResumeRate', label: '行政（履歷表）' },
  { key: 'accountantRate', label: '會計人員' },
  { key: 'fieldStaffRate', label: '外務人員' },
  { key: 'supervisorRate', label: '主管' },
];

export default function BonusRateSetupPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'bonusRateSetup', role, overrides);
  const { rows, loading } = useCollection('laborAgency_bonusRateSetup');
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
    await setDoc(doc(db, 'laborAgency_bonusRateSetup', 'default'), payload);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('內部獎金編輯', lang)}</h2>
          <div className="page-desc">{t('設定行政（履歷表）/會計人員/外務人員/主管每個案件固定發放的獎金金額（招募人員的獎金在「費用計算」每位移工各自填），供「內部獎金」試算', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 420 }}>
        {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
          <form onSubmit={handleSave}>
            <div className="form-grid">
              {RATE_FIELDS.map((f) => (
                <label key={f.key}>
                  {t(f.label, lang)}（{t('每案', lang)}）
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
