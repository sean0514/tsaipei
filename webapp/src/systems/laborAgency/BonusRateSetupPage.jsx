import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';
import {
  CURRENCIES, DEFAULT_CURRENCY, BONUS_ROLE_DEFS, reachedArrivalNotice, departedInMonth,
  workerEmployerIds, departureInfoOf,
} from './constants';

const NO_MONTH_KEY = '__no_month__';

// 兩個「行政」角色在移工管理的指派欄位/BonusPage.jsx 的明細裡沿用
// 「行政（履歷表）」「行政表格」這兩個既有說法；這個編輯頁面單獨用
// 更清楚的說法區分兩者負責的工作內容，不是改角色本身，只是這一頁
// 顯示用的標籤。
const LABEL_OVERRIDES = {
  assignedAdminResume: '行政（負責履歷表）',
  assignedAdminForm: '行政（負責客戶）',
};

// 「內部獎金編輯」原本是一筆全公司統一的每案固定金額設定；改成名單
// 式——自動帶入已經到「入境通知」階段的移工（reachedArrivalNotice，
// 跟 ArrivalNoticePage.jsx 判斷名單的條件一致），每位移工各自填 6 個
// 角色（招募人員另外在「費用計算」填，不在這裡）各自的金額跟幣別，
// 直接存在移工文件本身（跟 BONUS_ROLE_DEFS 共用同一組欄位名稱，見
// constants.js），不是全公司共用一筆。名單依出境月份分類顯示，理由
// 跟「內部獎金」(BonusPage.jsx) 一樣——沒有出境月份（還沒填航班時間）
// 的移工另外歸在「尚未填出境月份」。
function monthsForWorkers(workers) {
  const months = new Set();
  let hasNoMonth = false;
  workers.forEach((w) => {
    const ids = workerEmployerIds(w);
    const pairs = ids.length ? ids : [null];
    const workerMonths = pairs.map((employerId) => (departureInfoOf(w, employerId).flightTime || '').slice(0, 7)).filter(Boolean);
    if (workerMonths.length) workerMonths.forEach((m) => months.add(m));
    else hasNoMonth = true;
  });
  const sorted = [...months].sort().reverse();
  return hasNoMonth ? [...sorted, NO_MONTH_KEY] : sorted;
}

function workersInMonth(workers, month) {
  if (month === NO_MONTH_KEY) {
    return workers.filter((w) => {
      const ids = workerEmployerIds(w);
      const pairs = ids.length ? ids : [null];
      return !pairs.some((employerId) => departureInfoOf(w, employerId).flightTime);
    });
  }
  return workers.filter((w) => departedInMonth(w, month));
}

// 金額欄位原本每打一個字就立刻非同步寫一次 Firestore，會有跟
// VisaProcessingPage.jsx 的 DigitsInput 同樣的競態問題（打字打到一半
// 被外部資料蓋掉）——這裡用同一套做法：本地狀態即時顯示，停止輸入
// 400ms 後才寫一次，失焦時立刻補寫。
function AmountInput({ value, onChange, style }) {
  const [local, setLocal] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!focused) setLocal(value ?? '');
  }, [value, focused]);

  function commit(v) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), 400);
  }
  function handleChange(e) {
    setLocal(e.target.value);
    commit(e.target.value);
  }
  function handleBlur() {
    setFocused(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      onChange(local);
    }
  }

  return (
    <input
      type="number" min="0" value={local}
      onFocus={() => setFocused(true)} onBlur={handleBlur} onChange={handleChange}
      style={style}
    />
  );
}

export default function BonusRateSetupPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'bonusRateSetup', role, overrides);
  const { rows: workers, loading, update } = useCollection('laborAgency_workers');
  const [q, setQ] = useState('');

  const qualifying = workers.filter(reachedArrivalNotice);
  const searchQuery = q.trim().toLowerCase();
  const filtered = searchQuery ? qualifying.filter((w) => (w.name || '').toLowerCase().includes(searchQuery)) : qualifying;
  const months = monthsForWorkers(filtered);

  async function handleField(workerId, key, value) {
    await update(workerId, { [key]: value });
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('內部獎金編輯', lang)}</h2>
          <div className="page-desc">{t('自動列出已到「入境通知」階段的移工，依出境月份分類，每位移工各自填寫行政（負責履歷表）/行政（負責客戶）/會計人員/外務人員/主管/經理的獎金金額與幣別（招募人員的獎金在「費用計算」每位移工各自填），供「內部獎金」試算', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          <input placeholder={t('搜尋姓名', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        months.length === 0 ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>{t('目前沒有已到入境通知階段的移工', lang)}</p></div>
        ) : months.map((month) => {
          const monthWorkers = workersInMonth(filtered, month)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          return (
            <div key={month} style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 10 }}>
                {month === NO_MONTH_KEY ? t('尚未填出境月份', lang) : month}
                <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>（{monthWorkers.length}）</span>
              </h3>
              <div className="card" style={{ overflowX: 'auto' }}>
                <div className="table-wrap"><table>
                  <thead>
                    <tr>
                      <th>{t('姓名', lang)}</th>
                      {BONUS_ROLE_DEFS.map((r) => <th key={r.workerKey}>{t(LABEL_OVERRIDES[r.workerKey] || r.label, lang)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {monthWorkers.map((w) => (
                      <tr key={w.id}>
                        <td style={{ fontWeight: 600 }}>{w.name}</td>
                        {BONUS_ROLE_DEFS.map(({ workerKey, rateKey, currencyKey }) => (
                          <td key={workerKey}>
                            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{w[workerKey] || '—'}</div>
                            <div className="row-actions" style={{ gap: 4 }}>
                              {canEditPage ? (
                                <AmountInput
                                  value={w[rateKey]}
                                  onChange={(v) => handleField(w.id, rateKey, Number(v) || 0)}
                                  style={{ width: 80 }}
                                />
                              ) : (
                                <span>{w[rateKey] || 0}</span>
                              )}
                              <select
                                disabled={!canEditPage}
                                value={w[currencyKey] || DEFAULT_CURRENCY}
                                onChange={(e) => handleField(w.id, currencyKey, e.target.value)}
                                style={{ width: 'auto' }}
                              >
                                {CURRENCIES.map((c) => <option key={c} value={c}>{t(c, lang)}</option>)}
                              </select>
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                    {monthWorkers.length === 0 && <tr><td colSpan={1 + BONUS_ROLE_DEFS.length} className="muted">{t('沒有資料', lang)}</td></tr>}
                  </tbody>
                </table></div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
