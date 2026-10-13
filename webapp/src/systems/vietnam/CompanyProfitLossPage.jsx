import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import {
  computeClientBillingForMonth, computeInternalBonusForMonth, computeDormManagerBonusForMonth,
  computeDormProfitLossForYear, sumDormProfitLossGroups, PROJECT_CLIENT_BONUS_ROLE_KEYS,
  monthRange, dateOverlapDays, currentYear,
} from '../../lib/bonus';
import { exportEntityCSV } from '../../lib/csv';
import { t } from '../../lib/i18n';

const DAILY_EXPENSE_BILLABLE_STATUSES = ['已核准', '已匯款'];
const DORM_EQUIPMENT_ITEM = '宿舍設備';
const DEFAULT_EXPENSE_ITEM_LABELS = ['內部人員薪資', '內部人員保費'];

const LINE_ITEMS = [
  { key: 'serviceIncome', label: '服務費收入(辦件費+服務費)' },
  { key: 'dailyExpenseReimbursementIncome', label: '代墊費用收入(日常支出申請已請款客戶部分，鈞羽+供應商)' },
  { key: 'taxIncome', label: '營業稅收入(5%，向客戶收取)' },
  { key: 'dormIncome', label: '宿舍收入(廠商代付宿舍費/宿管費+學生自付房租+宿舍設備)' },
  { key: 'otherIncome', label: '其他收入(日常支出申請-收入類)' },
  { key: 'customIncomeTotal', label: '自訂收入項目合計(明細見下方)' },
  { key: 'income', label: '收入合計', bold: true },
  { key: 'otherExpense', label: '其他支出(日常支出申請-支出類，含已請款客戶部分的實際花費)' },
  { key: 'dormCost', label: '宿舍成本(租金/房仲費/押金損失/水電瓦斯)' },
  { key: 'taxExpense', label: '營業稅支出(5%，繳納政府)' },
  { key: 'foreignPaymentExpense', label: '國外付款支出' },
  { key: 'postageFeeExpense', label: '郵資費用支出' },
  { key: 'projectBonusExpense', label: '內部獎金支出(專案角色)' },
  { key: 'dormManagerBonusExpense', label: '宿管獎金支出' },
  { key: 'dormProfitBonusExpense', label: '宿舍分紅(利潤×20%)' },
  { key: 'customExpenseTotal', label: '自訂支出項目合計(含內部人員薪資/保費，明細見下方)' },
  { key: 'cost', label: '支出合計', bold: true },
  { key: 'profit', label: '損益', bold: true, signed: true },
];

function fmt(n) {
  return (n || 0).toLocaleString();
}

function monthStrOf(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function availableYears(ctx) {
  const years = new Set([currentYear()]);
  const addYearFromDate = (dateStr) => {
    const y = parseInt((dateStr || '').slice(0, 4), 10);
    if (y) years.add(y);
  };
  (ctx.dailyExpenseApplications || []).forEach((app) => addYearFromDate(app.date));
  (ctx.foreignPayments || []).forEach((p) => {
    addYearFromDate(p.paymentDate);
    addYearFromDate(p.foreignRefund1Date); addYearFromDate(p.foreignRefund2Date); addYearFromDate(p.foreignRefund3Date);
  });
  (ctx.housingRecords || []).forEach((h) => { addYearFromDate(h.checkIn); addYearFromDate(h.checkOut); });
  (ctx.dormitories || []).forEach((d) => { addYearFromDate(d.leaseStart); addYearFromDate(d.depositRefundDate); });
  (ctx.postageFeeRecords || []).forEach((r) => addYearFromDate(r.shipDate));
  return Array.from(years).sort((a, b) => b - a);
}

function PnlTable({ monthly, yearTotal, lang }) {
  const monthLabels = Array.from({ length: 12 }, (_, i) => `${i + 1}${t('月', lang)}`);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>{t('損益細項', lang)}</th>{monthLabels.map((l) => <th key={l}>{l}</th>)}<th>{t('合計', lang)}</th></tr>
        </thead>
        <tbody>
          {LINE_ITEMS.map((item) => (
            <tr key={item.key}>
              <td style={{ fontWeight: item.bold ? 600 : 400 }}>{t(item.label, lang)}</td>
              {monthly.map((m) => (
                <td key={m.month} style={{ fontWeight: item.bold ? 600 : 400, color: item.signed && m[item.key] < 0 ? 'var(--danger)' : undefined }}>
                  {fmt(m[item.key])}
                </td>
              ))}
              <td style={{ fontWeight: 600, color: item.signed && yearTotal[item.key] < 0 ? 'var(--danger)' : undefined }}>{fmt(yearTotal[item.key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomItemsTable({ items, amounts, year, canEditPage, onChangeAmount, onDelete, lang }) {
  const monthLabels = Array.from({ length: 12 }, (_, i) => `${i + 1}${t('月', lang)}`);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>{t('項目', lang)}</th>{monthLabels.map((l) => <th key={l}>{l}</th>)}<th>{t('合計', lang)}</th>{canEditPage && <th></th>}</tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const monthlyAmounts = monthLabels.map((_, i) => {
              const monthStr = monthStrOf(year, i + 1);
              return Number(amounts.find((a) => a.itemId === item.id && a.month === monthStr)?.amount) || 0;
            });
            const total = monthlyAmounts.reduce((sum, n) => sum + n, 0);
            return (
              <tr key={item.id}>
                <td>{item.label}</td>
                {monthlyAmounts.map((amt, i) => {
                  const monthStr = monthStrOf(year, i + 1);
                  return (
                    <td key={monthStr}>
                      {canEditPage ? (
                        <input
                          key={`${item.id}-${monthStr}`}
                          type="number"
                          defaultValue={amt || ''}
                          onBlur={(e) => onChangeAmount(item.id, monthStr, e.target.value)}
                          style={{ width: 72 }}
                        />
                      ) : fmt(amt)}
                    </td>
                  );
                })}
                <td style={{ fontWeight: 600 }}>{fmt(total)}</td>
                {canEditPage && <td><button onClick={() => onDelete(item)}>{t('刪除', lang)}</button></td>}
              </tr>
            );
          })}
          {items.length === 0 && <tr><td colSpan={14} className="muted">{t('尚未新增項目', lang)}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function otherDailyExpenseTotals(monthStr, dailyExpenseApplications) {
  let otherIncome = 0;
  let otherExpense = 0;
  (dailyExpenseApplications || []).forEach((app) => {
    if (app.item === DORM_EQUIPMENT_ITEM) return;
    if (!DAILY_EXPENSE_BILLABLE_STATUSES.includes(app.status)) return;
    if ((app.date || '').slice(0, 7) !== monthStr) return;
    const amount = Number(app.amount) || 0;
    if (!amount) return;
    if ((app.type || '支出') === '收入') otherIncome += amount; else otherExpense += amount;
  });
  return { otherIncome, otherExpense };
}

function foreignPaymentExpenseForMonth(monthStr, foreignPayments) {
  let expense = 0;
  (foreignPayments || []).forEach((p) => {
    const currency = p.currency || '台幣';
    if (currency === '台幣') {
      if ((p.paymentDate || '').slice(0, 7) === monthStr) expense += Number(p.amount) || 0;
      [1, 2, 3].forEach((n) => {
        if ((p[`foreignRefund${n}Date`] || '').slice(0, 7) === monthStr) expense -= Number(p[`foreignRefund${n}`]) || 0;
      });
    } else if (p.twdAmount && (p.paymentDate || '').slice(0, 7) === monthStr) {
      expense += Number(p.twdAmount) || 0;
    }
  });
  return expense;
}

function postageFeeExpenseForMonth(monthStr, postageFeeRecords) {
  return (postageFeeRecords || []).reduce((sum, r) => {
    if (r.status === '退回') return sum;
    if ((r.shipDate || '').slice(0, 7) !== monthStr) return sum;
    return sum + (Number(r.amount) || 0);
  }, 0);
}

function projectBonusExpenseForMonth(monthStr, ctx) {
  return computeInternalBonusForMonth(monthStr, ctx)
    .reduce((sum, r) => sum + PROJECT_CLIENT_BONUS_ROLE_KEYS.reduce((s, k) => s + (r.roles[k] && r.amounts[k] ? r.amounts[k] : 0), 0), 0);
}

function dormManagerBonusExpenseForMonth(monthStr, ctx) {
  return computeDormManagerBonusForMonth(monthStr, ctx)
    .reduce((sum, r) => sum + (r.manager1Amount || 0) + (r.manager2Amount || 0), 0);
}

function selfPayDormIncomeForMonth(monthStr, housingRecords) {
  const range = monthRange(monthStr);
  let income = 0;
  (housingRecords || []).forEach((h) => {
    if (h.payer === '廠商代付') return;
    const days = dateOverlapDays(range.start, range.end, h.checkIn, h.checkOut);
    if (days <= 0) return;
    income += h.monthlyRent ? Math.round((Number(h.monthlyRent) / range.daysInMonth) * days) : 0;
  });
  return income;
}

function customItemTotalForMonth(items, amounts, monthStr) {
  return items.reduce((sum, item) => {
    const amt = Number(amounts.find((a) => a.itemId === item.id && a.month === monthStr)?.amount) || 0;
    return sum + amt;
  }, 0);
}

function sumLineItems(monthly) {
  const total = { month: '合計' };
  LINE_ITEMS.forEach((item) => { total[item.key] = monthly.reduce((sum, m) => sum + (m[item.key] || 0), 0); });
  return total;
}

// 複製自 systems/tsaipei/CompanyProfitLossPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function CompanyProfitLossPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'companyProfitLoss', role, overrides);
  const { rows: students, loading: l1 } = useCollection('vietnam_students');
  const { rows: matches, loading: l2 } = useCollection('vietnam_matches');
  const { rows: positions, loading: l3 } = useCollection('vietnam_positions');
  const { rows: admittedList, loading: l4 } = useCollection('vietnam_admittedList');
  const { rows: inTaiwanVisaRecords, loading: l5 } = useCollection('vietnam_inTaiwanVisa');
  const { rows: clientFeeSetupRecords, loading: l6 } = useCollection('vietnam_clientFeeSetup');
  const { rows: dailyExpenseApplications, loading: l7 } = useCollection('vietnam_dailyExpenseApplications');
  const { rows: internalFeeSetupRecords, loading: l8 } = useCollection('vietnam_internalFeeSetup');
  const { rows: dormitories, loading: l9 } = useCollection('vietnam_dormitories');
  const { rows: housingRecords, loading: l10 } = useCollection('vietnam_housingRecords');
  const { rows: dormitoryUtilities, loading: l11 } = useCollection('vietnam_dormitoryUtilities');
  const { rows: foreignPayments, loading: l12 } = useCollection('vietnam_foreignPayments');
  const { rows: postageFeeRecords, loading: l13 } = useCollection('vietnam_postageFeeRecords');
  const { rows: customItems, loading: l14, add: addItem } = useCollection('vietnam_companyPnlCustomItems');
  const { rows: customAmounts, add: addAmount, update: updateAmount } = useCollection('vietnam_companyPnlCustomAmounts');
  const [year, setYear] = useState(currentYear());
  const [newIncomeLabel, setNewIncomeLabel] = useState('');
  const [newExpenseLabel, setNewExpenseLabel] = useState('');

  const ctx = {
    students, matches, positions, admittedList, inTaiwanVisaRecords, clientFeeSetupRecords,
    dailyExpenseApplications, internalFeeSetupRecords, dormitories, housingRecords, dormitoryUtilities, foreignPayments, postageFeeRecords,
  };
  const loading = l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8 || l9 || l10 || l11 || l12 || l13 || l14;
  const years = availableYears(ctx);

  const didEnsureDefaults = useRef(false);
  useEffect(() => {
    if (!canEditPage || l14 || didEnsureDefaults.current) return;
    didEnsureDefaults.current = true;
    DEFAULT_EXPENSE_ITEM_LABELS.forEach((label) => {
      if (!customItems.some((i) => i.type === '支出' && i.label === label)) {
        addItem({ type: '支出', label, createdAt: serverTimestamp() });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEditPage, l14]);

  const customIncomeItems = customItems.filter((i) => i.type === '收入');
  const customExpenseItems = customItems.filter((i) => i.type === '支出');

  const { grandMonthly: dormMonthly } = sumDormProfitLossGroups(computeDormProfitLossForYear(year, ctx));

  const monthly = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const monthStr = monthStrOf(year, m);
    const clientRows = computeClientBillingForMonth(monthStr, ctx);
    const serviceIncome = clientRows.reduce((sum, r) => sum + r.amounts.monthlyProcessingFee + r.amounts.monthlyServiceFee, 0);
    const dailyExpenseReimbursementIncome = clientRows.reduce((sum, r) => sum + r.amounts.dailyExpenseChargeJunyu + r.amounts.dailyExpenseChargeSupplier, 0);
    const taxTotal = clientRows.reduce((sum, r) => sum + r.tax, 0);
    const employerDormFeeIncome = clientRows.reduce((sum, r) => sum + r.amounts.monthlyDormFee + r.amounts.monthlyDormManageFee, 0);
    const selfPayDormIncome = selfPayDormIncomeForMonth(monthStr, housingRecords);
    const dormPnl = dormMonthly[i] || {};
    const dormIncome = employerDormFeeIncome + selfPayDormIncome + (dormPnl.dormItemIncome || 0);
    const dormCost = dormPnl.cost || 0;
    const dormProfitBonusExpense = dormPnl.bonus || 0;
    const { otherIncome, otherExpense } = otherDailyExpenseTotals(monthStr, dailyExpenseApplications);
    const foreignPaymentExpense = foreignPaymentExpenseForMonth(monthStr, foreignPayments);
    const postageFeeExpense = postageFeeExpenseForMonth(monthStr, postageFeeRecords);
    const projectBonusExpense = projectBonusExpenseForMonth(monthStr, ctx);
    const dormManagerBonusExpense = dormManagerBonusExpenseForMonth(monthStr, ctx);
    const customIncomeTotal = customItemTotalForMonth(customIncomeItems, customAmounts, monthStr);
    const customExpenseTotal = customItemTotalForMonth(customExpenseItems, customAmounts, monthStr);
    const income = serviceIncome + dailyExpenseReimbursementIncome + taxTotal + dormIncome + otherIncome + customIncomeTotal;
    const cost = otherExpense + dormCost + taxTotal + foreignPaymentExpense + postageFeeExpense + projectBonusExpense + dormManagerBonusExpense + dormProfitBonusExpense + customExpenseTotal;
    return {
      month: m, serviceIncome, dailyExpenseReimbursementIncome, taxIncome: taxTotal, dormIncome, otherIncome, customIncomeTotal, income,
      otherExpense, dormCost, taxExpense: taxTotal, foreignPaymentExpense, postageFeeExpense, projectBonusExpense, dormManagerBonusExpense, dormProfitBonusExpense, customExpenseTotal, cost,
      profit: income - cost,
    };
  });
  const yearTotal = sumLineItems(monthly);

  async function handleChangeCustomAmount(itemId, monthStr, value) {
    const amount = Number(value) || 0;
    const existing = customAmounts.find((a) => a.itemId === itemId && a.month === monthStr);
    if (existing) {
      if ((Number(existing.amount) || 0) === amount) return;
      await updateAmount(existing.id, { amount });
    } else {
      if (!amount) return;
      await addAmount({ itemId, month: monthStr, amount });
    }
  }

  async function handleAddCustomItem(type, label, reset) {
    const trimmed = label.trim();
    if (!trimmed) return;
    await addItem({ type, label: trimmed, createdAt: serverTimestamp() });
    reset('');
  }

  async function handleDeleteCustomItem(item) {
    if (!window.confirm(`${t('確定要刪除', lang)}「${item.label}」${t('這個項目嗎？所有月份已填的金額也會一起刪除。', lang)}`)) return;
    const snap = await getDocs(query(collection(db, 'vietnam_companyPnlCustomAmounts'), where('itemId', '==', item.id)));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'vietnam_companyPnlCustomItems', item.id));
    await batch.commit();
  }

  function handleDownload() {
    const monthLabels = Array.from({ length: 12 }, (_, i) => `${i + 1}${t('月', lang)}`);
    const csvFields = [
      { key: 'item', label: '損益細項' },
      ...monthLabels.map((l, i) => ({ key: `m${i + 1}`, label: l })),
      { key: 'total', label: '合計' },
    ];
    const rows = LINE_ITEMS.map((item) => {
      const row = { item: item.label, total: yearTotal[item.key] || 0 };
      monthly.forEach((m, i) => { row[`m${i + 1}`] = m[item.key] || 0; });
      return row;
    });
    exportEntityCSV(rows, csvFields, `公司損益_${year}`);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('公司損益', lang)}</h2>
          <div className="page-desc">{t('收入＝服務費收入(辦件費+服務費)＋代墊費用收入(日常支出申請已請款客戶的部分，向客戶收回來的錢)＋營業稅收入(5%，向客戶收取)＋宿舍收入(廠商代付部分直接拿客戶請款計算的金額，不須等住宿安排建檔；學生自付部分從住宿紀錄抓；宿舍設備沿用宿舍損益頁面計算)＋其他收入(日常支出申請-收入類)＋自訂收入項目；支出＝其他支出(日常支出申請-支出類，不分是否已請款客戶，公司實際花費都算)＋宿舍成本(沿用宿舍損益頁面計算)＋營業稅支出(5%，繳納政府)＋國外付款支出(含國外補助申請已核准後自動同步的款項，不會重複計算；美金付款要有填台幣金額換算欄位才會算進來)＋郵資費用支出＋內部獎金支出(專案角色＋宿管獎金)＋宿舍分紅(利潤×20%，沿用宿舍損益頁面計算)＋自訂支出項目(內部人員薪資/保費等，每個月金額自己填)；損益＝收入－支出。已計入宿舍損益或客戶請款的金額不會在這裡重複計算，但也不會因為最後有請款收回來就漏算實際花費。', lang)}</div>
        </div>
        <div className="row-actions">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}{t('年', lang)}</option>)}
          </select>
          <button onClick={handleDownload}>{t('下載報表', lang)}</button>
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card" style={{ overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>
              {year}{t('年公司損益', lang)}
              <span className="muted" style={{ fontWeight: 400, fontSize: 13, marginLeft: 10 }}>{t('年度損益', lang)} {fmt(yearTotal.profit)}</span>
            </h3>
            <PnlTable monthly={monthly} yearTotal={yearTotal} lang={lang} />
          </div>
          <div className="card" style={{ overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>{t('自訂收入項目', lang)}</h3>
            <CustomItemsTable
              items={customIncomeItems} amounts={customAmounts} year={year} canEditPage={canEditPage}
              onChangeAmount={handleChangeCustomAmount} onDelete={handleDeleteCustomItem} lang={lang}
            />
            {canEditPage && (
              <div className="row-actions" style={{ marginTop: 12 }}>
                <input placeholder={t('新增收入項目名稱', lang)} value={newIncomeLabel} onChange={(e) => setNewIncomeLabel(e.target.value)} style={{ width: 200 }} />
                <button onClick={() => handleAddCustomItem('收入', newIncomeLabel, setNewIncomeLabel)}>{t('新增項目', lang)}</button>
              </div>
            )}
          </div>
          <div className="card" style={{ overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>{t('自訂支出項目(含內部人員薪資/保費)', lang)}</h3>
            <CustomItemsTable
              items={customExpenseItems} amounts={customAmounts} year={year} canEditPage={canEditPage}
              onChangeAmount={handleChangeCustomAmount} onDelete={handleDeleteCustomItem} lang={lang}
            />
            {canEditPage && (
              <div className="row-actions" style={{ marginTop: 12 }}>
                <input placeholder={t('新增支出項目名稱', lang)} value={newExpenseLabel} onChange={(e) => setNewExpenseLabel(e.target.value)} style={{ width: 200 }} />
                <button onClick={() => handleAddCustomItem('支出', newExpenseLabel, setNewExpenseLabel)}>{t('新增項目', lang)}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
