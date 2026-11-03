import { useState } from 'react';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase';
import { ExperienceEditor } from '../pages/LaborAgencyResumeApplyPage';
import { t } from '../lib/i18n';

const MAX_PHOTO_SIZE = 3 * 1024 * 1024;

async function uploadResumePhoto(file, prefix) {
  const path = `laborAgency_resumePhotos/${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}

// 照片/刺青照片/LINE 圖片上傳——內部人員「新增工人／編輯」「編輯履歷」
// 也要能補上傳或換掉這幾張圖片，不是只有移工自己填公開履歷表時才能上傳，
// 不然下載履歷表時這幾個欄位永遠是空的（內部新建的工人資料從來沒有管道
// 可以填圖片）。
function PhotoField({ label, value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleChange(e) {
    const file = e.target.files?.[0] || null;
    e.target.value = '';
    if (!file) return;
    setError('');
    if (file.size > MAX_PHOTO_SIZE) {
      setError('照片檔案太大（上限 3MB）');
      return;
    }
    setBusy(true);
    try {
      const url = await uploadResumePhoto(file, 'internal');
      onChange(url);
    } catch (err) {
      setError(`上傳失敗：${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <label>
      {label}
      {value && (
        <div style={{ margin: '4px 0' }}>
          <img src={value} alt="" style={{ width: 80, height: 80, objectFit: 'cover', display: 'block' }} />
        </div>
      )}
      <input type="file" accept="image/*" onChange={handleChange} disabled={busy} />
      {error && <div className="error-text">{error}</div>}
    </label>
  );
}

export function emptyInterviewRow() {
  return { date: '', link: '', note: '' };
}

// 面試連結：可複選新增多筆（例如視訊面試、複試各一筆），不是單一欄位。
function InterviewLinksEditor({ rows, setRows, lang }) {
  function updateRow(i, patch) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i) {
    setRows(rows.filter((_, idx) => idx !== i));
  }
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} className="form-grid" style={{ marginBottom: 8 }}>
          <label>{t('面試日期', lang)}<input type="date" value={r.date} onChange={(e) => updateRow(i, { date: e.target.value })} /></label>
          <label>{t('面試連結', lang)}<input value={r.link} onChange={(e) => updateRow(i, { link: e.target.value })} placeholder="https://..." /></label>
          <label>{t('備註', lang)}<input value={r.note} onChange={(e) => updateRow(i, { note: e.target.value })} /></label>
          {rows.length > 1 && <button type="button" onClick={() => removeRow(i)} style={{ alignSelf: 'end' }}>{t('移除', lang)}</button>}
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, emptyInterviewRow()])}>{t('+ 新增一筆', lang)}</button>
    </div>
  );
}

// 內部人員用的「工廠移工人員履歷表」欄位——systems/laborAgency/ResumeLinksPage.jsx
// 的「編輯履歷」跟 systems/laborAgency/WorkerRosterPage.jsx 的「新增工人／
// 編輯」都共用這份，欄位跟公開填寫頁 (pages/LaborAgencyResumeApplyPage.jsx)
// 完全一致，只維護一次；國內外工作經驗的編輯器也直接共用該頁匯出的
// ExperienceEditor，不用各自重複寫一份。面試連結是內部專用欄位，公開
// 填寫頁沒有（移工自己不會知道面試連結），只在這裡出現。
export default function ResumeInternalFields({
  form, setField, lang, domesticExperience, setDomesticExperience, overseasExperience, setOverseasExperience,
  interviewLinks, setInterviewLinks,
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
        <label>{t('省份', lang)}<input value={form.hometown || ''} onChange={(e) => setField('hometown', e.target.value)} /></label>
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
        <PhotoField label={t('照片', lang)} value={form.photoUrl} onChange={(url) => setField('photoUrl', url)} />
        {form.hasTattoo === '有' && (
          <PhotoField label={t('刺青照片', lang)} value={form.tattooPhotoUrl} onChange={(url) => setField('tattooPhotoUrl', url)} />
        )}
        <PhotoField label="LINE" value={form.lineQrPhotoUrl} onChange={(url) => setField('lineQrPhotoUrl', url)} />
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

      <h4>{t('面試連結', lang)}</h4>
      <InterviewLinksEditor rows={interviewLinks} setRows={setInterviewLinks} lang={lang} />

      <label style={{ display: 'block', marginTop: 16 }}>
        {t('專長', lang)}
        <textarea rows={3} value={form.specialties || ''} onChange={(e) => setField('specialties', e.target.value)} />
      </label>
    </>
  );
}
