import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';
import { DEFAULT_CURRENCY, formatMoney, formatMoneyMap, workerEmployerIds, departureInfoOf, BONUS_ROLE_DEFS, departedInMonth } from './constants';

// 內部獎金：依「出境月份」試算，不是看現在系統裡全部符合條件的移工，
// 而是看那位移工是哪個月出境的（出境辦理頁面填的航班時間），一個案件
// 的獎金（招募人員 + 行政(履歷表)/行政表格/會計/外務/主管/經理）整筆
// 算進那個月——還沒出境（沒填航班時間）的移工不會出現在任何月份裡。
// 每個月分開顯示，
// 不是選一個月份切換看。
//
// 招募人員拿「費用計算」裡該移工填的招募者獎金；其餘 6 個角色若這位
// 移工有指派負責人，就拿「內部獎金編輯」(BonusRateSetupPage.jsx) 替
// 這位移工填的固定金額——每位移工各自填，不是全公司共用一筆設定。
// 同一個人可能同時是多位移工的負責人，同一個月內金額依人員加總——
// 加總依幣別分開算，不轉換成同一個基準幣別（見 constants.js 的說明）。
function computeLaborAgencyBonusByPerson(month, workers, feeSetupRecords) {
  const personTotals = {};
  function addAmount(name, amount, currency, detail) {
    if (!name || !amount) return;
    const entry = (personTotals[name] ||= { name, totals: {}, breakdown: [] });
    entry.totals[currency] = (entry.totals[currency] || 0) + amount;
    entry.breakdown.push(detail);
  }

  workers.filter((w) => departedInMonth(w, month)).forEach((w) => {
    const feeSetup = feeSetupRecords.find((r) => r.workerId === w.id);
    if (feeSetup?.recruiterBonus && w.assignedRecruiter) {
      const amount = Number(feeSetup.recruiterBonus) || 0;
      const currency = feeSetup.currency || DEFAULT_CURRENCY;
      addAmount(w.assignedRecruiter, amount, currency, { worker: w.name, role: '招募人員', amount, currency });
    }
    BONUS_ROLE_DEFS.forEach(({ workerKey, rateKey, currencyKey, label }) => {
      const name = w[workerKey];
      const rateVal = Number(w[rateKey]) || 0;
      if (!name || !rateVal) return;
      const currency = w[currencyKey] || DEFAULT_CURRENCY;
      addAmount(name, rateVal, currency, { worker: w.name, role: label, amount: rateVal, currency });
    });
  });

  return Object.values(personTotals).sort((a, b) => a.name.localeCompare(b.name));
}

// 系統裡所有出現過航班時間的月份，加上已經封存過、但現在可能已經沒有
// 任何即時資料對應到的月份（例如航班時間後來被改掉或刪除了）——封存
// 過的月份資料已經固定下來，不該因為原始資料變動就從畫面上消失。
function allMonths(workers, archives) {
  const months = new Set(archives.map((a) => a.month));
  workers.forEach((w) => {
    const ids = workerEmployerIds(w);
    (ids.length ? ids : [null]).forEach((employerId) => {
      const flightTime = departureInfoOf(w, employerId).flightTime;
      if (flightTime) months.add(flightTime.slice(0, 7));
    });
  });
  return [...months].sort().reverse();
}

export default function BonusPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'bonus', role, overrides);
  const { rows: workers, loading: l1 } = useCollection('laborAgency_workers');
  const { rows: feeSetupRecords, loading: l2 } = useCollection('laborAgency_feeSetup');
  const { rows: archives, add: addArchive, remove: removeArchive, loading: l4 } = useCollection('laborAgency_bonusArchives');
  const [q, setQ] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const loading = l1 || l2 || l4;

  const allMonthKeys = allMonths(workers, archives);
  const months = monthFilter ? allMonthKeys.filter((m) => m === monthFilter) : allMonthKeys;

  // 封存：把當月算出來的依人員加總明細固定下來，之後移工的出境時間、
  // 指派負責人、費用計算、內部獎金編輯等原始資料再怎麼改，這個月的
  // 獎金數字都維持封存當下的樣子，直到按「取消封存」解除——避免薪資
  // 已經發放後，原始資料事後修正又讓歷史月份的獎金數字變動。
  async function handleArchive(month) {
    const data = computeLaborAgencyBonusByPerson(month, workers, feeSetupRecords);
    if (!data.length) { alert(t('這個月沒有可計算的獎金資料，無法封存', lang)); return; }
    try {
      await addArchive({ month, data: JSON.stringify(data), lockedAt: new Date().toISOString() });
    } catch (err) {
      alert(`${t('封存失敗', lang)}：${err.message || err}`);
    }
  }

  async function handleUnlock(archive) {
    if (!window.confirm(`${t('確定要取消封存這個月份的內部獎金計算嗎？取消後會改回即時重算的數字。', lang)}`)) return;
    try {
      await removeArchive(archive.id);
    } catch (err) {
      alert(`${t('取消封存失敗', lang)}：${err.message || err}`);
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('內部獎金', lang)}</h2>
          <div className="page-desc">{t('依移工出境月份自動試算：招募人員拿費用計算設定的招募者獎金，其餘角色拿內部獎金編輯設定的固定金額，依人員加總；每個月分開顯示，可各自封存', lang)}</div>
        </div>
      </div>
      <div className="row-actions" style={{ marginBottom: 12 }}>
        <input placeholder={t('搜尋姓名', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="">{t('全部月份', lang)}</option>
          {allMonthKeys.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : months.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>{t('目前沒有任何移工的出境紀錄，無法試算內部獎金', lang)}</p></div>
      ) : months.map((month) => {
        const archive = archives.find((a) => a.month === month);
        const byPerson = (archive ? JSON.parse(archive.data) : computeLaborAgencyBonusByPerson(month, workers, feeSetupRecords))
          .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
        return (
          <div className="card" key={month} style={{ marginBottom: 16 }}>
            <div className="row-actions" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>{month}</h3>
              <div className="row-actions">
                {archive ? <span className="tag tag-green">{t('已封存', lang)}</span> : <span className="muted status-text">{t('即時試算', lang)}</span>}
                {canEditPage && (archive
                  ? <button onClick={() => handleUnlock(archive)}>{t('取消封存', lang)}</button>
                  : <button className="primary" onClick={() => handleArchive(month)}>{t('封存本月', lang)}</button>)}
              </div>
            </div>
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
        );
      })}
    </div>
  );
}
