import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import {
  computeClientBillingForMonth, computeInternalBonusForMonth, computeDormManagerBonusForMonth,
  computeDormProfitLossForYear, sumDormProfitLossGroups, PROJECT_CLIENT_BONUS_ROLE_KEYS,
  NOT_BILLABLE, currentYear,
} from '../../lib/bonus';
import { exportEntityCSV } from '../../lib/csv';

const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
const DAILY_EXPENSE_BILLABLE_STATUSES = ['已核准', '已匯款'];
const DORM_EQUIPMENT_ITEM = '宿舍設備';
// 支出常見但沒有對應集合可以自動帶出的項目，第一次開這個頁面就自動建立，
// 使用者再自己填每個月的金額；跟使用者自行新增的項目存在同一個集合裡，
// 之後也可以用同一套「新增項目」機制再加別的。
const DEFAULT_EXPENSE_ITEM_LABELS = ['內部人員薪資', '內部人員保費'];

const LINE_ITEMS = [
  { key: 'serviceIncome', label: '服務費收入(辦件費+服務費+代墊費用鈞羽未稅)' },
  { key: 'dormIncome', label: '宿舍收入(住宿費+宿管費+宿舍設備)' },
  { key: 'otherIncome', label: '其他收入(日常支出申請-收入類)' },
  { key: 'customIncomeTotal', label: '自訂收入項目合計(明細見下方)' },
  { key: 'income', label: '收入合計', bold: true },
  { key: 'dormCost', label: '宿舍成本(租金/房仲費/押金損失/水電瓦斯)' },
  { key: 'otherExpense', label: '其他支出(日常支出申請-支出類)' },
  { key: 'foreignPaymentExpense', label: '國外付款支出' },
  { key: 'projectBonusExpense', label: '內部獎金支出(專案角色)' },
  { key: 'dormManagerBonusExpense', label: '宿管獎金支出' },
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
  return Array.from(years).sort((a, b) => b - a);
}

function PnlTable({ monthly, yearTotal }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>損益細項</th>{MONTH_LABELS.map((l) => <th key={l}>{l}</th>)}<th>合計</th></tr>
        </thead>
        <tbody>
          {LINE_ITEMS.map((item) => (
            <tr key={item.key}>
              <td style={{ fontWeight: item.bold ? 600 : 400 }}>{item.label}</td>
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

// 自訂收入/支出項目：使用者自己新增項目(名稱即可)，每個月的金額直接在表格
// 裡填，跟宿舍管理頁面水電瓦斯的「找得到同月份就更新、找不到就新增」upsert
// 邏輯一樣。項目本身(tsaipei_companyPnlCustomItems)不分年份，各年份共用同
// 一批項目，只是每年每月各自存一筆金額(tsaipei_companyPnlCustomAmounts)。
function CustomItemsTable({ items, amounts, year, canEditPage, onChangeAmount, onDelete }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>項目</th>{MONTH_LABELS.map((l) => <th key={l}>{l}</th>)}<th>合計</th>{canEditPage && <th></th>}</tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const monthlyAmounts = MONTH_LABELS.map((_, i) => {
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
                {canEditPage && <td><button onClick={() => onDelete(item)}>刪除</button></td>}
              </tr>
            );
          })}
          {items.length === 0 && <tr><td colSpan={14} className="muted">尚未新增項目</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// 日常支出申請裡已經併入「服務費收入」(須請款且已開立發票) 或「宿舍收入/
// 成本」(項目=宿舍設備) 的紀錄，這裡不能再算一次，避免重複計算；只抓公司
// 自行吸收（未請款客戶）、也不是宿舍設備的其他收入/支出項目。
function otherDailyExpenseTotals(monthStr, dailyExpenseApplications) {
  let otherIncome = 0;
  let otherExpense = 0;
  (dailyExpenseApplications || []).forEach((app) => {
    if (app.item === DORM_EQUIPMENT_ITEM) return;
    if (app.billToCompany && app.billToCompany !== NOT_BILLABLE) return;
    if (!DAILY_EXPENSE_BILLABLE_STATUSES.includes(app.status)) return;
    if ((app.date || '').slice(0, 7) !== monthStr) return;
    const amount = Number(app.amount) || 0;
    if (!amount) return;
    if ((app.type || '支出') === '收入') otherIncome += amount; else otherExpense += amount;
  });
  return { otherIncome, otherExpense };
}

// 國外付款：付款當月記一筆支出，收到國外回款的月份則用回款金額沖減支出
// (跟宿舍損益的押金損失同樣邏輯：損益認列在實際金流發生的月份)；只計台幣
// 付款，美金付款幣別不同不列入同一張損益表。
function foreignPaymentExpenseForMonth(monthStr, foreignPayments) {
  let expense = 0;
  (foreignPayments || []).forEach((p) => {
    if ((p.currency || '台幣') !== '台幣') return;
    if ((p.paymentDate || '').slice(0, 7) === monthStr) expense += Number(p.amount) || 0;
    [1, 2, 3].forEach((n) => {
      if ((p[`foreignRefund${n}Date`] || '').slice(0, 7) === monthStr) expense -= Number(p[`foreignRefund${n}`]) || 0;
    });
  });
  return expense;
}

function projectBonusExpenseForMonth(monthStr, ctx) {
  return computeInternalBonusForMonth(monthStr, ctx)
    .reduce((sum, r) => sum + PROJECT_CLIENT_BONUS_ROLE_KEYS.reduce((s, k) => s + (r.amounts[k] || 0), 0), 0);
}

function dormManagerBonusExpenseForMonth(monthStr, ctx) {
  return computeDormManagerBonusForMonth(monthStr, ctx)
    .reduce((sum, r) => sum + (r.manager1Amount || 0) + (r.manager2Amount || 0), 0);
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

// 公司損益：收入＝服務費收入(辦件費/服務費/代墊費用鈞羽未稅，不含稅、不含
// 代墊費用供應商部分，因為那只是代收代付沒有利潤)＋宿舍損益收入(沿用宿舍
// 損益頁面同一套計算，含學生自付與廠商代付)＋日常支出申請其他收入＋自訂
// 收入項目；支出＝宿舍損益成本＋日常支出申請其他支出＋國外付款支出＋內部
// 獎金支出(專案角色＋宿管獎金)＋自訂支出項目(內部人員薪資/保費等，使用者
// 自行填每月金額)；損益＝收入－支出。避免跟宿舍損益、客戶請款計算重複計算
// 同一筆錢，只在其中一個地方認列。
export default function CompanyProfitLossPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'companyProfitLoss', role, overrides);
  const { rows: students, loading: l1 } = useCollection('tsaipei_students');
  const { rows: matches, loading: l2 } = useCollection('tsaipei_matches');
  const { rows: positions, loading: l3 } = useCollection('tsaipei_positions');
  const { rows: admittedList, loading: l4 } = useCollection('tsaipei_admittedList');
  const { rows: inTaiwanVisaRecords, loading: l5 } = useCollection('tsaipei_inTaiwanVisa');
  const { rows: clientFeeSetupRecords, loading: l6 } = useCollection('tsaipei_clientFeeSetup');
  const { rows: dailyExpenseApplications, loading: l7 } = useCollection('tsaipei_dailyExpenseApplications');
  const { rows: internalFeeSetupRecords, loading: l8 } = useCollection('tsaipei_internalFeeSetup');
  const { rows: dormitories, loading: l9 } = useCollection('tsaipei_dormitories');
  const { rows: housingRecords, loading: l10 } = useCollection('tsaipei_housingRecords');
  const { rows: dormitoryUtilities, loading: l11 } = useCollection('tsaipei_dormitoryUtilities');
  const { rows: foreignPayments, loading: l12 } = useCollection('tsaipei_foreignPayments');
  const { rows: customItems, loading: l13, add: addItem } = useCollection('tsaipei_companyPnlCustomItems');
  const { rows: customAmounts, add: addAmount, update: updateAmount } = useCollection('tsaipei_companyPnlCustomAmounts');
  const [year, setYear] = useState(currentYear());
  const [newIncomeLabel, setNewIncomeLabel] = useState('');
  const [newExpenseLabel, setNewExpenseLabel] = useState('');

  const ctx = {
    students, matches, positions, admittedList, inTaiwanVisaRecords, clientFeeSetupRecords,
    dailyExpenseApplications, internalFeeSetupRecords, dormitories, housingRecords, dormitoryUtilities, foreignPayments,
  };
  const loading = l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8 || l9 || l10 || l11 || l12 || l13;
  const years = availableYears(ctx);

  // 第一次開這個頁面時自動把「內部人員薪資」「內部人員保費」這兩個常見支出
  // 項目建好，使用者不用自己手動新增，只要填每個月的金額。
  const didEnsureDefaults = useRef(false);
  useEffect(() => {
    if (!canEditPage || l13 || didEnsureDefaults.current) return;
    didEnsureDefaults.current = true;
    DEFAULT_EXPENSE_ITEM_LABELS.forEach((label) => {
      if (!customItems.some((i) => i.type === '支出' && i.label === label)) {
        addItem({ type: '支出', label, createdAt: serverTimestamp() });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEditPage, l13]);

  const customIncomeItems = customItems.filter((i) => i.type === '收入');
  const customExpenseItems = customItems.filter((i) => i.type === '支出');

  const { grandMonthly: dormMonthly } = sumDormProfitLossGroups(computeDormProfitLossForYear(year, ctx));

  const monthly = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const monthStr = monthStrOf(year, m);
    const clientRows = computeClientBillingForMonth(monthStr, ctx);
    const serviceIncome = clientRows.reduce((sum, r) => sum + r.amounts.monthlyProcessingFee + r.amounts.monthlyServiceFee + r.amounts.dailyExpenseChargeJunyu, 0);
    const dormPnl = dormMonthly[i] || {};
    const dormIncome = dormPnl.income || 0;
    const dormCost = dormPnl.cost || 0;
    const { otherIncome, otherExpense } = otherDailyExpenseTotals(monthStr, dailyExpenseApplications);
    const foreignPaymentExpense = foreignPaymentExpenseForMonth(monthStr, foreignPayments);
    const projectBonusExpense = projectBonusExpenseForMonth(monthStr, ctx);
    const dormManagerBonusExpense = dormManagerBonusExpenseForMonth(monthStr, ctx);
    const customIncomeTotal = customItemTotalForMonth(customIncomeItems, customAmounts, monthStr);
    const customExpenseTotal = customItemTotalForMonth(customExpenseItems, customAmounts, monthStr);
    const income = serviceIncome + dormIncome + otherIncome + customIncomeTotal;
    const cost = dormCost + otherExpense + foreignPaymentExpense + projectBonusExpense + dormManagerBonusExpense + customExpenseTotal;
    return {
      month: m, serviceIncome, dormIncome, otherIncome, customIncomeTotal, income,
      dormCost, otherExpense, foreignPaymentExpense, projectBonusExpense, dormManagerBonusExpense, customExpenseTotal, cost,
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
    if (!window.confirm(`確定要刪除「${item.label}」這個項目嗎？所有月份已填的金額也會一起刪除。`)) return;
    const snap = await getDocs(query(collection(db, 'tsaipei_companyPnlCustomAmounts'), where('itemId', '==', item.id)));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'tsaipei_companyPnlCustomItems', item.id));
    await batch.commit();
  }

  function handleDownload() {
    const csvFields = [
      { key: 'item', label: '損益細項' },
      ...MONTH_LABELS.map((l, i) => ({ key: `m${i + 1}`, label: l })),
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
          <h2>公司損益</h2>
          <div className="page-desc">收入＝服務費收入(辦件費/服務費/代墊費用鈞羽未稅)＋宿舍收入(沿用宿舍損益頁面計算)＋其他收入(日常支出申請-收入類，未請款客戶的部分)＋自訂收入項目；支出＝宿舍成本(沿用宿舍損益頁面計算)＋其他支出(日常支出申請-支出類，未請款客戶的部分)＋國外付款支出＋內部獎金支出(專案角色＋宿管獎金)＋自訂支出項目(內部人員薪資/保費等，每個月金額自己填)；損益＝收入－支出。已計入宿舍損益或客戶請款的金額不會在這裡重複計算。</div>
        </div>
        <div className="row-actions">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}年</option>)}
          </select>
          <button onClick={handleDownload}>下載報表</button>
        </div>
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card" style={{ overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>
              {year}年公司損益
              <span className="muted" style={{ fontWeight: 400, fontSize: 13, marginLeft: 10 }}>年度損益 {fmt(yearTotal.profit)}</span>
            </h3>
            <PnlTable monthly={monthly} yearTotal={yearTotal} />
          </div>
          <div className="card" style={{ overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>自訂收入項目</h3>
            <CustomItemsTable
              items={customIncomeItems} amounts={customAmounts} year={year} canEditPage={canEditPage}
              onChangeAmount={handleChangeCustomAmount} onDelete={handleDeleteCustomItem}
            />
            {canEditPage && (
              <div className="row-actions" style={{ marginTop: 12 }}>
                <input placeholder="新增收入項目名稱" value={newIncomeLabel} onChange={(e) => setNewIncomeLabel(e.target.value)} style={{ width: 200 }} />
                <button onClick={() => handleAddCustomItem('收入', newIncomeLabel, setNewIncomeLabel)}>新增項目</button>
              </div>
            )}
          </div>
          <div className="card" style={{ overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>自訂支出項目(含內部人員薪資/保費)</h3>
            <CustomItemsTable
              items={customExpenseItems} amounts={customAmounts} year={year} canEditPage={canEditPage}
              onChangeAmount={handleChangeCustomAmount} onDelete={handleDeleteCustomItem}
            />
            {canEditPage && (
              <div className="row-actions" style={{ marginTop: 12 }}>
                <input placeholder="新增支出項目名稱" value={newExpenseLabel} onChange={(e) => setNewExpenseLabel(e.target.value)} style={{ width: 200 }} />
                <button onClick={() => handleAddCustomItem('支出', newExpenseLabel, setNewExpenseLabel)}>新增項目</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
