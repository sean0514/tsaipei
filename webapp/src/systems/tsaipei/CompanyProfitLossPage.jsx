import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import {
  computeClientBillingForMonth, computeInternalBonusForMonth, computeDormManagerBonusForMonth, computeOverseasRepBonusForMonth,
  computeDormProfitLossForYear, sumDormProfitLossGroups, PROJECT_CLIENT_BONUS_ROLE_KEYS, BONUS_ROLE_KEYS, BONUS_ROLE_LABELS,
  monthRange, dateOverlapDays, currentYear, NOT_BILLABLE,
} from '../../lib/bonus';
import { downloadXlsx, addTableSheet } from '../../lib/xlsxExport';

const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
const DAILY_EXPENSE_BILLABLE_STATUSES = ['已核准', '已匯款'];

function parseJson(json, fallback) {
  try { return json ? JSON.parse(json) : fallback; } catch { return fallback; }
}

// 客戶請款計算有「確認封存」(含封存後的手動編輯)機制，封存的客戶/月份會
// 固定住數字、不再隨原始資料異動即時重算；公司損益的服務費收入/代墊費用
// 收入/稅金/宿舍費收入都是從同一份客戶請款資料算出來的，如果不套用封存
// 快照，封存/手動修正過的數字就會跟「客戶請款計算」頁面顯示的對不上。
function applyClientBillingLocks(monthStr, liveRows, locks) {
  return liveRows.map((r) => {
    const lock = (locks || []).find((l) => l.month === monthStr && l.projectCode === r.projectCode && l.client === r.client);
    if (!lock) return r;
    return { ...r, ...parseJson(lock.billingRow, {}) };
  });
}
const DORM_EQUIPMENT_ITEM = '宿舍設備';
// 支出常見但沒有對應集合可以自動帶出的項目，第一次開這個頁面就自動建立，
// 使用者再自己填每個月的金額；跟使用者自行新增的項目存在同一個集合裡，
// 之後也可以用同一套「新增項目」機制再加別的。
const DEFAULT_EXPENSE_ITEM_LABELS = ['內部人員薪資', '內部人員保費'];

const LINE_ITEMS = [
  { key: 'serviceIncome', label: '服務費收入(文件費+機票費+體檢費+服務費)' },
  { key: 'dailyExpenseReimbursementIncome', label: '代墊費用收入(日常支出申請已請款客戶部分，鈞羽+供應商)' },
  { key: 'taxIncome', label: '營業稅收入(5%，向客戶收取)' },
  { key: 'employerDormFeeIncome', label: '宿舍收入－廠商代付宿舍費/宿管費/其他費用(客戶請款計算)' },
  { key: 'selfPayDormIncome', label: '宿舍收入－學生自付房租' },
  { key: 'dormItemIncome', label: '宿舍收入－宿舍設備收入(日常支出申請)' },
  { key: 'dormOtherIncome', label: '宿舍收入－其他收入(宿舍管理自訂項目)' },
  { key: 'utilityIncome', label: '宿舍收入－水電瓦斯費收入(學生請款計算)' },
  { key: 'evIncome', label: '宿舍收入－電動車月租金收入' },
  { key: 'dormIncome', label: '宿舍收入合計', bold: true },
  { key: 'otherIncome', label: '其他收入(日常支出申請-收入類)' },
  { key: 'customIncomeTotal', label: '自訂收入項目合計(明細見下方)' },
  { key: 'income', label: '收入合計', bold: true },
  { key: 'otherExpense', label: '其他支出(日常支出申請-支出類，含已請款客戶部分的實際花費)' },
  { key: 'rentCost', label: '宿舍成本－租金' },
  { key: 'agentFeeCost', label: '宿舍成本－房仲費' },
  { key: 'depositLossCost', label: '宿舍成本－押金損失' },
  { key: 'gasCylinderDepositLossCost', label: '宿舍成本－瓦斯空桶押金損失' },
  { key: 'waterCost', label: '宿舍成本－水費' },
  { key: 'electricityCost', label: '宿舍成本－電費' },
  { key: 'gasCost', label: '宿舍成本－瓦斯費' },
  { key: 'otherUtilityCost', label: '宿舍成本－其他費用(宿舍管理自訂項目)' },
  { key: 'dormItemCost', label: '宿舍成本－宿舍設備支出(日常支出申請)' },
  { key: 'dormCost', label: '宿舍成本合計', bold: true },
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

function PnlTable({ monthly, yearTotal }) {
  return (
    <div className="table-wrap sticky-header">
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
    <div className="table-wrap sticky-header">
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

// 日常支出申請：項目=宿舍設備的已經併入「宿舍收入/成本」(沿用宿舍損益頁面
// 算法)，這裡不再算一次。「支出」類不分是否須請款客戶都算進來——公司實際
// 花出去的錢，即使最後跟客戶請款收回來也是真的花了這筆錢，請款收回來的
// 部分另外算進「代墊費用收入」，不能因為會收回來就不算支出，否則這筆錢
// 會整個從損益表中消失。「收入」類只有「須請款(實習單位)」沒選企業(=不
// 須請款、跟學生收)的才算這裡的公司收入；有選企業的已經改成跟那家企業
// 收(算進客戶請款計算的「代墊費用收入」)，這裡要排除掉，不然同一筆錢會
// 在損益表上被算兩次收入。
function otherDailyExpenseTotals(monthStr, dailyExpenseApplications) {
  let otherIncome = 0;
  let otherExpense = 0;
  (dailyExpenseApplications || []).forEach((app) => {
    if (app.item === DORM_EQUIPMENT_ITEM) return;
    if (!DAILY_EXPENSE_BILLABLE_STATUSES.includes(app.status)) return;
    if ((app.date || '').slice(0, 7) !== monthStr) return;
    const amount = Number(app.amount) || 0;
    if (!amount) return;
    const isIncome = (app.type || '支出') === '收入';
    if (isIncome && app.billToCompany && app.billToCompany !== NOT_BILLABLE) return;
    if (isIncome) otherIncome += amount; else otherExpense += amount;
  });
  return { otherIncome, otherExpense };
}

// 國外付款：付款當月記一筆支出，收到國外回款的月份則用回款金額沖減支出
// (跟宿舍損益的押金損失同樣邏輯：損益認列在實際金流發生的月份)；台幣付款
// 直接算金額；美金付款要有填「台幣金額」換算欄位才算得進來(用換算後的
// 台幣金額認列，國外補助申請核准後自動同步過來的美金紀錄也會一併帶這個
// 欄位)，沒有換算金額的美金付款沒有台幣基準，不列入這張損益表；國外回款
// 只有台幣付款才沖減，美金付款的回款沒有對應的台幣換算金額可以沖銷。
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

// 郵資費用：依寄件日期認列，排除「退回」狀態(沒有真的寄出/花這筆錢)；
// 「未匯款」也算進去，因為錢是寄件當下就花掉了，未匯款只是還沒報銷給
// 墊付的人，不是這筆支出沒發生過。
function postageFeeExpenseForMonth(monthStr, postageFeeRecords) {
  return (postageFeeRecords || []).reduce((sum, r) => {
    if (r.status === '退回') return sum;
    if ((r.shipDate || '').slice(0, 7) !== monthStr) return sum;
    return sum + (Number(r.amount) || 0);
  }, 0);
}

function projectBonusExpenseForMonth(monthStr, ctx) {
  const roleBonus = computeInternalBonusForMonth(monthStr, ctx)
    .reduce((sum, r) => sum + PROJECT_CLIENT_BONUS_ROLE_KEYS.reduce((s, k) => s + (r.roles[k] && r.amounts[k] ? r.amounts[k] : 0), 0), 0);
  // 國外代表改成依學生來源(國外供應商)分別計算，不再是 PROJECT_CLIENT_BONUS_ROLE_KEYS
  // 其中一個角色，要另外加總進來，不然公司損益會漏算這筆內部獎金支出。
  const overseasRepBonus = computeOverseasRepBonusForMonth(monthStr, ctx).reduce((sum, r) => sum + (r.amount || 0), 0);
  return roleBonus + overseasRepBonus;
}

function dormManagerBonusExpenseForMonth(monthStr, ctx) {
  return computeDormManagerBonusForMonth(monthStr, ctx)
    .reduce((sum, r) => sum + (r.manager1Amount || 0) + (r.manager2Amount || 0), 0);
}

// 學生自付房租：客戶請款計算完全不會算到這筆錢(不是跟客戶收的)，只能從
// 住宿紀錄抓。這裡不比對特定宿舍(不像宿舍損益要歸屬到某一間宿舍算宿管
// 分紅)，只要是「學生自付」的住宿紀錄、這個月有住，金額就算進公司收入。
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

// 以下是「下載報表」用的逐筆明細函式——跟上面算合計數字的函式讀同一批
// 原始資料，只是不加總、改成列出每一筆對應紀錄方便離線核對來源。

function selfPayDormIncomeEntries(monthStr, housingRecords, students) {
  const range = monthRange(monthStr);
  const studentName = (id) => { const s = (students || []).find((x) => x.id === id); return s?.chineseName || s?.originalName || '(未知學生)'; };
  return (housingRecords || []).map((h) => {
    if (h.payer === '廠商代付') return null;
    const days = dateOverlapDays(range.start, range.end, h.checkIn, h.checkOut);
    if (days <= 0) return null;
    const amount = h.monthlyRent ? Math.round((Number(h.monthlyRent) / range.daysInMonth) * days) : 0;
    if (!amount) return null;
    return { desc: `${studentName(h.studentId)}（${h.type || '未指定宿舍'}，租金 ${Number(h.monthlyRent).toLocaleString()}/月 × ${days}/${range.daysInMonth}天）`, amount };
  }).filter(Boolean);
}

// 宿舍相關項目(廠商代付以外的)改成列出每一間宿舍的貢獻金額，學生/逐筆
// 層級的明細已經在「宿舍損益」頁面自己的下載報表裡，這裡不重複列。
function dormLineItemEntriesByDorm(dormPnlKey, dormManagerGroups, i) {
  const entries = [];
  (dormManagerGroups || []).forEach((g) => (g.dorms || []).forEach((d) => {
    const amount = d.monthly[i]?.[dormPnlKey] || 0;
    if (amount) entries.push({ desc: d.dormName, amount });
  }));
  return entries;
}

function clientRowEntries(clientRows, sumFn) {
  return (clientRows || []).map((r) => {
    const amount = sumFn(r.amounts, r.tax);
    if (!amount) return null;
    return { desc: `${r.client || ''} ${r.projectCode || ''}`.trim(), amount };
  }).filter(Boolean);
}

function otherDailyExpenseEntries(monthStr, dailyExpenseApplications, wantIncome) {
  return (dailyExpenseApplications || []).filter((app) => {
    if (app.item === DORM_EQUIPMENT_ITEM) return false;
    if (!DAILY_EXPENSE_BILLABLE_STATUSES.includes(app.status)) return false;
    if ((app.date || '').slice(0, 7) !== monthStr) return false;
    if (!(Number(app.amount) || 0)) return false;
    const isIncome = (app.type || '支出') === '收入';
    if (isIncome && app.billToCompany && app.billToCompany !== NOT_BILLABLE) return false;
    return isIncome === wantIncome;
  }).map((app) => ({ desc: `${app.date || ''} ${app.applicant || '—'} ${app.purpose || ''}`.trim(), amount: Number(app.amount) || 0 }));
}

function foreignPaymentEntries(monthStr, foreignPayments) {
  const entries = [];
  (foreignPayments || []).forEach((p) => {
    const currency = p.currency || '台幣';
    const label = p.company || p.studentId || '—';
    if (currency === '台幣') {
      if ((p.paymentDate || '').slice(0, 7) === monthStr && (Number(p.amount) || 0)) {
        entries.push({ desc: `付款：${label}（${p.paymentDate}）`, amount: Number(p.amount) || 0 });
      }
      [1, 2, 3].forEach((n) => {
        const refundDate = p[`foreignRefund${n}Date`];
        const refundAmt = Number(p[`foreignRefund${n}`]) || 0;
        if ((refundDate || '').slice(0, 7) === monthStr && refundAmt) {
          entries.push({ desc: `國外回款沖減：${label}（${refundDate}）`, amount: -refundAmt });
        }
      });
    } else if (p.twdAmount && (p.paymentDate || '').slice(0, 7) === monthStr) {
      entries.push({ desc: `付款(美金換算台幣)：${label}（${p.paymentDate}）`, amount: Number(p.twdAmount) || 0 });
    }
  });
  return entries;
}

function postageFeeEntries(monthStr, postageFeeRecords) {
  return (postageFeeRecords || [])
    .filter((r) => r.status !== '退回' && (r.shipDate || '').slice(0, 7) === monthStr && (Number(r.amount) || 0))
    .map((r) => ({ desc: `${r.shipDate || ''} 收件人：${r.recipientName || '—'}`, amount: Number(r.amount) || 0 }));
}

function projectBonusEntries(monthStr, ctx) {
  const entries = [];
  computeInternalBonusForMonth(monthStr, ctx).forEach((r) => {
    PROJECT_CLIENT_BONUS_ROLE_KEYS.forEach((k) => {
      const amount = r.amounts[k];
      if (r.roles[k] && amount) {
        entries.push({ desc: `${r.client || ''} ${r.projectCode || ''} － ${r.roles[k]}（${BONUS_ROLE_LABELS[BONUS_ROLE_KEYS.indexOf(k)]}）`, amount });
      }
    });
  });
  computeOverseasRepBonusForMonth(monthStr, ctx).forEach((r) => {
    if (r.amount) entries.push({ desc: `${r.client || ''} ${r.projectCode || ''} － 國外代表(${r.supplier})`, amount: r.amount });
  });
  return entries;
}

function dormManagerBonusEntries(monthStr, ctx) {
  const entries = [];
  computeDormManagerBonusForMonth(monthStr, ctx).forEach((r) => {
    if (r.manager1 && r.manager1Amount) entries.push({ desc: `${r.dormName} － 宿管1：${r.manager1}`, amount: r.manager1Amount });
    if (r.manager2 && r.manager2Amount) entries.push({ desc: `${r.dormName} － 宿管2：${r.manager2}`, amount: r.manager2Amount });
  });
  return entries;
}

function customItemEntries(items, amounts, monthStr) {
  return (items || []).map((item) => {
    const amount = Number(amounts.find((a) => a.itemId === item.id && a.month === monthStr)?.amount) || 0;
    if (!amount) return null;
    return { desc: item.label, amount };
  }).filter(Boolean);
}

// dormPnl 裡的「其他收入(宿舍管理自訂項目)」原始欄位叫 otherIncome，但
// 這個頁面的 otherIncome 另有所指(日常支出申請-收入類)，LINE_ITEMS 裡
// 改用 dormOtherIncome 這個名字避免撞名，這裡對照回 dormPnl 的原始欄位。
const DORM_LINE_ITEM_KEY_MAP = { dormOtherIncome: 'otherIncome', dormProfitBonusExpense: 'bonus' };
const DORM_BY_DORM_KEYS = ['dormItemIncome', 'dormOtherIncome', 'utilityIncome', 'evIncome', 'rentCost', 'agentFeeCost', 'depositLossCost', 'gasCylinderDepositLossCost', 'waterCost', 'electricityCost', 'gasCost', 'otherUtilityCost', 'dormItemCost', 'dormProfitBonusExpense'];

// 公司損益：收入＝服務費收入(文件費/機票費/體檢費/服務費)＋代墊費用收入(日常支出申請裡
// 已請款客戶的鈞羽/供應商發票部分，公司向客戶收回來的錢)＋營業稅收入(5%，
// 向客戶收取)＋宿舍收入(廠商代付的宿舍費/宿管費直接拿客戶請款計算的金額，
// 不透過住宿紀錄比對，避免住宿安排還沒建檔就漏算；學生自付的部分從住宿
// 紀錄抓；宿舍設備收入沿用宿舍損益頁面計算)＋日常支出申請其他收入＋自訂
// 收入項目；支出＝日常支出申請其他支出(不分是否已請款客戶，公司實際花
// 出去的錢都算，請款收回來的部分已經在代墊費用收入裡另外算了，不會互相
// 抵銷到看不見)＋宿舍成本(沿用宿舍損益頁面計算，租金/房仲費/押金損失/
// 水電瓦斯/宿舍設備支出，都跟住宿紀錄比對無關)＋營業稅支出(5%，繳納政府，
// 跟營業稅收入金額一樣，對損益沒有淨影響但兩邊都列出來)＋國外付款支出
// (含國外補助申請已核准後自動同步過來的款項，見下方說明)＋郵資費用支出
// ＋內部獎金支出(專案角色＋宿管獎金)＋宿舍分紅(沿用宿舍損益頁面的分紅＝
// 利潤×20%，歸屬給特定宿舍管理員，所以繼續用住宿紀錄比對)＋自訂支出項目
// (內部人員薪資/保費等，使用者自行填每月金額)；損益＝收入－支出。避免跟
// 宿舍損益、客戶請款計算重複計算同一筆錢，只在其中一個地方認列。
//
// 國外補助申請沒有獨立算一條支出線：ForeignSubsidyApplicationPage 核准
// (或後續編輯)時，會自動在 tsaipei_foreignPayments 同步/更新一筆對應的
// 付款紀錄(金額/匯款日期/幣別都跟申請單一致)，這裡已經透過「國外付款
// 支出」算到了；如果再額外加一條「國外補助申請支出」，同一筆錢就會被
// 算兩次。
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
  const { rows: postageFeeRecords, loading: l13 } = useCollection('tsaipei_postageFeeRecords');
  const { rows: clientBillingLocks, loading: l15 } = useCollection('tsaipei_clientBillingLocks');
  const { rows: customItems, loading: l14, add: addItem } = useCollection('tsaipei_companyPnlCustomItems');
  const { rows: customAmounts, add: addAmount, update: updateAmount } = useCollection('tsaipei_companyPnlCustomAmounts');
  const [year, setYear] = useState(currentYear());
  const [newIncomeLabel, setNewIncomeLabel] = useState('');
  const [newExpenseLabel, setNewExpenseLabel] = useState('');

  const ctx = {
    students, matches, positions, admittedList, inTaiwanVisaRecords, clientFeeSetupRecords,
    dailyExpenseApplications, internalFeeSetupRecords, dormitories, housingRecords, dormitoryUtilities, foreignPayments, postageFeeRecords,
  };
  const loading = l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8 || l9 || l10 || l11 || l12 || l13 || l14 || l15;
  const years = availableYears(ctx);

  // 第一次開這個頁面時自動把「內部人員薪資」「內部人員保費」這兩個常見支出
  // 項目建好，使用者不用自己手動新增，只要填每個月的金額。
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

  const dormManagerGroups = computeDormProfitLossForYear(year, ctx);
  const { grandMonthly: dormMonthly } = sumDormProfitLossGroups(dormManagerGroups);

  const monthly = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const monthStr = monthStrOf(year, m);
    const clientRows = applyClientBillingLocks(monthStr, computeClientBillingForMonth(monthStr, ctx), clientBillingLocks);
    const serviceIncome = clientRows.reduce((sum, r) =>
      sum + r.amounts.monthlyProcessingFee + (r.amounts.monthlyAirfareFee || 0) + (r.amounts.monthlyMedicalCheckFee || 0) + r.amounts.monthlyServiceFee, 0);
    const dailyExpenseReimbursementIncome = clientRows.reduce((sum, r) => sum + r.amounts.dailyExpenseChargeJunyu + r.amounts.dailyExpenseChargeSupplier, 0);
    // 客戶請款計算的 5% 稈金是算在文件費/機票費/體檢費/服務費/宿舍費/宿管費/代墊費用(鈞羽)
    // 這整筆未稅金額上，不只是服務費部分，所以不能只拆服務費那一塊；這裡
    // 把整筆稈金同時算成收入(跟客戶收到的錢)跟支出(要繳給政府的錢)，兩邊
    // 金額一樣所以對損益沒有淨影響，但兩邊都要列出來才完整。
    const taxTotal = clientRows.reduce((sum, r) => sum + r.tax, 0);
    // 廠商代付的宿舍費/宿管費直接拿客戶請款計算算出來的金額(跟請款單保證
    // 一致)，不透過「宿舍損益」那套要先比對住宿紀錄歸屬到特定宿舍的邏輯——
    // 那套比對是宿舍損益為了算宿管分紅才需要的，如果學生已經開始計費但
    // 住宿安排還沒建檔(或宿舍名稱/付款方式填錯)，會導致這筆已經跟客戶收的
    // 錢完全沒算進公司損益的宿舍收入。宿舍設備收入/成本、宿舍成本(租金等)
    // 都跟住宿紀錄比對無關，繼續沿用宿舍損益的計算沒問題；宿舍分紅本來就
    // 是算給特定宿舍管理員的，也繼續用宿舍損益自己的住宿紀錄比對。
    const employerDormFeeIncome = clientRows.reduce((sum, r) =>
      sum + r.amounts.monthlyDormFee + (r.amounts.collectedDormFee || 0) + r.amounts.monthlyDormManageFee + (r.amounts.dormOtherFeeCharge || 0) + (r.amounts.dormUtilityPassThrough || 0), 0);
    const selfPayDormIncome = selfPayDormIncomeForMonth(monthStr, housingRecords);
    const dormPnl = dormMonthly[i] || {};
    const dormIncome = employerDormFeeIncome + selfPayDormIncome + (dormPnl.dormItemIncome || 0) + (dormPnl.otherIncome || 0) + (dormPnl.utilityIncome || 0) + (dormPnl.evIncome || 0);
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
      month: m, serviceIncome, dailyExpenseReimbursementIncome, taxIncome: taxTotal,
      employerDormFeeIncome, selfPayDormIncome,
      dormItemIncome: dormPnl.dormItemIncome || 0,
      dormOtherIncome: dormPnl.otherIncome || 0,
      utilityIncome: dormPnl.utilityIncome || 0,
      evIncome: dormPnl.evIncome || 0,
      dormIncome, otherIncome, customIncomeTotal, income,
      otherExpense,
      rentCost: dormPnl.rentCost || 0,
      agentFeeCost: dormPnl.agentFeeCost || 0,
      depositLossCost: dormPnl.depositLossCost || 0,
      gasCylinderDepositLossCost: dormPnl.gasCylinderDepositLossCost || 0,
      waterCost: dormPnl.waterCost || 0,
      electricityCost: dormPnl.electricityCost || 0,
      gasCost: dormPnl.gasCost || 0,
      otherUtilityCost: dormPnl.otherUtilityCost || 0,
      dormItemCost: dormPnl.dormItemCost || 0,
      dormCost, taxExpense: taxTotal, foreignPaymentExpense, postageFeeExpense, projectBonusExpense, dormManagerBonusExpense, dormProfitBonusExpense, customExpenseTotal, cost,
      profit: income - cost,
      _clientRows: clientRows, // 下載報表明細用，保留這個月算好的客戶請款逐筆資料，不用重算一次
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

  // 下載報表：依月份分頁(一個月一個工作表)，每個分頁列出每一項收入/支出
  // 細項的金額，金額底下再列出逐筆明細(客戶請款按客戶、宿舍相關項目按
  // 宿舍、日常支出/國外付款/郵資按單筆紀錄、內部獎金按人、自訂項目按
  // 項目名稱)，方便離線核對每一筆金額是怎麼算出來的。
  async function handleDownload() {
    const header = ['損益細項', '明細說明', '金額'];
    await downloadXlsx(`公司損益_${year}.xlsx`, (workbook) => {
      monthly.forEach((m, i) => {
        const monthStr = monthStrOf(year, m.month);
        const clientRows = m._clientRows;
        const rows = [];
        LINE_ITEMS.forEach((item) => {
          rows.push([item.label, '', m[item.key] || 0]);
          let entries = [];
          if (item.key === 'serviceIncome') entries = clientRowEntries(clientRows, (a) => a.monthlyProcessingFee + (a.monthlyAirfareFee || 0) + (a.monthlyMedicalCheckFee || 0) + a.monthlyServiceFee);
          else if (item.key === 'dailyExpenseReimbursementIncome') entries = clientRowEntries(clientRows, (a) => a.dailyExpenseChargeJunyu + a.dailyExpenseChargeSupplier);
          else if (item.key === 'taxIncome' || item.key === 'taxExpense') entries = clientRowEntries(clientRows, (a, tax) => tax);
          else if (item.key === 'employerDormFeeIncome') entries = clientRowEntries(clientRows, (a) => a.monthlyDormFee + (a.collectedDormFee || 0) + a.monthlyDormManageFee + (a.dormOtherFeeCharge || 0) + (a.dormUtilityPassThrough || 0));
          else if (item.key === 'selfPayDormIncome') entries = selfPayDormIncomeEntries(monthStr, housingRecords, students);
          else if (DORM_BY_DORM_KEYS.includes(item.key)) entries = dormLineItemEntriesByDorm(DORM_LINE_ITEM_KEY_MAP[item.key] || item.key, dormManagerGroups, i);
          else if (item.key === 'otherIncome') entries = otherDailyExpenseEntries(monthStr, dailyExpenseApplications, true);
          else if (item.key === 'otherExpense') entries = otherDailyExpenseEntries(monthStr, dailyExpenseApplications, false);
          else if (item.key === 'foreignPaymentExpense') entries = foreignPaymentEntries(monthStr, foreignPayments);
          else if (item.key === 'postageFeeExpense') entries = postageFeeEntries(monthStr, postageFeeRecords);
          else if (item.key === 'projectBonusExpense') entries = projectBonusEntries(monthStr, ctx);
          else if (item.key === 'dormManagerBonusExpense') entries = dormManagerBonusEntries(monthStr, ctx);
          else if (item.key === 'customIncomeTotal') entries = customItemEntries(customIncomeItems, customAmounts, monthStr);
          else if (item.key === 'customExpenseTotal') entries = customItemEntries(customExpenseItems, customAmounts, monthStr);
          entries.forEach((en) => rows.push(['', en.desc, en.amount]));
        });
        addTableSheet(workbook, `${m.month}月`, header, rows);
      });
    });
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>公司損益</h2>
          <div className="page-desc">收入＝服務費收入(文件費+機票費+體檢費+服務費)＋代墊費用收入(日常支出申請已請款客戶的部分，向客戶收回來的錢)＋營業稅收入(5%，向客戶收取)＋宿舍收入(廠商代付部分直接拿客戶請款計算的金額，不須等住宿安排建檔；學生自付部分從住宿紀錄抓；宿舍設備、宿舍管理自訂收入項目、水電瓦斯費收入、電動車月租金收入都沿用宿舍損益頁面計算)＋其他收入(日常支出申請-收入類)＋自訂收入項目；支出＝其他支出(日常支出申請-支出類，不分是否已請款客戶，公司實際花費都算)＋宿舍成本(沿用宿舍損益頁面計算，含宿舍管理自訂支出項目)＋營業稅支出(5%，繳納政府)＋國外付款支出(含國外補助申請已核准後自動同步的款項，不會重複計算；美金付款要有填台幣金額換算欄位才會算進來)＋郵資費用支出＋內部獎金支出(專案角色＋宿管獎金)＋宿舍分紅(利潤×20%，沿用宿舍損益頁面計算)＋自訂支出項目(內部人員薪資/保費等，每個月金額自己填)；損益＝收入－支出。已計入宿舍損益或客戶請款的金額不會在這裡重複計算，但也不會因為最後有請款收回來就漏算實際花費。</div>
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
