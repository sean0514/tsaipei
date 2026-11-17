import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { t } from '../../lib/i18n';
import { DEFAULT_CURRENCY, formatMoney, formatMoneyMap } from './constants';

// 內部獎金：每位移工一個案件，獎金不是按月比例分攤，是整個案件固定算一次
// ——招募人員拿「費用計算」裡該移工填的招募者獎金金額；其餘 4 個角色
// （行政(履歷表)/會計人員/外務人員/主管）若這位移工有指派負責人，就拿
// 「內部獎金編輯」設定的固定金額。同一個人可能同時是多位移工的負責人，
// 金額依人員加總——加總依幣別分開算，不轉換成同一個基準幣別（見
// constants.js 的說明），所以同一個人底下可能同時列出好幾種幣別的總額。
const ROLE_DEFS = [
  { workerKey: 'assignedAdminResume', rateKey: 'adminResumeRate', currencyKey: 'adminResumeRateCurrency', label: '行政（履歷表）' },
  { workerKey: 'assignedAccountant', rateKey: 'accountantRate', currencyKey: 'accountantRateCurrency', label: '會計人員' },
  { workerKey: 'assignedFieldStaff', rateKey: 'fieldStaffRate', currencyKey: 'fieldStaffRateCurrency', label: '外務人員' },
  { workerKey: 'assignedSupervisor', rateKey: 'supervisorRate', currencyKey: 'supervisorRateCurrency', label: '主管' },
];

function computeLaborAgencyBonusByPerson(workers, feeSetupRecords, rateDoc) {
  const personTotals = {};
  function addAmount(name, amount, currency, detail) {
    if (!name || !amount) return;
    const entry = (personTotals[name] ||= { name, totals: {}, breakdown: [] });
    entry.totals[currency] = (entry.totals[currency] || 0) + amount;
    entry.breakdown.push(detail);
  }

  workers.forEach((w) => {
    const feeSetup = feeSetupRecords.find((r) => r.workerId === w.id);
    if (feeSetup?.recruiterBonus && w.assignedRecruiter) {
      const amount = Number(feeSetup.recruiterBonus) || 0;
      const currency = feeSetup.currency || DEFAULT_CURRENCY;
      addAmount(w.assignedRecruiter, amount, currency, { worker: w.name, role: '招募人員', amount, currency });
    }
    ROLE_DEFS.forEach(({ workerKey, rateKey, currencyKey, label }) => {
      const name = w[workerKey];
      const rateVal = Number(rateDoc?.[rateKey]) || 0;
      if (!name || !rateVal) return;
      const currency = rateDoc?.[currencyKey] || DEFAULT_CURRENCY;
      addAmount(name, rateVal, currency, { worker: w.name, role: label, amount: rateVal, currency });
    });
  });

  // 不同人可能各自的總額用不同幣別組成，沒辦法互相比較大小來排序
  // （原本是依總額由大到小排序），改成依姓名排序，穩定、不會誤導。
  return Object.values(personTotals).sort((a, b) => a.name.localeCompare(b.name));
}

export default function BonusPage() {
  const { lang } = useOutletContext();
  const { rows: workers, loading: l1 } = useCollection('laborAgency_workers');
  const { rows: feeSetupRecords, loading: l2 } = useCollection('laborAgency_feeSetup');
  const { rows: rateRows, loading: l3 } = useCollection('laborAgency_bonusRateSetup');
  const [q, setQ] = useState('');
  const loading = l1 || l2 || l3;
  const rateDoc = rateRows.find((r) => r.id === 'default');

  const byPerson = computeLaborAgencyBonusByPerson(workers, feeSetupRecords, rateDoc)
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('內部獎金', lang)}</h2>
          <div className="page-desc">{t('依移工案件自動試算：招募人員拿費用計算設定的招募者獎金，其餘角色拿內部獎金編輯設定的固定金額，依人員加總', lang)}</div>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <input placeholder={t('搜尋姓名', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t('依人員加總', lang)}</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>{t('姓名', lang)}</th><th>{t('總額', lang)}</th><th>{t('明細', lang)}</th></tr></thead>
            <tbody>
              {byPerson.map((p) => (
                <tr key={p.name}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td>{formatMoneyMap(p.totals, lang)}</td>
                  <td className="muted">{p.breakdown.map((b) => `${b.worker}(${t(b.role, lang)}) ${formatMoney(b.amount, b.currency, lang)}`).join('、')}</td>
                </tr>
              ))}
              {byPerson.length === 0 && <tr><td colSpan={3} className="muted">{t('沒有資料', lang)}</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
