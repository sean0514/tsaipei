import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { exportEntityCSV } from '../../lib/csv';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { useSystemProfile } from '../../auth/useSystemAccess';
import {
  studentProjectClientPair, currentYear, NOT_BILLABLE,
  ELECTRICITY_FLAT_FEE_PER_HEAD, NANTOU_ZHUSHAN_DORM_NAME, NANTOU_ZHUSHAN_ELECTRICITY_SURCHARGE_PER_HEAD,
} from '../../lib/bonus';
import { downloadStudentBillingStatements } from '../../lib/studentBillingStatement';

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

// Windows 檔名不能有這些字元(「下載學生請款單(Word)」產生檔名時也是
// 濾掉同一組字元)——學生姓名(中文名/原文名)剛好含有這些符號，常常是
// 舊資料匯入時編碼不相容殘留下來的亂碼(例如越南文變音符號被不相容的
// 編碼轉成問號)，不是真正的姓名內容，值得特別標出來提醒去源頭(學生
// 資料)修正，而不是每次下載才被動發現。
const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/; // eslint-disable-line no-control-regex -- 刻意連控制字元一起抓出來。
function studentNameUnsafeChars(s) {
  const found = new Set();
  [s?.chineseName, s?.originalName].forEach((name) => {
    (name || '').split('').forEach((c) => { if (UNSAFE_FILENAME_CHARS.test(c)) found.add(c); });
  });
  return [...found];
}

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

function operatorsLabel(r) {
  if (r.operators.size) return [...r.operators].join('、');
  if (r.hasUnattributedActivity) return '（舊資料無記錄）';
  return '—';
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

function parseJson(json, fallback) {
  try { return json ? JSON.parse(json) : fallback; } catch { return fallback; }
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

// 確認繳款人：三個審核層級各自獨立按確認，不用照順序，系統管理員可以代
// 任何層級確認。每個層級各自記錄確認人姓名(按下按鈕當下登入者的名字)跟
// 確認時間，存在跟收款狀態同一筆 tsaipei_studentBillingPayments 紀錄裡。
const CONFIRM_LEVELS = [
  { key: 'accountant', label: '會計', role: '會計人員' },
  { key: 'finance', label: '財務', role: '財務人員' },
  { key: 'admin', label: '系統管理員', role: '系統管理員' },
];

// 審核是對「每一筆實際收到的錢」審核，不是對學生這整列審核——先繳部分
// 可能分好幾筆收，每一筆金額各自要能單獨審核；全額付清只有一筆金額，
// 審核按鈕就跟著那筆日期一起顯示。角色限定主管(系統管理員可以代按)，
// 跟 CONFIRM_LEVELS 的角色限制邏輯一致，只是不走那個通用機制(那個是
// 整列只有一組、不分金額筆數)。
const REVIEWER_ROLE = '主管';
function canReviewAmount(canEditPage, profile) {
  return canEditPage && (profile?.role === REVIEWER_ROLE || profile?.role === '系統管理員');
}

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

function nextMonthStr(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function prevMonthStr(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 學生請款計算：只要當月有住宿舍（不論廠商代付或學生自付）都列進來計算；
// 自付宿舍費只有「學生自付」才試算（廠商代付的宿舍費不跟學生收）；水費/
// 電費/瓦斯費取自 宿舍管理「填寫其他費用」當月整間宿舍的紀錄，不分付款
// 方式，一律依「這個月住過這間宿舍的人數」平分到每個人身上；其他費用則
// 只有非「廠商代付」的項目才平分給學生，跟水電瓦斯費不同套規則；平分
// 後的金額再跟自付宿舍費加總成這個學生這個月要付的總金額。
const DAILY_EXPENSE_BILLABLE_STATUSES = ['已核准', '已匯款'];

// 實習單位是和德昌的學生，在第一次入境期間(第一次入境日~第一次離境日，
// 還沒離境視為還在這段期間內)每個月固定收 150 元體檢費，不管當月住了
// 幾天都是整筆 150，不像水電瓦斯費那樣照天數比例算。用 includes 比對是
// 因為公司名稱欄位填的是全名(例如「和德昌股份有限公司」)，不是只有兩個字。
const HEDECHANG_CLIENT_KEYWORD = '和德昌';
const HEDECHANG_HEALTH_CHECK_FEE_PER_MONTH = 150;

// 先繳部分明細：可以分好幾筆填(每筆金額+日期各自一列)，輸入框用
// defaultValue+key(依內容變化)而不是 controlled value，避免打字打到一半
// 被即時存檔觸發的重新渲染蓋掉；key 包含金額/日期本身，commit 後 key 換了
// 才重新掛載，新增/刪除某一筆造成後面筆數的 index 位移時顯示的內容也會
// 正確更新(不會卡著舊的顯示值)。
function PartialPaymentsEditor({ payment, canEditPage, canReview, onAdd, onUpdate, onRemove, onToggleReview }) {
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
          {entry.reviewedBy ? (
            <>
              <span className="tag tag-green" style={{ fontSize: 12 }}>審核：{entry.reviewedBy}</span>
              {canReview && <button onClick={() => onToggleReview(i)}>取消審核</button>}
            </>
          ) : canReview ? (
            <button onClick={() => onToggleReview(i)}>審核</button>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>未審核</span>
          )}
        </div>
      ))}
      {canEditPage ? <button onClick={onAdd}>+ 新增一筆</button> : (entries.length === 0 && <span className="muted">—</span>)}
    </div>
  );
}

export default function StudentBillingPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'studentBilling', role, overrides);
  const profile = useSystemProfile(system);
  const operatorName = profile?.displayName || profile?.email || '';
  const { rows: housingRecords, loading: loadingHousing } = useCollection('tsaipei_housingRecords');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: dormitories } = useCollection('tsaipei_dormitories');
  const { rows: utilities } = useCollection('tsaipei_dormitoryUtilities');
  const { rows: dailyExpenseApplications } = useCollection('tsaipei_dailyExpenseApplications');
  const { rows: payments, add: addPayment, update: updatePayment } = useCollection('tsaipei_studentBillingPayments');
  const { rows: billingLocks, add: addBillingLock, remove: removeBillingLock } = useCollection('tsaipei_studentBillingLocks');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const [view, setView] = useState('monthly');
  const [q, setQ] = useState('');
  const [month, setMonth] = useState(currentMonthStr());
  const [year, setYear] = useState(currentYear());

  const pairCtx = { matches, admittedList, positions };

  // 姓名含有 Windows 檔名不允許字元的學生：提醒去「學生基本資料」把這些
  // 殘留的亂碼符號清掉，不然下載學生請款單(Word)/其他需要用姓名當檔名
  // 的地方還是可能遇到同樣的問題（已經在產生檔名時濾掉這些字元讓下載
  // 不會漏檔案，但姓名本身的亂碼沒有因此被修正）。
  const studentsWithUnsafeNames = students
    .map((s) => ({ student: s, chars: studentNameUnsafeChars(s) }))
    .filter((r) => r.chars.length > 0);

  function paymentFor(studentId, monthStr) {
    if (!studentId) return null;
    return effectivePayment(payments.find((p) => p.studentId === studentId && p.month === monthStr) || null);
  }

  // 收款狀態/金額/日期：每個學生每個月各一筆，upsert（找得到當月既有紀錄
  // 就更新，找不到就新增）。每次異動都蓋上目前登入者的名字，方便事後追查
  // 這筆收款紀錄是誰標記/修改的。
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

  // 全額付清只有一筆金額，審核欄位直接存在收款紀錄本身（不用像先繳部分
  // 那樣存進陣列）。
  function handleToggleFullPaidReview(studentId, monthStr) {
    const existing = paymentFor(studentId, monthStr);
    if (existing.fullPaidReviewedBy) {
      if (!window.confirm('確定要取消這筆的審核嗎？')) return;
      upsertPayment(studentId, monthStr, { fullPaidReviewedBy: '', fullPaidReviewedAt: '' });
    } else {
      upsertPayment(studentId, monthStr, { fullPaidReviewedBy: operatorName, fullPaidReviewedAt: new Date().toISOString() });
    }
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

  // 先繳部分每一筆金額各自審核，存在那一筆自己身上(reviewedBy/reviewedAt)，
  // 不是整個 partialPayments 陣列共用一組。
  function handleTogglePartialReview(studentId, monthStr, index) {
    const existing = paymentFor(studentId, monthStr);
    const entries = parsePartialPayments(existing.partialPayments);
    if (!entries[index]) return;
    if (entries[index].reviewedBy) {
      if (!window.confirm('確定要取消這筆的審核嗎？')) return;
      entries[index] = { ...entries[index], reviewedBy: '', reviewedAt: '' };
    } else {
      entries[index] = { ...entries[index], reviewedBy: operatorName, reviewedAt: new Date().toISOString() };
    }
    upsertPayment(studentId, monthStr, { partialPayments: JSON.stringify(entries) });
  }

  // 未繳總表「點金額標記」的快速動作：直接標記全額付清，收款日期預設今天。
  function markFullyPaid(studentId, monthStr) {
    const existing = paymentFor(studentId, monthStr);
    upsertPayment(studentId, monthStr, { status: '全額付清', fullPaidDate: existing.fullPaidDate || new Date().toISOString().slice(0, 10) });
  }

  // 系統管理員可以代任何層級確認；其他角色只能確認跟自己角色對應的那個
  // 層級，確保「會計確認」真的是會計人員按的，不是隨便哪個有編輯權限的人。
  function canConfirmLevel(level) {
    return canEditPage && (profile?.role === level.role || profile?.role === '系統管理員');
  }

  function handleToggleConfirm(studentId, monthStr, level) {
    const existing = paymentFor(studentId, monthStr);
    const byKey = `${level.key}ConfirmedBy`;
    const atKey = `${level.key}ConfirmedAt`;
    if (existing[byKey]) {
      if (!window.confirm(`確定要取消「${level.label}」的確認嗎？`)) return;
      upsertPayment(studentId, monthStr, { [byKey]: '', [atKey]: '' });
    } else {
      upsertPayment(studentId, monthStr, { [byKey]: operatorName, [atKey]: new Date().toISOString() });
    }
  }

  // 其他費用除了宿舍共用的分攤之外，還要加上這個學生自己名下、日常支出
  // 申請裡類型=收入、已核准/已匯款、日期落在這個月的金額加總——但「須請款
  // (實習單位)」有選企業的，改跟那家企業收(算進客戶請款計算，見
  // lib/bonus.js buildDailyExpenseChargeTotals)，不算進學生自己要繳的
  // 金額，避免同一筆錢跟學生、客戶各收一次。
  function studentIncomeTotal(studentId, monthStr) {
    if (!studentId) return 0;
    return dailyExpenseApplications
      .filter((app) => app.studentId === studentId)
      .filter((app) => (app.type || '支出') === '收入')
      .filter((app) => !app.billToCompany || app.billToCompany === NOT_BILLABLE)
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

  function lockFor(housingRecordId, monthStr) {
    return billingLocks.find((l) => l.housingRecordId === housingRecordId && l.month === monthStr) || null;
  }

  // 封存：把這個住宿紀錄當月算出來的請款明細固定下來，之後水電瓦斯紀錄、
  // 住宿安排再怎麼異動，這個月的數字都維持封存當下的樣子，直到按「取消
  // 封存」解除——跟客戶請款計算同一套機制。收款總帳(buildStudentLedger)
  // 算「應繳」金額時也是呼叫這個函式，封存後總帳/未繳總表會自動跟著用
  // 封存的數字，不會各自顯示不同金額。
  // 實習單位是和德昌的學生，第一次入境期間(含還沒離境的情況)每個月固定
  // 收 150 元，跟水電瓦斯不同，不照當月住了幾天比例算。
  function healthCheckFeeFor(studentId, monthStr, range) {
    const pair = studentProjectClientPair(studentId, pairCtx);
    if (!pair?.client?.includes(HEDECHANG_CLIENT_KEYWORD)) return 0;
    const student = students.find((s) => s.id === studentId);
    if (!student?.firstEntryDate) return 0;
    const days = dateOverlapDays(range.start, range.end, student.firstEntryDate, student.firstExitDate);
    return days > 0 ? HEDECHANG_HEALTH_CHECK_FEE_PER_MONTH : 0;
  }

  function billingFor(h, monthStr, range) {
    const days = residentOverlapDays(h, range);
    const selfPayDormFee = h.payer === '學生自付' && h.monthlyRent ? Math.round((Number(h.monthlyRent) / range.daysInMonth) * days) : 0;
    const u = utilityFor(h.type, monthStr);
    const residentCount = residentCountOf(h.type, range);
    // 「廠商代付」的其他費用項目不跟學生收，公司會跟客戶請款計算收回來
    // (見 lib/bonus.js buildMonthlyProjectClientVendorOtherFeeTotals)；只有
    // 沒填付款方式(舊資料，視同學生自付，維持改版前的行為)或明確標「學生
    // 自付」的項目才攤到住這間宿舍的學生身上。類型標「收入」的自訂項目
    // (只計入宿舍損益，不是要跟誰收的費用)不算進來。
    const otherFeesTotal = parseOtherFees(u?.otherFees)
      .filter((f) => f.payer !== '廠商代付' && (f.type || '支出') === '支出')
      .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
    const perHead = (amount) => (residentCount > 0 ? Math.round((Number(amount) || 0) / residentCount) : 0);
    // 水電瓦斯費是整間宿舍共用的費用，每人應攤金額是「總金額 ÷ 當月住過
    // 這間宿舍的所有人數」，不論這筆住宿紀錄的付款方式(學生自付/廠商代付)
    // 一律由住這間宿舍的學生平分，不會因為標「廠商代付」就改成跟客戶
    // 請款計算收(不再透過 lib/bonus.js
    // buildMonthlyProjectClientVendorUtilityTotals 分流)。
    const waterFee = perHead(u?.waterFee);
    // 電費固定每人每月加收 200 元，加在宿舍管理填寫的實際電費平分金額之上，
    // 沒有填實際電費的月份也會有這筆 200；南投竹山宿舍的學生電費另外再
    // 額外加收 500 元(疊加在這 200 元之上，不是取代)——但宿舍管理標「廠商
    // 宿舍」的宿舍不額外加收這兩筆，水電瓦斯其他費用仍照常分攤。
    const isVendorDorm = !!dormitories.find((d) => d.name === h.type)?.isVendorDorm;
    const electricitySurcharge = !isVendorDorm && h.type === NANTOU_ZHUSHAN_DORM_NAME ? NANTOU_ZHUSHAN_ELECTRICITY_SURCHARGE_PER_HEAD : 0;
    const electricityFee = perHead(u?.electricityFee) + (isVendorDorm ? 0 : ELECTRICITY_FLAT_FEE_PER_HEAD) + electricitySurcharge;
    const gasFee = perHead(u?.gasFee);
    const otherFees = perHead(otherFeesTotal) + studentIncomeTotal(h.studentId, monthStr);
    const healthCheckFee = healthCheckFeeFor(h.studentId, monthStr, range);
    // 電動車月租金：住宿紀錄勾選「是否借用電動車」才收，依「開始租借日~
    // 結束租借日」跟當月重疊的天數比例計算(起租/還車當月只算部分月份)，
    // 跟自付宿舍費同一套比例公式；舊資料沒有填這兩個日期的話，退回用
    // 住宿紀錄本身的入住日/退宿日當作租借區間，維持改版前的行為。
    const evStart = h.electricVehicleStartDate || h.checkIn;
    const evEnd = h.electricVehicleEndDate || h.checkOut;
    const evDays = h.hasElectricVehicle ? dateOverlapDays(range.start, range.end, evStart, evEnd) : 0;
    const evFee = evDays > 0 ? Math.round((Number(h.electricVehicleMonthlyFee) || 0) / range.daysInMonth * evDays) : 0;
    const total = selfPayDormFee + waterFee + electricityFee + gasFee + otherFees + healthCheckFee + evFee;
    const live = { days, selfPayDormFee, waterFee, electricityFee, gasFee, otherFees, healthCheckFee, evFee, total };
    const lock = lockFor(h.id, monthStr);
    if (!lock) return { ...live, locked: false };
    return { ...live, ...parseJson(lock.billingRow, {}), locked: true, lockId: lock.id };
  }

  async function handleConfirmBillingLock(h) {
    const live = billingFor(h, month, range);
    const { days, selfPayDormFee, waterFee, electricityFee, gasFee, otherFees, healthCheckFee, evFee, total } = live;
    try {
      await addBillingLock({
        month, housingRecordId: h.id, studentId: h.studentId,
        billingRow: JSON.stringify({ days, selfPayDormFee, waterFee, electricityFee, gasFee, otherFees, healthCheckFee, evFee, total }),
        lockedAt: new Date().toISOString(),
      });
    } catch (err) {
      alert(`封存失敗：${err.message || err}`);
    }
  }

  async function handleUnlockBilling(h) {
    const lock = lockFor(h.id, month);
    if (!lock) return;
    if (!window.confirm('確定要取消封存這個月的請款明細嗎？取消後會改回即時試算的數字。')) return;
    try {
      await removeBillingLock(lock.id);
    } catch (err) {
      alert(`取消封存失敗：${err.message || err}`);
    }
  }

  // 這個學生從最早入住到最近退宿(或現在)橫跨哪些月份，逐月建總帳才需要
  // 知道範圍要算到哪裡。
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

  // 學生收款總帳：某個月多繳的金額(溢繳)自動抵掉下一個月的應繳金額，欠款
  // 同理不會因為換月就消失，會一直累積到真的補繳(或之後月份溢繳回頭
  // 抵掉)為止。用一個「結餘」(balance)貫穿每個月：正數＝溢繳額度(可以
  // 抵未來應繳)，負數＝還欠多少(累積到目前為止的總欠款，不是只有這個
  // 月自己的欠款)——這樣如果學生某個月欠錢、後面月份補繳或溢繳，會直接
  // 沖抵掉之前月份留下來的欠款，不會讓舊欠款卡在那個月的紀錄裡，即使
  // 後來已經把錢補上也還是顯示欠款。
  //
  // 之前的版本欠款不會結轉到下個月（只有溢繳會），造成即使學生後面月份
  // 多繳了錢，前面月份的「剩餘餘額」仍然卡住不會被沖抵，總表/下載報表
  // 看到的欠款金額會比實際還欠的金額高——這裡修正這個問題。
  //
  // 從這個學生最早入住的月份算到最近退宿(或現在)的月份，逐月計算每個月
  // 結束時「累積到目前為止」還欠多少(remaining)/結餘多少溢繳(creditAfter)。
  // 標記「全額付清」的月份視為這個月＋之前累積的欠款都已經結清(沒有記錄
  // 實際付了多少錢，無法得知是否還有多付的溢繳，所以結清後結餘歸零)。
  function buildStudentLedger(studentId) {
    const { minMonth, maxMonth } = studentMonthBounds(studentId);
    const ledger = {};
    if (!minMonth) return ledger;
    let balance = 0; // 正數=溢繳額度，負數=累積欠款
    let m = minMonth;
    let guard = 0;
    while (m <= maxMonth && guard < 1200) {
      guard += 1;
      const mRange = monthRange(m);
      const owed = housingRecords
        .filter((h) => h.studentId === studentId && residentOverlapDays(h, mRange) > 0)
        .reduce((sum, h) => sum + billingFor(h, m, mRange).total, 0);
      const p = paymentFor(studentId, m);
      if (p.status === '全額付清') {
        balance = 0;
      } else {
        const paid = p.status === '先繳部分'
          ? parsePartialPayments(p.partialPayments).reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
          : 0;
        balance = balance - owed + paid;
      }
      ledger[m] = { owed, remaining: balance < 0 ? -balance : 0, creditAfter: balance > 0 ? balance : 0 };
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
      const previousOwed = ledgerFor(h.studentId)[prevMonthStr(month)]?.remaining || 0;
      const partialDetail = p.status === '先繳部分'
        ? parsePartialPayments(p.partialPayments).map((e) => `${e.amount || 0}元(${e.date || '未填日期'})${e.reviewedBy ? `[已審核:${e.reviewedBy}]` : ''}`).join('；')
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
        healthCheckFee: b.healthCheckFee,
        evFee: b.evFee,
        total: b.total,
        previousOwed,
        grandTotalWithPrevious: b.total + previousOwed,
        status: p.status,
        partialDetail,
        fullPaidDate: p.status === '全額付清' ? (p.fullPaidDate || '') : '',
        fullPaidReviewedBy: p.status === '全額付清' ? (p.fullPaidReviewedBy || '') : '',
        remaining: ledgerEntry.remaining,
        overpaidCredit: ledgerEntry.creditAfter,
        accountantConfirmedBy: p.accountantConfirmedBy || '',
        financeConfirmedBy: p.financeConfirmedBy || '',
        adminConfirmedBy: p.adminConfirmedBy || '',
      };
    });
    exportEntityCSV(rows, [
      { key: 'dorm', label: '宿舍名稱' }, { key: 'studentName', label: '學生' }, { key: 'payer', label: '付款方式' }, { key: 'days', label: '當月天數' },
      { key: 'selfPayDormFee', label: '自付宿舍費' }, { key: 'waterFee', label: '水費' }, { key: 'electricityFee', label: '電費' },
      { key: 'gasFee', label: '瓦斯費' }, { key: 'otherFees', label: '其他費用' }, { key: 'healthCheckFee', label: '體檢費' }, { key: 'evFee', label: '電動車月租金' }, { key: 'total', label: '本月合計' },
      { key: 'previousOwed', label: '上月欠費' }, { key: 'grandTotalWithPrevious', label: '應繳總額(本月合計+上月欠費)' },
      { key: 'status', label: '收款狀態' }, { key: 'partialDetail', label: '先繳部分明細' },
      { key: 'fullPaidDate', label: '全額付清日期' }, { key: 'fullPaidReviewedBy', label: '全額付清審核人' },
      { key: 'remaining', label: '剩餘餘額' }, { key: 'overpaidCredit', label: '溢繳餘額(可抵次月)' },
      { key: 'accountantConfirmedBy', label: '會計確認人' }, { key: 'financeConfirmedBy', label: '財務確認人' }, { key: 'adminConfirmedBy', label: '系統管理員確認人' },
    ], `學生請款計算_${month}`);
  }

  // 學生請款單(Word)：一位學生一份，跟下載報表(CSV)同一批資料、同一筆
  // 筆住宿紀錄對應一份，金額項目/上月欠費/應繳總額都一致，只是排成方便
  // 直接列印給學生的單張格式；多位學生打包成一個 .zip 一次下載。
  const [downloadingStatements, setDownloadingStatements] = useState(false);
  async function handleDownloadStatements() {
    setDownloadingStatements(true);
    try {
      const items = filtered.map((h) => {
        const b = billingFor(h, month, range);
        const p = paymentFor(h.studentId, month);
        const ledgerEntry = ledgerFor(h.studentId)[month] || { remaining: b.total, creditAfter: 0 };
        const previousOwed = ledgerFor(h.studentId)[prevMonthStr(month)]?.remaining || 0;
        const partialDetail = p.status === '先繳部分'
          ? parsePartialPayments(p.partialPayments).map((e) => `${e.amount || 0}元(${e.date || '未填日期'})`).join('；')
          : '';
        return {
          studentName: studentFullLabel(students.find((s) => s.id === h.studentId)),
          dorm: h.type || '',
          payer: h.payer || '',
          month,
          items: [
            { label: '自付宿舍費', amount: b.selfPayDormFee },
            { label: '水費', amount: b.waterFee },
            { label: '電費', amount: b.electricityFee },
            { label: '瓦斯費', amount: b.gasFee },
            { label: '其他費用', amount: b.otherFees },
            { label: '體檢費', amount: b.healthCheckFee },
            { label: '電動車月租金', amount: b.evFee },
          ],
          total: b.total,
          previousOwed,
          grandTotal: b.total + previousOwed,
          status: p.status,
          partialDetail,
          remaining: ledgerEntry.remaining,
        };
      });
      const { failed } = await downloadStudentBillingStatements(`學生請款單_${month}.zip`, items);
      if (failed.length > 0) {
        alert(`已下載，但以下 ${failed.length} 位學生的請款單產生失敗，請另外處理：\n${failed.map((f) => `${f.studentName}：${f.error}`).join('\n')}`);
      }
    } catch (err) {
      alert(`下載失敗：${err.message || err}`);
    } finally {
      setDownloadingStatements(false);
    }
  }

  // 未繳總表：一個學生一列，橫向 1-12 月各一欄，依學生收款總帳(buildStudentLedger)
  // 顯示選定年度每個月「累計到當月底為止」還欠多少——總帳本身已經把前面
  // 月份的溢繳額度往後抵充、欠款往後累積(後面月份補繳/溢繳也會往回沖掉
  // 之前欠款)都算進去了，這裡只要照抄每個月的 remaining，不需要另外維護
  // 一份「未繳」資料。因為每個月的數字已經是累計金額(後面月份的數字包含
  // 前面月份沒還清的部分)，橫向加總 1-12 月會重複計算同一筆欠款好幾次，
  // 「總計」只能取這個學生當年度最後一個有欠款的月份的數字(=年底還欠多少)，
  // 不能把 12 個月的數字加起來。
  function finalUnpaidBalance(r) {
    const presentMonths = MONTH_NUMS.filter((m) => r.months[m] !== undefined);
    if (!presentMonths.length) return 0;
    return r.months[Math.max(...presentMonths)] || 0;
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
      // 這筆收款紀錄確實有人動過(先繳部分)，但沒有 updatedBy——代表是
      // 「新增核准人紀錄」這個功能上線前就已經標記過的舊資料，當時系統
      // 還沒有這個欄位，沒辦法回溯知道是誰標記的，不是程式有問題。
      else if (p.status && p.status !== '未收款') entry.hasUnattributedActivity = true;
    }
  });
  const unpaidQuery = q.trim().toLowerCase();
  const filteredUnpaid = Object.values(unpaidByStudent)
    .filter((r) => !unpaidQuery || `${r.studentName} ${r.internship}`.toLowerCase().includes(unpaidQuery))
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
  const MONTH_NUMS = Array.from({ length: 12 }, (_, i) => i + 1);
  const unpaidGrandTotal = filteredUnpaid.reduce((sum, r) => sum + finalUnpaidBalance(r), 0);

  function handleDownloadUnpaid() {
    const rows = filteredUnpaid.map((r) => {
      const row = { studentName: r.studentName, internship: r.internship, operators: operatorsLabel(r) };
      MONTH_NUMS.forEach((m) => { row[`m${m}`] = r.months[m] || ''; });
      row.total = finalUnpaidBalance(r);
      return row;
    });
    // 下載時的總計：最後補一列每月加總+總計欄位的大計，跟畫面上表格底部
    // 一致，不用另外再手動加總。
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
          <h2>學生請款計算</h2>
          <div className="page-desc">
            {view === 'monthly'
              ? '只要當月有住宿舍（廠商代付、學生自付）都列入；自付宿舍費只有學生自付才試算；水電瓦斯費取自宿舍管理當月填寫的紀錄，依該宿舍當月住過的人數平分（電費在平分金額之上每人每月固定再加200元；南投竹山宿舍的學生電費再額外加收500元；宿舍管理標「廠商宿舍」的宿舍不加收這兩筆)；其他費用=宿舍管理分攤的其他費用+該學生名下日常支出申請(收入、已核准/已匯款、當月)金額；體檢費=實習單位是和德昌的學生，在第一次入境期間每個月固定收150元（不照天數比例）；電動車月租金=住宿紀錄勾選「是否借用電動車」的學生，依開始租借日~結束租借日跟當月重疊的天數比例收取（起租/還車當月只算部分月份，沒填這兩個日期的話退回用入住日/退宿日當租借區間）；收款狀態分「未收款」「先繳部分(可分好幾筆填金額+日期，每一筆金額各自可以按主管審核)」「全額付清(填日期，同樣可以按審核)」三種；剩餘餘額會自動把前面月份結餘的溢繳額度/累積欠款都算進去——多繳的錢自動抵次月的應繳金額，欠款也會一路累積到補繳為止；下載此月份報表會多一欄「上月欠費」(上個月的剩餘餘額)跟「應繳總額」(本月合計+上月欠費)；「下載學生請款單(Word)」會依這個月篩選出來的住宿紀錄，一位學生產生一份請款單，打包成一個 .zip 一次下載'
              : '依學生收款總帳列出選定年度每個月累計到當月底為止還欠多少(已經把前面月份的欠款/溢繳都算進去，後面月份補繳或溢繳會直接沖掉之前欠款，不會一直卡在原本那個月不動)；某個月完全不欠才會從總表消失；「總計」是這個學生當年度最後一個月的累計欠款(=年底結餘)，不是把12個月的數字加起來(因為每個月的數字已經是累計的，加起來會重複算到同一筆欠款)；核准人=這個學生有未繳月份裡標記過收款狀態的人'}
          </div>
        </div>
        <div className="row-actions">
          <button className={view === 'monthly' ? 'primary' : ''} onClick={() => setView('monthly')}>分月明細</button>
          <button className={view === 'unpaid' ? 'primary' : ''} onClick={() => setView('unpaid')}>未繳總表</button>
        </div>
      </div>
      {studentsWithUnsafeNames.length > 0 && (
        <p className="split-note" style={{ color: 'var(--danger)' }}>
          ⚠ 以下 {studentsWithUnsafeNames.length} 位學生的姓名含有不能用在檔名裡的符號(常見是舊資料匯入編碼不相容殘留的亂碼，例如越南文變音符號被轉成問號)：
          {studentsWithUnsafeNames.map(({ student, chars }) => `${studentFullLabel(student)}(${chars.join('、')})`).join('、')}
          。下載學生請款單(Word)時已經會自動濾掉這些符號，不會漏掉這些學生，但建議到「學生基本資料」把姓名改成正確的文字。
        </p>
      )}

      {view === 'monthly' ? (
        <>
          <div className="row-actions" style={{ marginBottom: 16 }}>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <button onClick={handleDownload}>下載此月份報表</button>
            <button onClick={handleDownloadStatements} disabled={downloadingStatements}>{downloadingStatements ? '產生中…' : '下載學生請款單(Word)'}</button>
          </div>
          <input placeholder="搜尋學生或宿舍名稱" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
          {loading ? <p className="muted">載入中…</p> : (
            groupKeys.length === 0 ? <p className="muted">{query ? '沒有符合搜尋條件的紀錄。' : '目前沒有住宿中的紀錄。'}</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {groupKeys.map((key) => (
                  <div className="card" key={key}>
                    <h3 style={{ marginTop: 0 }}>{key} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[key].length} 位學生</span></h3>
                    <div className="table-wrap sticky-header"><table>
                      <thead><tr><th>學生</th><th>付款方式</th><th>當月天數</th><th>自付宿舍費</th><th>水費</th><th>電費</th><th>瓦斯費</th><th>其他費用</th><th>體檢費</th><th>電動車月租金</th><th>合計</th><th>狀態</th><th>收款狀態</th><th>金額/日期明細</th><th>剩餘餘額</th><th>確認繳款人</th>{canEditPage && <th></th>}</tr></thead>
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
                              <td>{b.healthCheckFee.toLocaleString()}</td>
                              <td>{b.evFee.toLocaleString()}</td>
                              <td style={{ fontWeight: 600 }}>{b.total.toLocaleString()}</td>
                              <td>{b.locked ? <span className="tag tag-green">已封存</span> : <span className="muted status-text">即時試算</span>}</td>
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
                                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <input
                                      type="date"
                                      value={p.fullPaidDate || ''}
                                      disabled={!canEditPage}
                                      onChange={(e) => handleFullPaidDateChange(h.studentId, month, e.target.value)}
                                      style={{ width: 140 }}
                                    />
                                    {p.fullPaidReviewedBy ? (
                                      <>
                                        <span className="tag tag-green" style={{ fontSize: 12 }}>審核：{p.fullPaidReviewedBy}</span>
                                        {canReviewAmount(canEditPage, profile) && <button onClick={() => handleToggleFullPaidReview(h.studentId, month)}>取消審核</button>}
                                      </>
                                    ) : canReviewAmount(canEditPage, profile) ? (
                                      <button onClick={() => handleToggleFullPaidReview(h.studentId, month)}>審核</button>
                                    ) : (
                                      <span className="muted" style={{ fontSize: 12 }}>未審核</span>
                                    )}
                                  </div>
                                ) : p.status === '先繳部分' ? (
                                  <PartialPaymentsEditor
                                    payment={p}
                                    canEditPage={canEditPage}
                                    canReview={canReviewAmount(canEditPage, profile)}
                                    onAdd={() => handleAddPartialPayment(h.studentId, month)}
                                    onUpdate={(i, field, value) => handleUpdatePartialPayment(h.studentId, month, i, field, value)}
                                    onRemove={(i) => handleRemovePartialPayment(h.studentId, month, i)}
                                    onToggleReview={(i) => handleTogglePartialReview(h.studentId, month, i)}
                                  />
                                ) : '—'}
                              </td>
                              <td style={{ fontWeight: 600, color: remaining > 0 ? 'var(--danger)' : undefined }}>
                                {remaining.toLocaleString()}
                                {remaining === 0 && overpaidCredit > 0 && (
                                  <div className="muted" style={{ fontWeight: 400, fontSize: 12 }}>溢繳 {overpaidCredit.toLocaleString()}（可抵次月）</div>
                                )}
                              </td>
                              <td>
                                {CONFIRM_LEVELS.map((level) => {
                                  const confirmedBy = p[`${level.key}ConfirmedBy`];
                                  const canAct = canConfirmLevel(level);
                                  return (
                                    <div key={level.key} style={{ fontSize: 12, marginBottom: 2, display: 'flex', gap: 4, alignItems: 'center' }}>
                                      {confirmedBy ? (
                                        <>
                                          <span className="tag tag-green">{level.label}：{confirmedBy}</span>
                                          {canAct && <button onClick={() => handleToggleConfirm(h.studentId, month, level)}>取消</button>}
                                        </>
                                      ) : canAct ? (
                                        <button onClick={() => handleToggleConfirm(h.studentId, month, level)}>{level.label}確認</button>
                                      ) : (
                                        <span className="muted">{level.label}：未確認</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </td>
                              {canEditPage && (
                                <td>
                                  {b.locked
                                    ? <button onClick={() => handleUnlockBilling(h)}>取消封存</button>
                                    : <button className="primary" onClick={() => handleConfirmBillingLock(h)}>確認封存</button>}
                                </td>
                              )}
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
              <div className="table-wrap sticky-header"><table>
                <thead><tr><th>學生</th><th>實習單位</th><th>核准人</th>{MONTH_NUMS.map((m) => <th key={m}>{m}月</th>)}<th>總計</th></tr></thead>
                <tbody>
                  {filteredUnpaid.map((r) => {
                    const rowTotal = finalUnpaidBalance(r);
                    return (
                      <tr key={r.studentId}>
                        <td style={{ fontWeight: 600 }}>{r.studentName}</td>
                        <td>{r.internship}</td>
                        <td>{operatorsLabel(r)}</td>
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
                  {filteredUnpaid.length === 0 && <tr><td colSpan={16} className="muted">{unpaidQuery ? '沒有符合搜尋條件的未繳紀錄。' : '目前沒有未繳紀錄。'}</td></tr>}
                  {filteredUnpaid.length > 0 && (
                    <tr>
                      <td style={{ fontWeight: 700 }}>總計</td>
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
