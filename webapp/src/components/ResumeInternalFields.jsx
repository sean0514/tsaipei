import { ExperienceEditor } from '../pages/LaborAgencyResumeApplyPage';
import { t } from '../lib/i18n';

// 內部人員用的「工廠移工人員履歷表」欄位——systems/laborAgency/ResumeLinksPage.jsx
// 的「編輯履歷」跟 systems/laborAgency/WorkerRosterPage.jsx 的「新增工人／
// 編輯」都共用這份，欄位跟公開填寫頁 (pages/LaborAgencyResumeApplyPage.jsx)
// 完全一致，只維護一次；國內外工作經驗的編輯器也直接共用該頁匯出的
// ExperienceEditor，不用各自重複寫一份。不含照片/刺青照片/LINE 圖片上傳
// （那些只在公開填寫頁處理），呼叫端自己決定要不要顯示現有圖片。
export default function ResumeInternalFields({
  form, setField, lang, domesticExperience, setDomesticExperience, overseasExperience, setOverseasExperience,
}) {
  const experienceLabels = {
    year: t('年份', lang), description: t('工作內容', lang), leaveReason: t('離職原因', lang),
    removeRow: t('移除', lang), addRow: t('+ 新增一筆', lang),
  };

  return (
    <>
      <h4>{t('個人基本資料', lang)}</h4>
      <div className="form-grid">
        <label>{t('越文姓名', lang)}<input value={form.vietnameseName || ''} onChange={(e) => setField('vietnameseName', e.target.value)} /></label>
        <label>{t('中文姓名', lang)}<input value={form.chineseName || ''} onChange={(e) => setField('chineseName', e.target.value)} /></label>
        <label>
          {t('性別', lang)}
          <select value={form.gender || ''} onChange={(e) => setField('gender', e.target.value)}>
            <option value="">{t('請選擇', lang)}</option>
            <option value="男">{t('男', lang)}</option>
            <option value="女">{t('女', lang)}</option>
          </select>
        </label>
        <label>{t('地區', lang)}<input value={form.hometown || ''} onChange={(e) => setField('hometown', e.target.value)} /></label>
        <label>{t('電話', lang)}<input value={form.phone || ''} onChange={(e) => setField('phone', e.target.value)} /></label>
        <label>{t('出生日期', lang)}<input type="date" value={form.birthDate || ''} onChange={(e) => setField('birthDate', e.target.value)} /></label>
        <label>{t('身高(cm)', lang)}<input type="number" value={form.height || ''} onChange={(e) => setField('height', e.target.value)} /></label>
        <label>{t('體重(kg)', lang)}<input type="number" value={form.weight || ''} onChange={(e) => setField('weight', e.target.value)} /></label>
        <label>{t('視力', lang)}<input value={form.eyesight || ''} onChange={(e) => setField('eyesight', e.target.value)} /></label>
        <label>{t('宗教', lang)}<input value={form.religion || ''} onChange={(e) => setField('religion', e.target.value)} /></label>
        <label>{t('民族', lang)}<input value={form.ethnicity || ''} onChange={(e) => setField('ethnicity', e.target.value)} /></label>
        <label>
          {t('慣用手', lang)}
          <select value={form.dominantHand || ''} onChange={(e) => setField('dominantHand', e.target.value)}>
            <option value="">{t('請選擇', lang)}</option>
            <option value="左手">{t('左手', lang)}</option>
            <option value="右手">{t('右手', lang)}</option>
          </select>
        </label>
        <label>
          {t('重大手術', lang)}
          <select value={form.majorSurgery || ''} onChange={(e) => setField('majorSurgery', e.target.value)}>
            <option value="">{t('請選擇', lang)}</option>
            <option value="有">{t('有', lang)}</option>
            <option value="無">{t('無', lang)}</option>
          </select>
        </label>
        <label>
          {t('是否有刺青', lang)}
          <select value={form.hasTattoo || ''} onChange={(e) => setField('hasTattoo', e.target.value)}>
            <option value="">{t('請選擇', lang)}</option>
            <option value="有">{t('有', lang)}</option>
            <option value="無">{t('無', lang)}</option>
          </select>
        </label>
      </div>

      <h4>{t('家庭狀況', lang)}</h4>
      <div className="form-grid">
        <label>
          {t('結婚狀況', lang)}
          <select value={form.maritalStatus || ''} onChange={(e) => setField('maritalStatus', e.target.value)}>
            <option value="">{t('請選擇', lang)}</option>
            <option value="未婚">{t('未婚', lang)}</option>
            <option value="已婚">{t('已婚', lang)}</option>
          </select>
        </label>
        <label>{t('緊急聯絡電話', lang)}<input value={form.familyContactPhone || ''} onChange={(e) => setField('familyContactPhone', e.target.value)} /></label>
        <label>{t('父親姓名', lang)}<input value={form.fatherName || ''} onChange={(e) => setField('fatherName', e.target.value)} /></label>
        <label>
          {t('存歿', lang)}
          <select value={form.fatherAlive || ''} onChange={(e) => setField('fatherAlive', e.target.value)}>
            <option value="">{t('請選擇', lang)}</option>
            <option value="存">{t('存', lang)}</option>
            <option value="歿">{t('歿', lang)}</option>
          </select>
        </label>
        <label>{t('年齡', lang)}<input value={form.fatherAge || ''} onChange={(e) => setField('fatherAge', e.target.value)} /></label>
        <label>{t('職業', lang)}<input value={form.fatherOccupation || ''} onChange={(e) => setField('fatherOccupation', e.target.value)} /></label>

        <label>{t('母親姓名', lang)}<input value={form.motherName || ''} onChange={(e) => setField('motherName', e.target.value)} /></label>
        <label>
          {t('存歿', lang)}
          <select value={form.motherAlive || ''} onChange={(e) => setField('motherAlive', e.target.value)}>
            <option value="">{t('請選擇', lang)}</option>
            <option value="存">{t('存', lang)}</option>
            <option value="歿">{t('歿', lang)}</option>
          </select>
        </label>
        <label>{t('年齡', lang)}<input value={form.motherAge || ''} onChange={(e) => setField('motherAge', e.target.value)} /></label>
        <label>{t('職業', lang)}<input value={form.motherOccupation || ''} onChange={(e) => setField('motherOccupation', e.target.value)} /></label>

        <label>{t('配偶姓名', lang)}<input value={form.spouseName || ''} onChange={(e) => setField('spouseName', e.target.value)} /></label>
        <label>{t('年齡', lang)}<input value={form.spouseAge || ''} onChange={(e) => setField('spouseAge', e.target.value)} /></label>
        <label>{t('職業', lang)}<input value={form.spouseOccupation || ''} onChange={(e) => setField('spouseOccupation', e.target.value)} /></label>

        <label>{t('子女人數', lang)}<input type="number" value={form.childrenCount || ''} onChange={(e) => setField('childrenCount', e.target.value)} /></label>
        <label>{t('兄弟姐妹人數', lang)}<input type="number" value={form.siblingsCount || ''} onChange={(e) => setField('siblingsCount', e.target.value)} /></label>
        <label>{t('家中排行', lang)}<input type="number" value={form.birthOrder || ''} onChange={(e) => setField('birthOrder', e.target.value)} /></label>
        <label>
          {t('在台親戚', lang)}
          <select value={form.relativesInTaiwan || ''} onChange={(e) => setField('relativesInTaiwan', e.target.value)}>
            <option value="">{t('請選擇', lang)}</option>
            <option value="有">{t('有', lang)}</option>
            <option value="無">{t('無', lang)}</option>
          </select>
        </label>
        {form.relativesInTaiwan === '有' && (
          <label>{t('若有，哪個縣市', lang)}<input value={form.relativesLocation || ''} onChange={(e) => setField('relativesLocation', e.target.value)} /></label>
        )}
      </div>

      <h4>{t('學歷、語言', lang)}</h4>
      <div className="form-grid">
        <label>{t('最高學歷', lang)}<input value={form.educationLevel || ''} onChange={(e) => setField('educationLevel', e.target.value)} /></label>
        <label>
          {t('中文程度', lang)}
          <select value={form.chineseLevel || ''} onChange={(e) => setField('chineseLevel', e.target.value)}>
            <option value="">{t('請選擇', lang)}</option>
            <option value="不會">{t('不會', lang)}</option>
            <option value="會一點">{t('會一點', lang)}</option>
            <option value="中等">{t('中等', lang)}</option>
            <option value="流利">{t('流利', lang)}</option>
          </select>
        </label>
        <label>
          {t('英文程度', lang)}
          <select value={form.englishLevel || ''} onChange={(e) => setField('englishLevel', e.target.value)}>
            <option value="">{t('請選擇', lang)}</option>
            <option value="不會">{t('不會', lang)}</option>
            <option value="會一點">{t('會一點', lang)}</option>
            <option value="中等">{t('中等', lang)}</option>
            <option value="流利">{t('流利', lang)}</option>
          </select>
        </label>
      </div>

      <h4>{t('國內工作經驗', lang)}</h4>
      <ExperienceEditor rows={domesticExperience} setRows={setDomesticExperience} labels={experienceLabels} />
      <h4>{t('國外工作經驗', lang)}</h4>
      <ExperienceEditor rows={overseasExperience} setRows={setOverseasExperience} labels={experienceLabels} />

      <label style={{ display: 'block', marginTop: 16 }}>
        {t('專長', lang)}
        <textarea rows={3} value={form.specialties || ''} onChange={(e) => setField('specialties', e.target.value)} />
      </label>
    </>
  );
}
