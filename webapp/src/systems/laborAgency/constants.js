// 元凱移工事業部：越南外勞仲介引進案件的共用常數，跟 yujian（看護/家事
// 人員）系統分開，工種涵蓋製造業/營造業/農漁業等產業類移工。
// 比照使用者提供的參考雛型（Firebase 版移工案件管理）設計：案件只用單一
// 「目前階段」欄位＋看板呈現進度，不另外拆成媒合/二面/錄取多張表。
import { t } from '../../lib/i18n';

// 「面試甄選」這一關已經由公開履歷連結（移工送出履歷後自動建立移工名冊
// 資料）取代，案件從「雇主確認」開始起算，不再是獨立階段。
export const STAGES = [
  { key: '雇主確認', tip: '雇主選工、簽訂契約' },
  { key: '申請許可', tip: '收到認證文件後：確認配額 → 提交招募許可文件給勞動部（6 個工作天，不含週六日）→ 提交勞工名冊核對配額人數（2-3 個工作天，不含週六日）' },
  { key: '簽證辦理', tip: '北越送簽僅限週一/三/五；南越送簽平日皆可。一般簽 66 美元 7 天取簽，快件 99 美元（北越 5 天／南越 3 天）取簽' },
  { key: '行前訓練', tip: '出國前訓練與體檢' },
  { key: '入境接機', tip: '抵台接機、送往雇主或宿舍' },
  { key: '體檢居留', tip: '入國通報、健康檢查、申辦居留證' },
  { key: '在職追蹤', tip: '在職關懷、定期訪視、展延評估' },
];
// 「申請許可」「簽證辦理」兩關的詳細送件流程，看板卡片的 title 提示放
// 不下完整內容，這裡額外保留結構化資料，供「儀表板」頁面整理成清單
// 顯示，兩邊文字來源一致、不用維護兩份。
export const PERMIT_TIMELINE = [
  '收到認證文件後，先接收並核對已設定的配額',
  '把招募許可文件提交給勞動部（時間：6 個工作天，不含週六、日）',
  '把勞工名冊提交至配額文件，核對配額人數與勞工名冊（時間：2-3 個工作天，不含週六、日）',
];
export const VISA_TIMELINE = [
  { region: '越南北方送簽', schedule: '簽證申請僅限於週一、三、五', normal: '一般簽 66 美元，7 天取簽', express: '快件 99 美元，5 天取簽' },
  { region: '越南南方送簽', schedule: '只要不是週末，隨時可以送簽', normal: '一般簽 66 美元，7 天取簽', express: '快件 99 美元，3 天取簽' },
];
export const STAGE_KEYS = STAGES.map((s) => s.key);
export const JOBS = ['製造業', '看護工', '家庭幫傭', '營造業', '農漁業'];
export const INDUSTRIES = ['製造業', '社福看護', '家庭類', '營造業', '農漁牧'];
export const GENDERS = ['男', '女'];
const DAY = 86400000;

export function stageIndex(stage) {
  return Math.max(0, STAGE_KEYS.indexOf(stage));
}

// 護照效期天數：辦簽證通常要求護照剩餘效期 6 個月（180 天）以上，還沒
// 入境（階段在「入境接機」之前）剩不到 180 天就要特別標示。
export function daysToExpiry(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${dateStr}T00:00:00`) - today) / DAY);
}

export function passportStatus(w, lang) {
  const d = daysToExpiry(w.passportExpiry);
  if (d === null) return { label: t('未填護照效期', lang), cls: 'tag-grey' };
  if (d < 0) return { label: t('護照已過期', lang), cls: 'tag-red' };
  if (d <= 180 && stageIndex(w.stage) < 4) return { label: `${t('護照剩', lang)} ${d} ${t('天（不足 6 個月）', lang)}`, cls: 'tag-red' };
  if (d <= 90) return { label: `${t('護照剩', lang)} ${d} ${t('天', lang)}`, cls: 'tag-red' };
  if (d <= 180) return { label: `${t('護照剩', lang)} ${d} ${t('天', lang)}`, cls: 'tag-amber' };
  return { label: `${t('護照', lang)} ${w.passportExpiry}`, cls: 'tag-green' };
}

export function employerLabel(employers, employerId, lang) {
  return employers.find((e) => e.id === employerId)?.name || t('尚未配對', lang);
}

// 核准文號（雇主需求單欄位 docNumber，原本叫「函文編號」，跟入境通知
// 頁面的「核准文號」欄位統一用同一個名稱）是行政專用欄位，只有「行政
// 人員」「主管」「系統管理員」能看到——雇主需求單(EmployersPage.jsx)
// 跟各處挑選雇主的欄位(配對雇主複選，見 WorkerRosterPage.jsx/
// WorkersPage.jsx)共用同一套權限判斷，不能各自維護一份，不然同一個
// 角色在不同頁面看到的範圍會不一致。
const DOC_NUMBER_ROLES = ['行政人員', '主管', '系統管理員'];
export function canSeeDocNumber(role) {
  return DOC_NUMBER_ROLES.includes(role);
}

// 配對雇主複選清單的顯示文字：有權限看核准文號的角色，前面加核准文號
// 當分辨不同雇主需求單的依據（同一雇主名稱可能開了好幾張需求單）。
export function employerPickerLabel(emp, role) {
  return canSeeDocNumber(role) && emp.docNumber ? `${emp.docNumber} ${emp.name}` : emp.name;
}

// 移工名冊的「配對雇主」可複選，存成 employerIds（JSON 字串陣列）；舊資料
// 或「移工管理」的「新增雇主安排」功能寫的是單一 employerId，兩者合併
// 不重複，取不到才當作尚未配對（回傳空陣列）。
export function workerEmployerIds(w) {
  let ids = [];
  try {
    const arr = w.employerIds ? JSON.parse(w.employerIds) : [];
    if (Array.isArray(arr)) ids = arr.filter(Boolean);
  } catch { /* 不是 JSON，忽略 */ }
  if (w.employerId && !ids.includes(w.employerId)) ids = [...ids, w.employerId];
  return ids;
}

// 移工管理的「目前階段」：面試/錄取/取消/未通過，每一筆配對（移工×雇主）
// 各自獨立，不是整個移工共用一個狀態——同一個移工可能同時在跟雇主 A
// 面試、被雇主 B 取消。存成 matchStatuses（JSON 物件，key 是雇主 id，
// 「尚未配對」那筆用 UNMATCHED_MATCH_KEY 當 key），沒存過的配對預設是
// 「面試」（MATCH_STATUSES[0]）。雇主需求單的「已錄取」人數、文件追蹤/
// 辦理簽證/出境辦理等後續關卡的名單，都是從某一筆配對狀態＝「錄取」
// 篩出來（看的是那一筆配對，不是整個移工）。
export const MATCH_STATUSES = ['面試', '錄取', '取消', '未通過'];
export const UNMATCHED_MATCH_KEY = '__unmatched__';

function parseMatchStatuses(w) {
  try {
    const obj = w.matchStatuses ? JSON.parse(w.matchStatuses) : {};
    return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
  } catch { return {}; }
}

export function matchStatusOf(w, employerId) {
  const key = employerId || UNMATCHED_MATCH_KEY;
  return parseMatchStatuses(w)[key] || MATCH_STATUSES[0];
}

export function withMatchStatus(w, employerId, status) {
  const key = employerId || UNMATCHED_MATCH_KEY;
  return JSON.stringify({ ...parseMatchStatuses(w), [key]: status });
}

export function isHired(w, employerId) {
  return matchStatusOf(w, employerId) === '錄取';
}

// 文件追蹤/辦理簽證/出境辦理/入境通知後續關卡的「完成」「從名單移除」
// 都要各自獨立到每一筆配對（移工×雇主），不能整個移工共用一個欄位
// ——否則同一個移工同時配對多個雇主時，在其中一筆按下「完成」會讓
// 其他配對也一起被判定完成、一起跳到下一關，不是只有那一筆資料。
// field 是存在 worker 文件上的欄位名稱（例如 docsCompletedMap），值是
// JSON 物件，key 是雇主 id（「尚未配對」用 UNMATCHED_MATCH_KEY）。
function parsePairFlags(w, field) {
  try {
    const obj = w[field] ? JSON.parse(w[field]) : {};
    return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
  } catch { return {}; }
}

export function getPairFlag(w, field, employerId) {
  const key = employerId || UNMATCHED_MATCH_KEY;
  return !!parsePairFlags(w, field)[key];
}

export function withPairFlag(w, field, employerId, value) {
  const key = employerId || UNMATCHED_MATCH_KEY;
  return JSON.stringify({ ...parsePairFlags(w, field), [key]: value });
}

// 跟上面的 pair flag 同樣道理，但存的不是 true/false，而是一組欄位值
// （例如出境辦理的航班資訊、辦理簽證的日期/文號）——這些欄位內容也是
// 每一筆配對（移工×雇主）各自獨立，不能整個移工共用一份，否則同一個
// 移工配對多個雇主時，填寫其中一筆的資料會覆蓋到另一筆。value 是物件，
// 整包存進去（覆蓋，不是 merge，呼叫端自己決定要不要先讀舊值 merge）。
export function getPairInfo(w, field, employerId) {
  const key = employerId || UNMATCHED_MATCH_KEY;
  return parsePairFlags(w, field)[key] || {};
}

export function withPairInfo(w, field, employerId, value) {
  const key = employerId || UNMATCHED_MATCH_KEY;
  return JSON.stringify({ ...parsePairFlags(w, field), [key]: value });
}

// 移到這裡（原本只在 DeparturePage.jsx 裡）：內部獎金頁面要依「出境
// 月份」試算，也要讀同一份航班資訊，兩邊共用同一份判斷邏輯，不要
// 各自維護一份、以後改了其中一邊忘記改另一邊。
const LEGACY_DEPARTURE_FIELDS = ['flightAirline', 'flightNumber', 'flightTerminal', 'flightTime', 'transportFee', 'billingParty', 'includeInBilling'];

// 航班/交通資訊依配對（移工×雇主）各自獨立存放（departureInfoMap），
// 不能像舊版那樣直接存在移工文件的扁平欄位上——否則同一個移工同時配對
// 多個雇主時，填寫其中一筆的航班資訊會覆蓋到另一筆。舊資料沒有
// departureInfoMap 時，退回舊的扁平欄位顯示（只配對單一雇主時仍準確），
// 一旦透過「編輯」存檔就會改存進新的 departureInfoMap。
export function departureInfoOf(w, employerId) {
  const stored = getPairInfo(w, 'departureInfoMap', employerId);
  if (Object.keys(stored).length) return stored;
  const legacy = {};
  LEGACY_DEPARTURE_FIELDS.forEach((k) => { if (w[k] !== undefined) legacy[k] = w[k]; });
  return legacy;
}

// 移到這裡（原本只在 VisaProcessingPage.jsx 裡）：入境通知要顯示簽證
// 文號，也要讀同一份簽證資訊，理由跟上面 departureInfoOf 移過來一樣
// ——兩邊共用同一份讀取邏輯，不要各自維護一份。
const LEGACY_VISA_FIELDS = ['visaProcessDate', 'visaPickupDate', 'visaDocNumber', 'taiwanPhone'];

// 簽證辦理日期/領取日期/文號、台灣電話號碼依配對（移工×雇主）各自
// 獨立存放（visaInfoMap），理由跟上面 departureInfoOf 一樣——不能像舊版
// 那樣直接存在移工文件的扁平欄位上，否則同一個移工同時配對多個雇主時，
// 填寫其中一筆的簽證資料會覆蓋到另一筆。
export function visaInfoOf(w, employerId) {
  const stored = getPairInfo(w, 'visaInfoMap', employerId);
  if (Object.keys(stored).length) return stored;
  const legacy = {};
  LEGACY_VISA_FIELDS.forEach((k) => { if (w[k] !== undefined) legacy[k] = w[k]; });
  return legacy;
}

// 從其他狀態改回「錄取」，代表那一筆配對重新開始整個流程——文件追蹤/
// 辦理簽證/出境辦理/入境通知先前留下的完成/移除/結案旗標都要清掉，
// 不然那一筆配對會因為舊旗標還是 true，卡在原本的頁面出不來或一路
// 被跳過到最後（例如之前已經「完成」過文件追蹤，改回錄取後本來期待
// 它重新出現在文件追蹤，卻因為 docsCompletedMap 還是 true 而看不到）。
// 回傳要 merge 進 update() 的欄位物件，只影響那一筆配對。
const PIPELINE_FLAG_FIELDS = [
  'docsCompletedMap', 'docsListRemovedMap',
  'visaCompletedMap', 'visaListRemovedMap',
  'departureCompletedMap', 'departureListRemovedMap',
  'arrivalListRemovedMap', 'arrivalClosedMap',
];
// 跟上面旗標一起重置，但值是空物件不是 false：重新開始流程時，上一輪
// 配對填過的簽證/航班資料不該繼續帶著走。
const PIPELINE_INFO_FIELDS = ['visaInfoMap', 'departureInfoMap'];
// 整筆移除一筆配對（移工×雇主，見 WorkersPage.jsx 的 handleRemoveRow）時
// 用：把 matchStatuses 及所有 pipeline 旗標/資訊欄位裡，這個雇主 key 的
// 資料一併刪掉（不是設成 false/{}，是直接拿掉那個 key）——不然之後同一
// 個移工重新配對回同一個雇主時，getPairFlag/matchStatusOf 還是會讀到
// 這筆已經刪除的配對留下的舊資料（例如已經「錄取」「文件已完成」），
// 新的配對會直接繼承舊狀態，不是從「面試」重新開始。
const PAIR_SCOPED_FIELDS = ['matchStatuses', ...PIPELINE_FLAG_FIELDS, ...PIPELINE_INFO_FIELDS];
export function clearPairData(w, employerId) {
  const key = employerId || UNMATCHED_MATCH_KEY;
  const payload = {};
  PAIR_SCOPED_FIELDS.forEach((field) => {
    const obj = field === 'matchStatuses' ? parseMatchStatuses(w) : parsePairFlags(w, field);
    if (!(key in obj)) return;
    const { [key]: _removed, ...rest } = obj;
    payload[field] = JSON.stringify(rest);
  });
  return payload;
}

export function resetPipelineFlags(w, employerId) {
  let current = w;
  const payload = {};
  PIPELINE_FLAG_FIELDS.forEach((field) => {
    const value = withPairFlag(current, field, employerId, false);
    payload[field] = value;
    current = { ...current, [field]: value };
  });
  PIPELINE_INFO_FIELDS.forEach((field) => {
    const value = withPairInfo(current, field, employerId, {});
    payload[field] = value;
    current = { ...current, [field]: value };
  });
  return payload;
}

// 挑到工人後的文件清單（必備 required=true／依個案可選 required=false），
// 勾選狀態存在對應 worker 文件的 docsChecked（物件，key 對照下面的 key）。
export const DOCS_CHECKLIST = [
  { key: 'passport', label: '護照', required: true, note: '正本＋影本；確認護照有效期限' },
  { key: 'idCard', label: '身分證（CCCD）', required: true, note: '提供清晰影本／掃描檔' },
  { key: 'photo', label: '照片', required: true, note: '符合簽證申請規定之照片' },
  { key: 'resume', label: '個人履歷表／履歷資料', required: true, note: '完整填寫，並確認各項資料一致' },
  { key: 'healthCheck', label: '健康檢查證明', required: true, note: '須符合赴臺外籍勞工健康檢查相關規定' },
  { key: 'policeRecord', label: '司法警察紀錄／無犯罪紀錄證明（良民證）', required: true, note: '用於證明個人品行及犯罪紀錄狀況' },
  { key: 'education', label: '學歷證明／專業證照', required: false, note: '依職業類別及招募條件提供' },
  { key: 'workExperience', label: '工作經驗／技術能力證明／行前培訓', required: false, note: '如雇主或該職缺有相關要求，則須提供' },
  { key: 'industryDocs', label: '依產業別所需之其他文件', required: false, note: '例如：技術證照、工作經驗證明等' },
  { key: 'laborContract', label: '勞動契約', required: true, note: '依招募及就業相關程序簽訂' },
  { key: 'recruitPermit', label: '招募許可', required: true, note: '由臺灣雇主或相關單位提供' },
  { key: 'otherDeclaration', label: '依臺灣相關規定所需之其他文件／聲明書', required: true, note: '依個案及簽證申請要求提供' },
];
// 越南南方送簽額外需要補的個人資料對正文件，不是清單裡的固定項目（因為
// 只有南方送簽才需要），在文件追蹤頁面另外用備註顯示提醒。
export const SOUTH_VIETNAM_EXTRA_NOTE = '越南南方送簽：個人資料還需加附對正文件（例如出生證、確認居住地資訊等）。';

export function requiredDocsDone(worker) {
  const checked = worker.docsChecked || {};
  const required = DOCS_CHECKLIST.filter((d) => d.required);
  return required.filter((d) => checked[d.key]).length;
}

// 費用計算/收費紀錄/支付紀錄/內部獎金都要能各自標示幣別——同一位
// 移工的多筆收費/支付可能用不同幣別分開收/付，不互相轉換，各幣別
// 分開加總顯示（不換算成同一個基準幣別），所以這裡提供共用的
// 「依幣別分組加總」「兩個幣別分組相減」「幣別分組格式化成字串」
// 工具函式，四個頁面各自的彙總表都呼叫同一份，不要各自重寫一次。
// 舊資料沒有幣別欄位時，當作新台幣（DEFAULT_CURRENCY），不是因為
// 新台幣比較重要，只是這個系統原本金額欄位預設就是新台幣。
export const CURRENCIES = ['新台幣', '美金', '越盾'];
export const DEFAULT_CURRENCY = CURRENCIES[0];

export function formatMoney(amount, currency, lang) {
  return `${(Number(amount) || 0).toLocaleString()} ${t(currency || DEFAULT_CURRENCY, lang)}`;
}

// items 是任意物件陣列（收費紀錄、支付紀錄…），amountKey/currencyKey
// 是金額跟幣別分別存在哪個欄位名稱；回傳 { 幣別: 加總金額 }。
export function sumByCurrency(items, amountKey, currencyKey = 'currency') {
  const map = {};
  items.forEach((item) => {
    const cur = item[currencyKey] || DEFAULT_CURRENCY;
    map[cur] = (map[cur] || 0) + (Number(item[amountKey]) || 0);
  });
  return map;
}

// 應繳 - 已繳＝餘額，但兩邊可能出現不同的幣別組合（例如應繳是新台幣，
// 已繳卻收了一筆美金）——用兩邊出現過的幣別聯集各自相減，不會漏掉
// 任何一個幣別，也不會把不同幣別的數字加在一起相減。
export function subtractCurrencyMaps(dueMap, paidMap) {
  const result = {};
  new Set([...Object.keys(dueMap), ...Object.keys(paidMap)]).forEach((cur) => {
    result[cur] = (dueMap[cur] || 0) - (paidMap[cur] || 0);
  });
  return result;
}

// 把 { 幣別: 金額 } 的分組結果格式化成一行文字（例如「50,000 新台幣、
// $200 美金」），金額是 0 的幣別不顯示（不然每筆沒用到的幣別都會列出
// 一個「0 越盾」，太吵）；整個結果是空的（或全部都是 0）就顯示「0」。
export function formatMoneyMap(map, lang) {
  const entries = Object.entries(map).filter(([, amount]) => amount);
  if (!entries.length) return '0';
  return entries.map(([cur, amount]) => formatMoney(amount, cur, lang)).join('、');
}

// 結案（費用計算/收費紀錄/支付紀錄共用同一個 closed 欄位）前要先完成
// 審核關卡：收費紀錄這邊是審核、覆核兩道（chargeReviewed 審核完成後
// 才能按 chargeCountersigned 覆核，兩個都要完成），支付紀錄只有一道
// （paymentReviewed）——三個頁面的結案按鈕都要套用同一個判斷，不要
// 各自寫一次判斷式，以免以後改了審核規則卻只改到其中一兩個頁面。
export function canCloseFee(fs) {
  return fs.chargeCountersigned === '是' && fs.paymentReviewed === '是';
}

// 內部獎金的 6 個固定角色（招募人員另外在「費用計算」每位移工各自填，
// 不在這裡）——「內部獎金編輯」(BonusRateSetupPage.jsx) 跟「內部獎金」
// (BonusPage.jsx) 都要讀同一組角色定義跟對應的欄位名稱，共用同一份
// 設定，不要各自維護一份。rateKey/currencyKey 直接存在移工文件本身
// （不是依配對），因為這筆獎金是整個案件固定一筆，不是按配對拆開算。
export const BONUS_ROLE_DEFS = [
  { workerKey: 'assignedAdminResume', rateKey: 'adminResumeRate', currencyKey: 'adminResumeRateCurrency', label: '行政（履歷表）' },
  { workerKey: 'assignedAdminForm', rateKey: 'adminFormRate', currencyKey: 'adminFormRateCurrency', label: '行政表格' },
  { workerKey: 'assignedAccountant', rateKey: 'accountantRate', currencyKey: 'accountantRateCurrency', label: '會計人員' },
  { workerKey: 'assignedFieldStaff', rateKey: 'fieldStaffRate', currencyKey: 'fieldStaffRateCurrency', label: '外務人員' },
  { workerKey: 'assignedSupervisor', rateKey: 'supervisorRate', currencyKey: 'supervisorRateCurrency', label: '主管' },
  { workerKey: 'assignedManager', rateKey: 'managerRate', currencyKey: 'managerRateCurrency', label: '經理' },
];

// 這位移工是否有任一筆配對（移工×雇主）已經到「入境通知」名單——跟
// ArrivalNoticePage.jsx 判斷是否列入名單的條件一致（出境辦理已完成、
// 沒有從入境通知名單移除），「內部獎金編輯」的名單直接沿用同一個條件，
// 不會因為那一筆配對在入境通知那邊「已結案」就消失（獎金設定是永久
// 紀錄，不跟著入境通知自己的結案狀態走）。
export function reachedArrivalNotice(w) {
  const ids = workerEmployerIds(w);
  const pairs = ids.length ? ids : [null];
  return pairs.some((employerId) => getPairFlag(w, 'departureCompletedMap', employerId) && !getPairFlag(w, 'arrivalListRemovedMap', employerId));
}

// 這位移工是否有任一筆配對的出境航班時間落在這個月——跟 BonusPage.jsx
// 原本「依出境月份試算」的判斷同一套邏輯，移到這裡供「內部獎金編輯」
// 共用（名單也要依月份分類）。
export function departedInMonth(w, month) {
  const ids = workerEmployerIds(w);
  const pairs = ids.length ? ids : [null];
  return pairs.some((employerId) => (departureInfoOf(w, employerId).flightTime || '').slice(0, 7) === month);
}
