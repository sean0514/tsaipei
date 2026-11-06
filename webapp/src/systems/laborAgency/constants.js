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
