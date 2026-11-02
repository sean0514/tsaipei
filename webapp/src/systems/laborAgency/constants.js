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
