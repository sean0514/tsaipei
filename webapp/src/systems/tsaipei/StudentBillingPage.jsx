import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { exportEntityCSV } from '../../lib/csv';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { studentProjectClientPair, currentYear } from '../../lib/bonus';

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// 跟 客戶請款計算/學生自付宿舍 同一套「當月天數」規則。
function monthRange(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start, end, daysInMonth: end.getDate() };
}

function dateOverlapDays(rangeStart, rangeEnd, entryStr, exitStr) {
  if (!entryStr) return 0;
  const entry = new Date(`${entryStr}T00:00:00`);
  if (Number.isNaN(entry.getTime())) return 0;
  const exit = exitStr ? new Date(`${exitStr}T00:00:00`) : rangeEnd;
  const s = entry < rangeStart ? rangeStart : entry;
  const e = exit > rangeEnd ? rangeEnd : exit;
  if (e < s) return 0;
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

function parseOtherFees(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// 先繳部分：使用者要能分好幾筆填(每筆各自金額+日期)，存成 JSON 陣列字串，
// 跟宿舍管理「填寫其他費用」同一套 JSON 陣列存法。
function parsePartialPayments(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// 「住宿中」的判斷跟 宿舍管理/住宿安排 同一套邏輯：已完成的不算、沒有入住
// 日的不算、退宿日已過的也不算。用這個算「這個月住過這間宿舍的人數」，水電
// 瓦斯/其他費用才能按人頭平分。
function residentOverlapDays(h, range) {
  if (h.completed || !h.checkIn) return 0;
  return dateOverlapDays(range.start, range.end, h.checkIn, h.checkOut);
}

const PAYMENT_STATUSES = ['未收款', '先繳部分', '全額付清'];

// 舊資料相容：
// 1. 改版前只有 received(布林)/receivedDate 兩個欄位，沒有 status——沒有
//    status 欄位的舊紀錄依 received 換算成新狀態，才不會改版後舊資料全部
//    看起來變成「未收款」。
// 2. 先繳部分支援多筆輸入之前，是單一 partialAmount/partialDate 欄位——
//    沒有 partialPayments 陣列、但有舊的 partialAmount 欄位時，換算成只有
//    一筆的陣列，不會讓剛上版時填過的資料憑空消失。
function effectivePayment(p) {
  if (!p) return { status: '未收款' };
  let result = p;
  if (!result.status) {
    result = result.received ? { ...result, status: '全額付清', fullPaidDate: result.receivedDate || '' } : { ...result, status: '未收款' };
  }
  if (result.status === '先繳部分' && !result.partialPayments && (result.partialAmount || result.partialDate)) {
    result = { ...result, partialPayments: JSON.stringify([{ amount: result.partialAmount || '', date: result.partialDate || '' }]) };
  }
  return result;
}

// 已收款金額：全額付清算整筆應繳金額(total)；先繳部分加總所有已填的部分
// 付款筆數；未收款算 0。未繳總表用「應繳金額－已收款金額」算剩餘未繳。
function paidAmountOf(p, total) {
  if (p.status === '全額付清') return total;
  if (p.status === '先繳部分') return parsePartialPayments(p.partialPayments).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  return 0;
}

// 學生請款計算：只要當月有住宿舍（不論廠商代付或學生自付）都列進來計算；
// 自付宿舍費只有「學生自付」才試算（廠商代付的宿舍費不跟學生收），水費/
// 電費/瓦斯費/其他費用則不分付款方式，取自 宿舍管理「填寫其他費用」當月
// 整間宿舍的紀錄，依「這個月住過這間宿舍的人數」平分到每個人身上，再跟
// 自付宿舍費加總成這個學生這個月要付的總金額。
const DAILY_EXPENSE_BILLABLE_STATUSES = ['已核准', '已匯款'];

// 先繳部分明細：可以分好幾筆填(每筆金額+日期各自一列)，輸入框用
// defaultValue+key(依內容變化)而不是 controlled value，避免打字打到一半
// 被即時存檔觸發的重新渲染蓋掉；key 包含金額/日期本身，commit 後 key 換了
// 才重新掛載，新增/刪除某一筆造成後面筆數的 index 位移時顯示的內容也會
// 正確更新(不會卡著舊的顯示值)。
function PartialPaymentsEditor({ payment, canEditPage, onAdd, onUpdate, onRemove }) {
  const entries = parsePartialPayments(payment.partialPayments);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {entries.map((entry, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            key={`amount-${i}-${entry.amount}`}
            type="number"
            defaultValue={entry.amount || ''}
            disabled={!canEditPage}
            onBlur={(e) => onUpdate(i, 'amount', e.target.value)}
            placeholder="金額"
            style={{ width: 80 }}
          />
          <input
            key={`date-${i}-${entry.date}`}
            type="date"
            defaultValue={entry.date || ''}
            disabled={!canEditPage}
            onBlur={(e) => onUpdate(i, 'date', e.target.value)}
            style={{ width: 130 }}
          />
          {canEditPage && <button onClick={() => onRemove(i)}>×</button>}
        </div>
      ))}
      {canEditPage ? <button onClick={onAdd}>+ 新增一筆</button> : (entries.length === 0 && <span className="muted">—</span>)}
    </div>
  );
}

export default function StudentBillingPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'studentBilling', role, overrides);
  const { rows: housingRecords, loading: loadingHousing } = useCollection('tsaipei_housingRecords');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: dormitories } = useCollection('tsaipei_dormitories');
  const { rows: utilities } = useCollection('tsaipei_dormitoryUtilities');
  const { rows: dailyExpenseApplications } = useCollection('tsaipei_dailyExpenseApplications');
  const { rows: payments, add: addPayment, update: updatePayment } = useCollection('tsaipei_studentBillingPayments');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const [view, setView] = useState('monthly');
  const [q, setQ] = useState('');
  const [month, setMonth] = useState(currentMonthStr());
  const [year, setYear] = useState(currentYear());

  const pairCtx = { matches, admittedList, positions };

  function paymentFor(studentId, monthStr) {
    if (!studentId) return null;
    return effectivePayment(payments.find((p) => p.studentId === studentId && p.month === monthStr) || null);
  }

  // 收款狀態/金額/日期：每個學生每個月各一筆，upsert（找得到當月既有紀錄
  // 就更新，找不到就新增）。
  async function upsertPayment(studentId, monthStr, patch) {
    if (!studentId) return;
    try {
      const existing = payments.find((p) => p.studentId === studentId && p.month === monthStr);
      if (existing) await updatePayment(existing.id, patch);
      else await addPayment({ studentId, month: monthStr, status: '未收款', fullPaidDate: '', partialPayments: '[]', ...patch });
    } catch (err) {
      alert(`儲存失敗：${err.message || err}`);
    }
  }

  function handleStatusChange(studentId, monthStr, status) {
    if (status === '全額付清') {
      const existing = paymentFor(studentId, monthStr);
      upsertPayment(studentId, monthStr, { status, fullPaidDate: existing.fullPaidDate || new Date().toISOString().slice(0, 10) });
    } else {
      upsertPayment(studentId, monthStr, { status });
    }
  }

  function handleFullPaidDateChange(studentId, monthStr, fullPaidDate) {
    upsertPayment(studentId, monthStr, { status: '全額付清', fullPaidDate });
  }

  // 先繳部分可以分好幾筆填(每筆各自金額+日期)：新增一筆空白(日期預設今天)、
  // 修改某一筆的金額或日期、刪除某一筆，都是整個陣列重新存回 partialPayments。
  function handleAddPartialPayment(studentId, monthStr) {
    const existing = paymentFor(studentId, monthStr);
    const entries = parsePartialPayments(existing.partialPayments);
    entries.push({ amount: '', date: new Date().toISOString().slice(0, 10) });
    upsertPayment(studentId, monthStr, { status: '先繳部分', partialPayments: JSON.stringify(entries) });
  }

  function handleUpdatePartialPayment(studentId, monthStr, index, field, value) {
    const existing = paymentFor(studentId, monthStr);
    const entries = parsePartialPayments(existing.partialPayments);
    if (!entries[index]) return;
    entries[index] = { ...entries[index], [field]: value };
    upsertPayment(studentId, monthStr, { status: '先繳部分', partialPayments: JSON.stringify(entries) });
  }

  function handleRemovePartialPayment(studentId, monthStr, index) {
    const existing = paymentFor(studentId, monthStr);
    const entries = parsePartialPayments(existing.partialPayments).filter((_, i) => i !== index);
    upsertPayment(studentId, monthStr, { partialPayments: JSON.stringify(entries) });
  }

  // 未繳總表「點金額標記」的快速動作：直接標記全額付清，收款日期預設今天。
  function markFullyPaid(studentId, monthStr) {
    const existing = paymentFor(studentId, monthStr);
    upsertPayment(studentId, monthStr, { status: '全額付清', fullPaidDate: existing.fullPaidDate || new Date().toISOString().slice(0, 10) });
  }

  // 其他費用除了宿舍共用的分攤之外，還要加上這個學生自己名下、日常支出
  // 申請裡類型=收入、已核准/已匯款、日期落在這個月的金額加總。
  function studentIncomeTotal(studentId, monthStr) {
    if (!studentId) return 0;
    return dailyExpenseApplications
      .filter((app) => app.studentId === studentId)
      .filter((app) => (app.type || '支出') === '收入')
      .filter((app) => DAILY_EXPENSE_BILLABLE_STATUSES.includes(app.status))
      .filter((app) => (app.date || '').slice(0, 7) === monthStr)
      .reduce((sum, app) => sum + (Number(app.amount) || 0), 0);
  }

  function dormIdByName(name) {
    return dormitories.find((d) => d.name === name)?.id || '';
  }

  function utilityFor(dormName, monthStr) {
    const dormId = dormIdByName(dormName);
    if (!dormId) return null;
    return utilities.find((u) => u.dormitoryId === dormId && u.month === monthStr) || null;
  }

  function residentCountOf(dormName, range) {
    return housingRecords.filter((h) => h.type === dormName && residentOverlapDays(h, range) > 0).length;
  }

  function billingFor(h, monthStr, range) {
    const days = residentOverlapDays(h, range);
    const selfPayDormFee = h.payer === '學生自付' && h.monthlyRent ? Math.round((Number(h.monthlyRent) / range.daysInMonth) * days) : 0;
    const u = utilityFor(h.type, monthStr);
    const residentCount = residentCountOf(h.type, range);
    const otherFeesTotal = parseOtherFees(u?.otherFees).reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
    const perHead = (amount) => (residentCount > 0 ? Math.round((Number(amount) || 0) / residentCount) : 0);
    const waterFee = perHead(u?.waterFee);
    const electricityFee = perHead(u?.electricityFee);
    const gasFee = perHead(u?.gasFee);
    const otherFees = perHead(otherFeesTotal) + studentIncomeTotal(h.studentId, monthStr);
    const total = selfPayDormFee + waterFee + electricityFee + gasFee + otherFees;
    return { days, selfPayDormFee, waterFee, electricityFee, gasFee, otherFees, total };
  }

  function internshipLabel(studentId) {
    const pair = studentProjectClientPair(studentId, pairCtx);
    if (!pair) return '—';
    return [pair.projectCode, pair.client].filter(Boolean).join(' ') || '—';
  }

  const range = monthRange(month);
  const query = q.trim().toLowerCase();
  const filtered = housingRecords.filter((h) => {
    if (residentOverlapDays(h, range) <= 0) return false;
    if (!query) return true;
    const text = `${studentFullLabel(students.find((s) => s.id === h.studentId))} ${h.type || ''}`.toLowerCase();
    return text.includes(query);
  });

  const groups = {};
  filtered.forEach((h) => {
    const key = h.type || '未指定宿舍';
    (groups[key] ||= []).push(h);
  });
  const groupKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  function handleDownload() {
    const rows = filtered.map((h) => {
      const b = billingFor(h, month, range);
      const p = paymentFor(h.studentId, month);
      const remaining = Math.max(0, b.total - paidAmountOf(p, b.total));
      const partialDetail = p.status === '先繳部分'
        ? parsePartialPayments(p.partialPayments).map((e) => `${e.amount || 0}元(${e.date || '未填日期'})`).join('；')
        : '';
      return {
        dorm: h.type || '',
        studentName: studentFullLabel(students.find((s) => s.id === h.studentId)),
        payer: h.payer || '',
        days: b.days,
        selfPayDormFee: b.selfPayDormFee,
        waterFee: b.waterFee,
        electricityFee: b.electricityFee,
        gasFee: b.gasFee,
        otherFees: b.otherFees,
        total: b.total,
        status: p.status,
        partialDetail,
        fullPaidDate: p.status === '全額付清' ? (p.fullPaidDate || '') : '',
        remaining,
      };
    });
    exportEntityCSV(rows, [
      { key: 'dorm', label: '宿舍名稱' }, { key: 'studentName', label: '學生' }, { key: 'payer', label: '付款方式' }, { key: 'days', label: '當月天數' },
      { key: 'selfPayDormFee', label: '自付宿舍費' }, { key: 'waterFee', label: '水費' }, { key: 'electricityFee', label: '電費' },
      { key: 'gasFee', label: '瓦斯費' }, { key: 'otherFees', label: '其他費用' }, { key: 'total', label: '合計' },
      { key: 'status', label: '收款狀態' }, { key: 'partialDetail', label: '先繳部分明細' },
      { key: 'fullPaidDate', label: '全額付清日期' }, { key: 'remaining', label: '剩餘餘額' },
    ], `學生請款計算_${month}`);
  }

  // 未繳總表：一個學生一列，橫向 1-12 月各一欄，掃過選定年度每個月重算
  // 每筆住宿紀錄的應繳金額減掉已收款金額(先繳部分扣已繳的金額，全額付清
  // 整筆扣掉變 0)，只填還有剩餘未繳金額的月份——一旦在分月明細標記全額
  // 付清，那個月的欄位就會變空白；先繳部分則顯示還沒繳的差額，不需要另外
  // 維護一份「未繳」資料。
  const unpaidByStudent = {};
  for (let m = 1; m <= 12; m++) {
    const monthStr = `${year}-${String(m).padStart(2, '0')}`;
    const mRange = monthRange(monthStr);
    housingRecords.forEach((h) => {
      if (residentOverlapDays(h, mRange) <= 0) return;
      const b = billingFor(h, monthStr, mRange);
      if (!b.total) return;
      const p = paymentFor(h.studentId, monthStr);
      const remaining = Math.max(0, b.total - paidAmountOf(p, b.total));
      if (!remaining) return;
      const entry = (unpaidByStudent[h.studentId] ||= {
        studentId: h.studentId,
        studentName: studentFullLabel(students.find((s) => s.id === h.studentId)),
        internship: internshipLabel(h.studentId),
        months: {},
      });
      entry.months[m] = (entry.months[m] || 0) + remaining;
    });
  }
  const unpaidQuery = q.trim().toLowerCase();
  const filteredUnpaid = Object.values(unpaidByStudent)
    .filter((r) => !unpaidQuery || `${r.studentName} ${r.internship}`.toLowerCase().includes(unpaidQuery))
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
  const MONTH_NUMS = Array.from({ length: 12 }, (_, i) => i + 1);
  const unpaidGrandTotal = filteredUnpaid.reduce((sum, r) => sum + MONTH_NUMS.reduce((s, m) => s + (r.months[m] || 0), 0), 0);

  function handleDownloadUnpaid() {
    const rows = filteredUnpaid.map((r) => {
      const row = { studentName: r.studentName, internship: r.internship };
      MONTH_NUMS.forEach((m) => { row[`m${m}`] = r.months[m] || ''; });
      return row;
    });
    exportEntityCSV(rows, [
      { key: 'studentName', label: '學生' }, { key: 'internship', label: '實習單位' },
      ...MONTH_NUMS.map((m) => ({ key: `m${m}`, label: `${m}月` })),
    ], `學生請款未繳總表_${year}`);
  }

  const loading = loadingHousing;

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>學生請款計算</h2>
          <div className="page-desc">
            {view === 'monthly'
              ? '只要當月有住宿舍（廠商代付、學生自付）都列入；自付宿舍費只有學生自付才試算；水電瓦斯費取自宿舍管理當月填寫的紀錄，依該宿舍當月住過的人數平分；其他費用=宿舍管理分攤的其他費用+該學生名下日常支出申請(收入、已核准/已匯款、當月)金額；收款狀態分「未收款」「先繳部分(可分好幾筆填金額+日期)」「全額付清(填日期)」三種，剩餘餘額=合計－已收款金額'
              : '彙整選定年度每個月還有剩餘未繳金額的月份；全額付清的月份會從總表消失，先繳部分的月份顯示還沒繳的差額'}
          </div>
        </div>
        <div className="row-actions">
          <button className={view === 'monthly' ? 'primary' : ''} onClick={() => setView('monthly')}>分月明細</button>
          <button className={view === 'unpaid' ? 'primary' : ''} onClick={() => setView('unpaid')}>未繳總表</button>
        </div>
      </div>

      {view === 'monthly' ? (
        <>
          <div className="row-actions" style={{ marginBottom: 16 }}>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <button onClick={handleDownload}>下載此月份報表</button>
          </div>
          <input placeholder="搜尋學生或宿舍名稱" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
          {loading ? <p className="muted">載入中…</p> : (
            groupKeys.length === 0 ? <p className="muted">{query ? '沒有符合搜尋條件的紀錄。' : '目前沒有住宿中的紀錄。'}</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {groupKeys.map((key) => (
                  <div className="card" key={key}>
                    <h3 style={{ marginTop: 0 }}>{key} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[key].length} 位學生</span></h3>
                    <div className="table-wrap"><table>
                      <thead><tr><th>學生</th><th>付款方式</th><th>當月天數</th><th>自付宿舍費</th><th>水費</th><th>電費</th><th>瓦斯費</th><th>其他費用</th><th>合計</th><th>收款狀態</th><th>金額/日期明細</th><th>剩餘餘額</th></tr></thead>
                      <tbody>
                        {groups[key].map((h) => {
                          const b = billingFor(h, month, range);
                          const p = paymentFor(h.studentId, month);
                          const remaining = Math.max(0, b.total - paidAmountOf(p, b.total));
                          return (
                            <tr key={h.id}>
                              <td style={{ fontWeight: 600 }}>{studentFullLabel(students.find((s) => s.id === h.studentId))}</td>
                              <td>{h.payer || '—'}</td>
                              <td>{b.days}</td>
                              <td>{b.selfPayDormFee.toLocaleString()}</td>
                              <td>{b.waterFee.toLocaleString()}</td>
                              <td>{b.electricityFee.toLocaleString()}</td>
                              <td>{b.gasFee.toLocaleString()}</td>
                              <td>{b.otherFees.toLocaleString()}</td>
                              <td style={{ fontWeight: 600 }}>{b.total.toLocaleString()}</td>
                              <td>
                                <select
                                  value={p.status}
                                  disabled={!canEditPage}
                                  onChange={(e) => handleStatusChange(h.studentId, month, e.target.value)}
                                >
                                  {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </td>
                              <td>
                                {p.status === '全額付清' ? (
                                  <input
                                    type="date"
                                    value={p.fullPaidDate || ''}
                                    disabled={!canEditPage}
                                    onChange={(e) => handleFullPaidDateChange(h.studentId, month, e.target.value)}
                                    style={{ width: 140 }}
                                  />
                                ) : p.status === '先繳部分' ? (
                                  <PartialPaymentsEditor
                                    payment={p}
                                    canEditPage={canEditPage}
                                    onAdd={() => handleAddPartialPayment(h.studentId, month)}
                                    onUpdate={(i, field, value) => handleUpdatePartialPayment(h.studentId, month, i, field, value)}
                                    onRemove={(i) => handleRemovePartialPayment(h.studentId, month, i)}
                                  />
                                ) : '—'}
                              </td>
                              <td style={{ fontWeight: 600, color: remaining > 0 ? 'var(--danger)' : undefined }}>{remaining.toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table></div>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      ) : (
        <>
          <div className="row-actions" style={{ marginBottom: 16 }}>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || currentYear())} style={{ width: 100 }} />
            <button onClick={handleDownloadUnpaid}>下載未繳總表</button>
          </div>
          <input placeholder="搜尋學生或實習單位" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
          {loading ? <p className="muted">載入中…</p> : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <h3 style={{ marginTop: 0 }}>{year}年未繳總表 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{filteredUnpaid.length} 位學生，合計 {unpaidGrandTotal.toLocaleString()} 元{canEditPage && '（點金額可直接標記該月全額付清；先繳部分的差額要到分月明細填寫）'}</span></h3>
              <div className="table-wrap"><table>
                <thead><tr><th>學生</th><th>實習單位</th>{MONTH_NUMS.map((m) => <th key={m}>{m}月</th>)}<th>總計</th></tr></thead>
                <tbody>
                  {filteredUnpaid.map((r) => {
                    const rowTotal = MONTH_NUMS.reduce((s, m) => s + (r.months[m] || 0), 0);
                    return (
                      <tr key={r.studentId}>
                        <td style={{ fontWeight: 600 }}>{r.studentName}</td>
                        <td>{r.internship}</td>
                        {MONTH_NUMS.map((m) => {
                          const amt = r.months[m] || 0;
                          if (!amt) return <td key={m}>—</td>;
                          return (
                            <td key={m}>
                              {canEditPage ? (
                                <button
                                  className="link-button"
                                  title="點選標記這個月全額付清"
                                  onClick={() => markFullyPaid(r.studentId, `${year}-${String(m).padStart(2, '0')}`)}
                                >
                                  {amt.toLocaleString()}
                                </button>
                              ) : amt.toLocaleString()}
                            </td>
                          );
                        })}
                        <td style={{ fontWeight: 600 }}>{rowTotal.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                  {filteredUnpaid.length === 0 && <tr><td colSpan={15} className="muted">{unpaidQuery ? '沒有符合搜尋條件的未繳紀錄。' : '目前沒有未繳紀錄。'}</td></tr>}
                </tbody>
              </table></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
