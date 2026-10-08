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

// 「住宿中」的判斷跟 宿舍管理/住宿安排 同一套邏輯：已完成的不算、沒有入住
// 日的不算、退宿日已過的也不算。用這個算「這個月住過這間宿舍的人數」，水電
// 瓦斯/其他費用才能按人頭平分。
function residentOverlapDays(h, range) {
  if (h.completed || !h.checkIn) return 0;
  return dateOverlapDays(range.start, range.end, h.checkIn, h.checkOut);
}

// 學生請款計算：只要當月有住宿舍（不論廠商代付或學生自付）都列進來計算；
// 自付宿舍費只有「學生自付」才試算（廠商代付的宿舍費不跟學生收），水費/
// 電費/瓦斯費/其他費用則不分付款方式，取自 宿舍管理「填寫其他費用」當月
// 整間宿舍的紀錄，依「這個月住過這間宿舍的人數」平分到每個人身上，再跟
// 自付宿舍費加總成這個學生這個月要付的總金額。
const DAILY_EXPENSE_BILLABLE_STATUSES = ['已核准', '已匯款'];

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
    return payments.find((p) => p.studentId === studentId && p.month === monthStr) || null;
  }

  // 已收款/收款日期：每個學生每個月各一筆，upsert（找得到當月既有紀錄就
  // 更新，找不到就新增）。
  async function handleTogglePaid(studentId, monthStr, checked) {
    if (!studentId) return;
    try {
      const existing = paymentFor(studentId, monthStr);
      const receivedDate = checked ? (existing?.receivedDate || new Date().toISOString().slice(0, 10)) : '';
      if (existing) await updatePayment(existing.id, { received: checked, receivedDate });
      else await addPayment({ studentId, month: monthStr, received: checked, receivedDate });
    } catch (err) {
      alert(`儲存失敗：${err.message || err}`);
    }
  }

  async function handlePaidDateChange(studentId, monthStr, receivedDate) {
    if (!studentId) return;
    try {
      const existing = paymentFor(studentId, monthStr);
      if (existing) await updatePayment(existing.id, { receivedDate });
      else await addPayment({ studentId, month: monthStr, received: !!receivedDate, receivedDate });
    } catch (err) {
      alert(`儲存失敗：${err.message || err}`);
    }
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
        received: p?.received ? '是' : '否',
        receivedDate: p?.receivedDate || '',
      };
    });
    exportEntityCSV(rows, [
      { key: 'dorm', label: '宿舍名稱' }, { key: 'studentName', label: '學生' }, { key: 'payer', label: '付款方式' }, { key: 'days', label: '當月天數' },
      { key: 'selfPayDormFee', label: '自付宿舍費' }, { key: 'waterFee', label: '水費' }, { key: 'electricityFee', label: '電費' },
      { key: 'gasFee', label: '瓦斯費' }, { key: 'otherFees', label: '其他費用' }, { key: 'total', label: '合計' },
      { key: 'received', label: '已收款' }, { key: 'receivedDate', label: '收款日期' },
    ], `學生請款計算_${month}`);
  }

  // 未繳總表：一個學生一列，橫向 1-12 月各一欄，掃過選定年度每個月重算
  // 每筆住宿紀錄的應繳金額，只填「有金額但沒有已收款紀錄」的月份——一旦
  // 在分月明細勾選已收款，那個月的欄位就會變空白，不需要另外維護一份
  // 「未繳」資料。
  const unpaidByStudent = {};
  for (let m = 1; m <= 12; m++) {
    const monthStr = `${year}-${String(m).padStart(2, '0')}`;
    const mRange = monthRange(monthStr);
    housingRecords.forEach((h) => {
      if (residentOverlapDays(h, mRange) <= 0) return;
      const b = billingFor(h, monthStr, mRange);
      if (!b.total) return;
      const p = paymentFor(h.studentId, monthStr);
      if (p?.received) return;
      const entry = (unpaidByStudent[h.studentId] ||= {
        studentId: h.studentId,
        studentName: studentFullLabel(students.find((s) => s.id === h.studentId)),
        internship: internshipLabel(h.studentId),
        months: {},
      });
      entry.months[m] = (entry.months[m] || 0) + b.total;
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
              ? '只要當月有住宿舍（廠商代付、學生自付）都列入；自付宿舍費只有學生自付才試算；水電瓦斯費取自宿舍管理當月填寫的紀錄，依該宿舍當月住過的人數平分；其他費用=宿舍管理分攤的其他費用+該學生名下日常支出申請(收入、已核准/已匯款、當月)金額'
              : '彙整選定年度每個月未勾選「已收款」的應繳金額；只要在分月明細勾選已收款，這筆就會從這份總表消失'}
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
                      <thead><tr><th>學生</th><th>付款方式</th><th>當月天數</th><th>自付宿舍費</th><th>水費</th><th>電費</th><th>瓦斯費</th><th>其他費用</th><th>合計</th><th>已收款</th><th>收款日期</th></tr></thead>
                      <tbody>
                        {groups[key].map((h) => {
                          const b = billingFor(h, month, range);
                          const p = paymentFor(h.studentId, month);
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
                                <input
                                  type="checkbox"
                                  checked={!!p?.received}
                                  disabled={!canEditPage}
                                  onChange={(e) => handleTogglePaid(h.studentId, month, e.target.checked)}
                                />
                              </td>
                              <td>
                                <input
                                  type="date"
                                  value={p?.receivedDate || ''}
                                  disabled={!canEditPage}
                                  onChange={(e) => handlePaidDateChange(h.studentId, month, e.target.value)}
                                  style={{ width: 140 }}
                                />
                              </td>
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
              <h3 style={{ marginTop: 0 }}>{year}年未繳總表 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{filteredUnpaid.length} 位學生，合計 {unpaidGrandTotal.toLocaleString()} 元{canEditPage && '（點金額可直接標記該月已收款）'}</span></h3>
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
                                  title="點選標記這個月已收款"
                                  onClick={() => handleTogglePaid(r.studentId, `${year}-${String(m).padStart(2, '0')}`, true)}
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
