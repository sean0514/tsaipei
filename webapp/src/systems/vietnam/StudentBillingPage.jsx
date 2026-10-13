import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { exportEntityCSV } from '../../lib/csv';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { useSystemProfile } from '../../auth/useSystemAccess';
import { studentProjectClientPair, currentYear } from '../../lib/bonus';
import { t } from '../../lib/i18n';

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

function operatorsLabel(r, lang) {
  if (r.operators.size) return [...r.operators].join('、');
  if (r.hasUnattributedActivity) return t('（舊資料無記錄）', lang);
  return '—';
}

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

function parsePartialPayments(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function residentOverlapDays(h, range) {
  if (h.completed || !h.checkIn) return 0;
  return dateOverlapDays(range.start, range.end, h.checkIn, h.checkOut);
}

const PAYMENT_STATUSES = ['未收款', '先繳部分', '全額付清'];

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

function nextMonthStr(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const DAILY_EXPENSE_BILLABLE_STATUSES = ['已核准', '已匯款'];

function PartialPaymentsEditor({ payment, canEditPage, onAdd, onUpdate, onRemove, lang }) {
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
            placeholder={t('金額', lang)}
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
      {canEditPage ? <button onClick={onAdd}>+ {t('新增一筆', lang)}</button> : (entries.length === 0 && <span className="muted">—</span>)}
    </div>
  );
}

// 複製自 systems/tsaipei/StudentBillingPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function StudentBillingPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'studentBilling', role, overrides);
  const profile = useSystemProfile(system);
  const operatorName = profile?.displayName || profile?.email || '';
  const { rows: housingRecords, loading: loadingHousing } = useCollection('vietnam_housingRecords');
  const { rows: students } = useCollection('vietnam_students');
  const { rows: dormitories } = useCollection('vietnam_dormitories');
  const { rows: utilities } = useCollection('vietnam_dormitoryUtilities');
  const { rows: dailyExpenseApplications } = useCollection('vietnam_dailyExpenseApplications');
  const { rows: payments, add: addPayment, update: updatePayment } = useCollection('vietnam_studentBillingPayments');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: positions } = useCollection('vietnam_positions');
  const [view, setView] = useState('monthly');
  const [q, setQ] = useState('');
  const [month, setMonth] = useState(currentMonthStr());
  const [year, setYear] = useState(currentYear());

  const pairCtx = { matches, admittedList, positions };

  function paymentFor(studentId, monthStr) {
    if (!studentId) return null;
    return effectivePayment(payments.find((p) => p.studentId === studentId && p.month === monthStr) || null);
  }

  async function upsertPayment(studentId, monthStr, patch) {
    if (!studentId) return;
    try {
      const stamped = { ...patch, updatedBy: operatorName, updatedAt: new Date().toISOString() };
      const existing = payments.find((p) => p.studentId === studentId && p.month === monthStr);
      if (existing) await updatePayment(existing.id, stamped);
      else await addPayment({ studentId, month: monthStr, status: '未收款', fullPaidDate: '', partialPayments: '[]', ...stamped });
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

  function markFullyPaid(studentId, monthStr) {
    const existing = paymentFor(studentId, monthStr);
    upsertPayment(studentId, monthStr, { status: '全額付清', fullPaidDate: existing.fullPaidDate || new Date().toISOString().slice(0, 10) });
  }

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

  function studentMonthBounds(studentId) {
    const today = new Date().toISOString().slice(0, 10);
    let minMonth = null;
    let maxMonth = null;
    housingRecords.forEach((h) => {
      if (h.studentId !== studentId || !h.checkIn) return;
      const startM = h.checkIn.slice(0, 7);
      const endM = (h.checkOut || today).slice(0, 7);
      if (!minMonth || startM < minMonth) minMonth = startM;
      if (!maxMonth || endM > maxMonth) maxMonth = endM;
    });
    return { minMonth, maxMonth };
  }

  function buildStudentLedger(studentId) {
    const { minMonth, maxMonth } = studentMonthBounds(studentId);
    const ledger = {};
    if (!minMonth) return ledger;
    let credit = 0;
    let m = minMonth;
    let guard = 0;
    while (m <= maxMonth && guard < 1200) {
      guard += 1;
      const mRange = monthRange(m);
      const owed = housingRecords
        .filter((h) => h.studentId === studentId && residentOverlapDays(h, mRange) > 0)
        .reduce((sum, h) => sum + billingFor(h, m, mRange).total, 0);
      const p = paymentFor(studentId, m);
      let remaining;
      let creditAfter;
      if (p.status === '全額付清') {
        remaining = 0;
        creditAfter = credit;
      } else {
        const paid = p.status === '先繳部分'
          ? parsePartialPayments(p.partialPayments).reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
          : 0;
        const available = credit + paid;
        if (available >= owed) { remaining = 0; creditAfter = available - owed; } else { remaining = owed - available; creditAfter = 0; }
      }
      ledger[m] = { owed, remaining, creditAfter };
      credit = creditAfter;
      m = nextMonthStr(m);
    }
    return ledger;
  }

  const ledgerCache = {};
  function ledgerFor(studentId) {
    return (ledgerCache[studentId] ||= buildStudentLedger(studentId));
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
      const ledgerEntry = ledgerFor(h.studentId)[month] || { remaining: b.total, creditAfter: 0 };
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
        remaining: ledgerEntry.remaining,
        overpaidCredit: ledgerEntry.creditAfter,
      };
    });
    exportEntityCSV(rows, [
      { key: 'dorm', label: '宿舍名稱' }, { key: 'studentName', label: '學生' }, { key: 'payer', label: '付款方式' }, { key: 'days', label: '當月天數' },
      { key: 'selfPayDormFee', label: '自付宿舍費' }, { key: 'waterFee', label: '水費' }, { key: 'electricityFee', label: '電費' },
      { key: 'gasFee', label: '瓦斯費' }, { key: 'otherFees', label: '其他費用' }, { key: 'total', label: '合計' },
      { key: 'status', label: '收款狀態' }, { key: 'partialDetail', label: '先繳部分明細' },
      { key: 'fullPaidDate', label: '全額付清日期' }, { key: 'remaining', label: '剩餘餘額' }, { key: 'overpaidCredit', label: '溢繳餘額(可抵次月)' },
    ], `學生請款計算_${month}`);
  }

  const unpaidByStudent = {};
  const unpaidStudentIds = [...new Set(housingRecords.filter((h) => h.studentId).map((h) => h.studentId))];
  unpaidStudentIds.forEach((studentId) => {
    const ledger = ledgerFor(studentId);
    for (let m = 1; m <= 12; m++) {
      const monthStr = `${year}-${String(m).padStart(2, '0')}`;
      const ledgerEntry = ledger[monthStr];
      if (!ledgerEntry || !ledgerEntry.remaining) continue;
      const entry = (unpaidByStudent[studentId] ||= {
        studentId,
        studentName: studentFullLabel(students.find((s) => s.id === studentId)),
        internship: internshipLabel(studentId),
        months: {},
        operators: new Set(),
        hasUnattributedActivity: false,
      });
      entry.months[m] = ledgerEntry.remaining;
      const p = paymentFor(studentId, monthStr);
      if (p.updatedBy) entry.operators.add(p.updatedBy);
      else if (p.status && p.status !== '未收款') entry.hasUnattributedActivity = true;
    }
  });
  const unpaidQuery = q.trim().toLowerCase();
  const filteredUnpaid = Object.values(unpaidByStudent)
    .filter((r) => !unpaidQuery || `${r.studentName} ${r.internship}`.toLowerCase().includes(unpaidQuery))
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
  const MONTH_NUMS = Array.from({ length: 12 }, (_, i) => i + 1);
  const unpaidGrandTotal = filteredUnpaid.reduce((sum, r) => sum + MONTH_NUMS.reduce((s, m) => s + (r.months[m] || 0), 0), 0);

  function handleDownloadUnpaid() {
    const rows = filteredUnpaid.map((r) => {
      const row = { studentName: r.studentName, internship: r.internship, operators: operatorsLabel(r, lang) };
      let rowTotal = 0;
      MONTH_NUMS.forEach((m) => {
        const amt = r.months[m] || 0;
        row[`m${m}`] = amt || '';
        rowTotal += amt;
      });
      row.total = rowTotal;
      return row;
    });
    const grandTotalRow = { studentName: '總計', internship: '', operators: '' };
    MONTH_NUMS.forEach((m) => { grandTotalRow[`m${m}`] = filteredUnpaid.reduce((sum, r) => sum + (r.months[m] || 0), 0) || ''; });
    grandTotalRow.total = unpaidGrandTotal;
    exportEntityCSV([...rows, grandTotalRow], [
      { key: 'studentName', label: '學生' }, { key: 'internship', label: '實習單位' }, { key: 'operators', label: '核准人(標記收款的人)' },
      ...MONTH_NUMS.map((m) => ({ key: `m${m}`, label: `${m}月` })),
      { key: 'total', label: '總計' },
    ], `學生請款未繳總表_${year}`);
  }

  const loading = loadingHousing;

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('學生請款計算', lang)}</h2>
          <div className="page-desc">
            {view === 'monthly'
              ? t('只要當月有住宿舍（廠商代付、學生自付）都列入；自付宿舍費只有學生自付才試算；水電瓦斯費取自宿舍管理當月填寫的紀錄，依該宿舍當月住過的人數平分；其他費用=宿舍管理分攤的其他費用+該學生名下日常支出申請(收入、已核准/已匯款、當月)金額；收款狀態分「未收款」「先繳部分(可分好幾筆填金額+日期)」「全額付清(填日期)」三種；剩餘餘額會自動把前面月份結餘的溢繳額度/累積欠款都算進去——多繳的錢自動抵次月的應繳金額，欠款也會一路累積到補繳為止', lang)
              : t('依學生收款總帳列出選定年度每個月的剩餘未繳金額(已經把前面月份的溢繳抵充、欠款累積算進去了)；某個月的欠款完全被抵完(不論靠這個月收的錢還是前面月份結餘的溢繳額度)才會從總表消失；核准人=這個學生有未繳月份裡標記過收款狀態的人；表格最下面跟下載的 CSV 都有每月加總的總計列', lang)}
          </div>
        </div>
        <div className="row-actions">
          <button className={view === 'monthly' ? 'primary' : ''} onClick={() => setView('monthly')}>{t('分月明細', lang)}</button>
          <button className={view === 'unpaid' ? 'primary' : ''} onClick={() => setView('unpaid')}>{t('未繳總表', lang)}</button>
        </div>
      </div>

      {view === 'monthly' ? (
        <>
          <div className="row-actions" style={{ marginBottom: 16 }}>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <button onClick={handleDownload}>{t('下載此月份報表', lang)}</button>
          </div>
          <input placeholder={t('搜尋學生或宿舍名稱', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
          {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
            groupKeys.length === 0 ? <p className="muted">{query ? t('沒有符合搜尋條件的紀錄。', lang) : t('目前沒有住宿中的紀錄。', lang)}</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {groupKeys.map((key) => (
                  <div className="card" key={key}>
                    <h3 style={{ marginTop: 0 }}>{key} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[key].length} {t('位學生', lang)}</span></h3>
                    <div className="table-wrap"><table>
                      <thead><tr><th>{t('學生', lang)}</th><th>{t('付款方式', lang)}</th><th>{t('當月天數', lang)}</th><th>{t('自付宿舍費', lang)}</th><th>{t('水費', lang)}</th><th>{t('電費', lang)}</th><th>{t('瓦斯費', lang)}</th><th>{t('其他費用', lang)}</th><th>{t('合計', lang)}</th><th>{t('收款狀態', lang)}</th><th>{t('金額/日期明細', lang)}</th><th>{t('剩餘餘額', lang)}</th></tr></thead>
                      <tbody>
                        {groups[key].map((h) => {
                          const b = billingFor(h, month, range);
                          const p = paymentFor(h.studentId, month);
                          const ledgerEntry = ledgerFor(h.studentId)[month] || { remaining: b.total, creditAfter: 0 };
                          const { remaining, creditAfter: overpaidCredit } = ledgerEntry;
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
                                    lang={lang}
                                  />
                                ) : '—'}
                              </td>
                              <td style={{ fontWeight: 600, color: remaining > 0 ? 'var(--danger)' : undefined }}>
                                {remaining.toLocaleString()}
                                {remaining === 0 && overpaidCredit > 0 && (
                                  <div className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{t('溢繳', lang)} {overpaidCredit.toLocaleString()}（{t('可抵次月', lang)}）</div>
                                )}
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
            <button onClick={handleDownloadUnpaid}>{t('下載未繳總表', lang)}</button>
          </div>
          <input placeholder={t('搜尋學生或實習單位', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
          {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <h3 style={{ marginTop: 0 }}>{year}{t('年未繳總表', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{filteredUnpaid.length} {t('位學生，合計', lang)} {unpaidGrandTotal.toLocaleString()} {t('元', lang)}{canEditPage && `（${t('點金額可直接標記該月全額付清；先繳部分的差額要到分月明細填寫', lang)}）`}</span></h3>
              <div className="table-wrap"><table>
                <thead><tr><th>{t('學生', lang)}</th><th>{t('實習單位', lang)}</th><th>{t('核准人', lang)}</th>{MONTH_NUMS.map((m) => <th key={m}>{m}{t('月', lang)}</th>)}<th>{t('總計', lang)}</th></tr></thead>
                <tbody>
                  {filteredUnpaid.map((r) => {
                    const rowTotal = MONTH_NUMS.reduce((s, m) => s + (r.months[m] || 0), 0);
                    return (
                      <tr key={r.studentId}>
                        <td style={{ fontWeight: 600 }}>{r.studentName}</td>
                        <td>{r.internship}</td>
                        <td>{operatorsLabel(r, lang)}</td>
                        {MONTH_NUMS.map((m) => {
                          const amt = r.months[m] || 0;
                          if (!amt) return <td key={m}>—</td>;
                          return (
                            <td key={m}>
                              {canEditPage ? (
                                <button
                                  className="link-button"
                                  title={t('點選標記這個月全額付清', lang)}
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
                  {filteredUnpaid.length === 0 && <tr><td colSpan={16} className="muted">{unpaidQuery ? t('沒有符合搜尋條件的未繳紀錄。', lang) : t('目前沒有未繳紀錄。', lang)}</td></tr>}
                  {filteredUnpaid.length > 0 && (
                    <tr>
                      <td style={{ fontWeight: 700 }}>{t('總計', lang)}</td>
                      <td></td>
                      <td></td>
                      {MONTH_NUMS.map((m) => (
                        <td key={m} style={{ fontWeight: 700 }}>{filteredUnpaid.reduce((sum, r) => sum + (r.months[m] || 0), 0).toLocaleString()}</td>
                      ))}
                      <td style={{ fontWeight: 700 }}>{unpaidGrandTotal.toLocaleString()}</td>
                    </tr>
                  )}
                </tbody>
              </table></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
