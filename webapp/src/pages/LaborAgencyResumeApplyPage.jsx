import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../firebase';
import { RESUME_LABELS as LABELS } from '../lib/laborAgencyResumeLabels';
import { translateViToZh } from '../lib/translate';
import { useResumeTranslate } from '../lib/useResumeTranslate';
import { suggestChineseName } from '../lib/vietnameseNameToChinese';

const MAX_PHOTO_SIZE = 3 * 1024 * 1024;

// 公開的線上履歷填寫頁面（/apply/laborAgency?ref=專員姓名），不需要登入；
// 欄位依使用者提供的「工廠移工人員履歷表」（中越文對照）製作，中文/越南文
// 可用上方按鈕切換顯示（跟 JunyuCompanySitePage.jsx 的語言切換同一套做法，
// 欄位對照表是這張表單專用的，放在 lib/laborAgencyResumeLabels.js 跟移工
// 名冊的「下載履歷表」共用，不進共用的 lib/i18n.js 字典）。送出後新增一筆
// laborAgency_resumeSubmissions，由內部人員在「履歷表連結」頁面轉入移工
// 資料（跟 vietnam 系統的 VietnamResumeApplyPage.jsx 同一套模式）。
const LANGS = [{ key: 'zh', label: '中文' }, { key: 'vi', label: 'Tiếng Việt' }];

// 匯出給 systems/laborAgency/ResumeLinksPage.jsx 的「編輯履歷」表單共用，
// 不用重複寫一份一樣的國內外工作經驗編輯器。
export function emptyExperienceRow() {
  return { startDate: '', endDate: '', description: '', reason: '' };
}

// 舊資料相容：欄位原本只有單一「年份」(year，YYYY-MM-DD)，改成開始/
// 結束年月(startDate/endDate，YYYY-MM)兩個欄位後，舊資料沒有 startDate
// 時用 year 切成 YYYY-MM 補上，沒有結束年月（舊資料本來就沒有這個概念）
// 就留空，不用特別遷移 Firestore 既有紀錄也能正常顯示/編輯。
export function normalizeExperienceRow(r) {
  return {
    startDate: r.startDate || (r.year ? r.year.slice(0, 7) : ''),
    endDate: r.endDate || '',
    description: r.description || '',
    descriptionZh: r.descriptionZh || '',
    reason: r.reason || '',
    reasonZh: r.reasonZh || '',
  };
}

// 獨立宣告在元件外面——原本寫在 LaborAgencyResumeApplyPage 裡面，每次
// render 都會產生新的函式參照，React 視為不同的元件型別而整個重新掛載，
// 導致裡面的 input 每打一個字就失焦、看起來像完全打不進去。
// translatable=true 時，工作內容/離職原因失焦會自動把越南文翻譯結果存進
// 同一列的 descriptionZh/reasonZh（原文保留，跟 lib/useResumeTranslate.js
// 同一套模式，只是這裡是陣列裡每一列各自的欄位，不是整個表單的欄位，
// 沒辦法直接共用那個 hook）。
export function ExperienceEditor({ rows, setRows, labels, translatable }) {
  const lastSource = useRef({});
  // 翻譯失敗（例如免費額度用完、網路暫時不通）不再整個吞掉看不出來——
  // 記下失敗的那一格，畫面顯示錯誤訊息＋「重新翻譯」按鈕，填寫人員可以
  // 自己決定要不要再試一次，而不是看到中文欄位一直是空的卻不知道發生
  // 什麼事。
  const [failed, setFailed] = useState({});

  function updateRow(i, patch) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i) {
    setRows(rows.filter((_, idx) => idx !== i));
  }
  async function runTranslate(cacheKey, i, zhField, source) {
    try {
      const result = await translateViToZh(source);
      updateRow(i, { [zhField]: result });
      setFailed((f) => { const next = { ...f }; delete next[cacheKey]; return next; });
    } catch (err) {
      setFailed((f) => ({ ...f, [cacheKey]: err.message || String(err) }));
    }
  }
  function handleBlurTranslate(i, zhField, value) {
    if (!translatable) return;
    const source = (value || '').trim();
    const cacheKey = `${i}-${zhField}`;
    if (!source || lastSource.current[cacheKey] === source) return;
    lastSource.current[cacheKey] = source;
    runTranslate(cacheKey, i, zhField, source);
  }
  function handleRetry(i, zhField, source) {
    const cacheKey = `${i}-${zhField}`;
    runTranslate(cacheKey, i, zhField, source);
  }
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} className="form-grid" style={{ marginBottom: 8 }}>
          <label>
            {labels.startDate}
            <input type="month" value={r.startDate} onChange={(e) => updateRow(i, { startDate: e.target.value })} />
          </label>
          <label>
            {labels.endDate}
            <input type="month" value={r.endDate} onChange={(e) => updateRow(i, { endDate: e.target.value })} />
          </label>
          <label>
            {labels.description}
            <input
              value={r.description}
              onChange={(e) => updateRow(i, { description: e.target.value })}
              onBlur={(e) => handleBlurTranslate(i, 'descriptionZh', e.target.value)}
            />
            {translatable && failed[`${i}-descriptionZh`] && (
              <div className="error-text" style={{ fontSize: 12 }}>
                {labels.translateFailed}
                <button type="button" className="small" onClick={() => handleRetry(i, 'descriptionZh', r.description)} style={{ marginLeft: 6 }}>{labels.retryTranslate}</button>
              </div>
            )}
          </label>
          <label>
            {labels.leaveReason}
            <input
              value={r.reason}
              onChange={(e) => updateRow(i, { reason: e.target.value })}
              onBlur={(e) => handleBlurTranslate(i, 'reasonZh', e.target.value)}
            />
            {translatable && failed[`${i}-reasonZh`] && (
              <div className="error-text" style={{ fontSize: 12 }}>
                {labels.translateFailed}
                <button type="button" className="small" onClick={() => handleRetry(i, 'reasonZh', r.reason)} style={{ marginLeft: 6 }}>{labels.retryTranslate}</button>
              </div>
            )}
          </label>
          {rows.length > 1 && <button type="button" onClick={() => removeRow(i)} style={{ alignSelf: 'end' }}>{labels.removeRow}</button>}
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, emptyExperienceRow()])}>{labels.addRow}</button>
    </div>
  );
}

export default function LaborAgencyResumeApplyPage() {
  const [searchParams] = useSearchParams();
  const assignedStaff = searchParams.get('ref') || '';
  const [lang, setLang] = useState('zh');
  const [form, setForm] = useState({ gender: '', dominantHand: '', majorSurgery: '', hasTattoo: '', maritalStatus: '', relativesInTaiwan: '', chineseLevel: '', englishLevel: '' });
  const [domesticExperience, setDomesticExperience] = useState([emptyExperienceRow(), emptyExperienceRow()]);
  const [overseasExperience, setOverseasExperience] = useState([emptyExperienceRow(), emptyExperienceRow()]);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [tattooPhotoFiles, setTattooPhotoFiles] = useState([]);
  const [tattooPhotoError, setTattooPhotoError] = useState('');
  const [lineQrPhotoFile, setLineQrPhotoFile] = useState(null);
  const [lineQrPhotoError, setLineQrPhotoError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const L = (key) => LABELS[key][lang];

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const { translateOnBlur } = useResumeTranslate(setField);

  function handlePhotoChange(e) {
    const file = e.target.files?.[0] || null;
    setPhotoError('');
    if (file && file.size > MAX_PHOTO_SIZE) {
      setPhotoError(L('photoTooBig'));
      setPhotoFile(null);
      e.target.value = '';
      return;
    }
    setPhotoFile(file);
  }

  // 刺青照片可以選很多張刺青分開拍，所以可以一次選多個檔案、也可以分
  // 好幾次選擇繼續補加——每次選擇的檔案都加進既有清單，不是整批取代，
  // 選完整批超過大小限制才整批拒絕（比逐張各自判斷更不容易讓使用者
  // 搞不清楚哪一張被拒絕）。
  function handleTattooPhotoChange(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setTattooPhotoError('');
    const tooBig = files.find((f) => f.size > MAX_PHOTO_SIZE);
    if (tooBig) {
      setTattooPhotoError(L('photoTooBig'));
      return;
    }
    setTattooPhotoFiles((prev) => [...prev, ...files]);
  }

  function removeTattooPhotoFile(index) {
    setTattooPhotoFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleLineQrPhotoChange(e) {
    const file = e.target.files?.[0] || null;
    setLineQrPhotoError('');
    if (file && file.size > MAX_PHOTO_SIZE) {
      setLineQrPhotoError(L('photoTooBig'));
      setLineQrPhotoFile(null);
      e.target.value = '';
      return;
    }
    setLineQrPhotoFile(file);
  }

  async function uploadPhoto(file, prefix) {
    if (!file) return '';
    const path = `laborAgency_resumePhotos/${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, { contentType: file.type });
    return getDownloadURL(storageRef);
  }

  async function uploadPhotos(files, prefix) {
    return Promise.all(files.map((file) => uploadPhoto(file, prefix)));
  }

  const experienceLabels = {
    startDate: L('startDate'), endDate: L('endDate'), description: L('description'), leaveReason: L('leaveReason'),
    removeRow: L('removeRow'), addRow: L('addRow'),
    translateFailed: L('translateFailed'), retryTranslate: L('retryTranslate'),
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const photoUrl = await uploadPhoto(photoFile, 'headshot');
      const tattooPhotoUrls = await uploadPhotos(tattooPhotoFiles, 'tattoo');
      const lineQrPhotoUrl = await uploadPhoto(lineQrPhotoFile, 'lineQr');
      // 履歷填寫的完整資料——移工名冊(laborAgency_workers)跟履歷表連結的
      // 履歷清單(laborAgency_resumeSubmissions)都要存這整份，名冊才能顯示
      // 跟下載完整的履歷表，不是只存精簡的幾個欄位。
      const resumeFields = {
        vietnameseName: form.vietnameseName || '',
        chineseName: form.chineseName || '',
        gender: form.gender || '',
        phone: form.phone || '',
        hometown: form.hometown || '',
        hometownZh: form.hometownZh || '',
        birthDate: form.birthDate || '',
        height: form.height || '',
        weight: form.weight || '',
        eyesight: form.eyesight || '',
        religion: form.religion || '',
        religionZh: form.religionZh || '',
        ethnicity: form.ethnicity || '',
        ethnicityZh: form.ethnicityZh || '',
        dominantHand: form.dominantHand || '',
        majorSurgery: form.majorSurgery || '',
        hasTattoo: form.hasTattoo || '',
        tattooPhotoUrls: JSON.stringify(tattooPhotoUrls),
        lineQrPhotoUrl,
        maritalStatus: form.maritalStatus || '',
        familyContactPhone: form.familyContactPhone || '',
        photoUrl,
        fatherName: form.fatherName || '',
        fatherAlive: form.fatherAlive || '',
        fatherAge: form.fatherAge || '',
        fatherOccupation: form.fatherOccupation || '',
        fatherOccupationZh: form.fatherOccupationZh || '',
        motherName: form.motherName || '',
        motherAlive: form.motherAlive || '',
        motherAge: form.motherAge || '',
        motherOccupation: form.motherOccupation || '',
        motherOccupationZh: form.motherOccupationZh || '',
        spouseName: form.spouseName || '',
        spouseAge: form.spouseAge || '',
        spouseOccupation: form.spouseOccupation || '',
        spouseOccupationZh: form.spouseOccupationZh || '',
        childrenCount: form.childrenCount || '',
        siblingsCount: form.siblingsCount || '',
        birthOrder: form.birthOrder || '',
        relativesInTaiwan: form.relativesInTaiwan || '',
        relativesLocation: form.relativesLocation || '',
        educationLevel: form.educationLevel || '',
        educationLevelZh: form.educationLevelZh || '',
        chineseLevel: form.chineseLevel || '',
        englishLevel: form.englishLevel || '',
        domesticExperience: JSON.stringify(domesticExperience.filter((r) => r.startDate || r.endDate || r.description || r.reason)),
        overseasExperience: JSON.stringify(overseasExperience.filter((r) => r.startDate || r.endDate || r.description || r.reason)),
        specialties: form.specialties || '',
        specialtiesZh: form.specialtiesZh || '',
        interviewVideoLink: form.interviewVideoLink || '',
      };
      // 送出履歷時直接建立一筆工人資料（進「移工名冊」，案件
      // 階段從「雇主確認」起算），內部人員不用再手動「轉入移工管理」。
      const workerDoc = await addDoc(collection(db, 'laborAgency_workers'), {
        ...resumeFields,
        name: form.chineseName || form.vietnameseName || '',
        province: form.hometown || '',
        note: form.specialties || '',
        stage: '雇主確認',
        updatedAt: Date.now(),
      });
      await addDoc(collection(db, 'laborAgency_resumeSubmissions'), {
        ...resumeFields,
        assignedStaff,
        status: '待處理',
        workerId: workerDoc.id,
        createdAt: serverTimestamp(),
      });
      setDone(true);
    } catch (err) {
      setError(`${L('submitFailed')}：${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="login-wrap">
        <div className="login-card card">
          <h2 style={{ margin: 0 }}>{L('doneTitle')}</h2>
          <p className="muted">{L('doneDesc')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <form className="login-card card" onSubmit={handleSubmit} style={{ width: 640, maxWidth: '100%' }}>
        <div className="row-actions" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
          {LANGS.map((l) => (
            <button key={l.key} type="button" className={lang === l.key ? 'primary' : ''} onClick={() => setLang(l.key)} style={{ fontSize: 13, padding: '6px 12px' }}>
              {l.label}
            </button>
          ))}
        </div>
        <h2 style={{ margin: 0 }}>{L('pageTitle')}</h2>

        <h3>{L('sectionBasic')}</h3>
        <div className="form-grid">
          <label>
            {L('vietnameseName')}
            <input required value={form.vietnameseName || ''} onChange={(e) => setField('vietnameseName', e.target.value)} onBlur={(e) => { if (!form.chineseName) setField('chineseName', suggestChineseName(e.target.value)); }} />
          </label>
          <label>
            {L('chineseName')}
            <input value={form.chineseName || ''} onChange={(e) => setField('chineseName', e.target.value)} />
          </label>
          <label>
            {L('gender')}
            <select required value={form.gender} onChange={(e) => setField('gender', e.target.value)}>
              <option value="">{L('select')}</option>
              <option value="男">{L('male')}</option>
              <option value="女">{L('female')}</option>
            </select>
          </label>
          <label>
            {L('hometown')}
            <input value={form.hometown || ''} onChange={(e) => setField('hometown', e.target.value)} onBlur={(e) => translateOnBlur('hometownZh', e.target.value)} />
          </label>
          <label>
            {L('phone')}
            <input value={form.phone || ''} onChange={(e) => setField('phone', e.target.value)} />
          </label>
          <label>
            {L('lineQrPhoto')}
            <input type="file" accept="image/*" onChange={handleLineQrPhotoChange} />
            {lineQrPhotoError && <div className="error-text">{lineQrPhotoError}</div>}
          </label>
          <label>
            {L('birthDate')}
            <input type="date" value={form.birthDate || ''} onChange={(e) => setField('birthDate', e.target.value)} />
          </label>
          <label>
            {L('height')}
            <input type="number" value={form.height || ''} onChange={(e) => setField('height', e.target.value)} />
          </label>
          <label>
            {L('weight')}
            <input type="number" value={form.weight || ''} onChange={(e) => setField('weight', e.target.value)} />
          </label>
          <label>
            {L('eyesight')}
            <input value={form.eyesight || ''} onChange={(e) => setField('eyesight', e.target.value)} />
          </label>
          <label>
            {L('religion')}
            <input value={form.religion || ''} onChange={(e) => setField('religion', e.target.value)} onBlur={(e) => translateOnBlur('religionZh', e.target.value)} />
          </label>
          <label>
            {L('ethnicity')}
            <input value={form.ethnicity || ''} onChange={(e) => setField('ethnicity', e.target.value)} onBlur={(e) => translateOnBlur('ethnicityZh', e.target.value)} />
          </label>
          <label>
            {L('dominantHand')}
            <select value={form.dominantHand} onChange={(e) => setField('dominantHand', e.target.value)}>
              <option value="">{L('select')}</option>
              <option value="左手">{L('leftHand')}</option>
              <option value="右手">{L('rightHand')}</option>
            </select>
          </label>
          <label>
            {L('majorSurgery')}
            <select value={form.majorSurgery} onChange={(e) => setField('majorSurgery', e.target.value)}>
              <option value="">{L('select')}</option>
              <option value="有">{L('yes')}</option>
              <option value="無">{L('no')}</option>
            </select>
          </label>
          <label>
            {L('hasTattoo')}
            <select value={form.hasTattoo} onChange={(e) => setField('hasTattoo', e.target.value)}>
              <option value="">{L('select')}</option>
              <option value="有">{L('yes')}</option>
              <option value="無">{L('no')}</option>
            </select>
          </label>
          {form.hasTattoo === '有' && (
            <label>
              {L('tattooPhoto')}
              {tattooPhotoFiles.length > 0 && (
                <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                  {tattooPhotoFiles.map((f, i) => (
                    <li key={`${f.name}-${i}`} style={{ fontSize: 13 }}>
                      {f.name}
                      <button type="button" className="small" onClick={() => removeTattooPhotoFile(i)} style={{ marginLeft: 6 }}>{L('removeRow')}</button>
                    </li>
                  ))}
                </ul>
              )}
              <input type="file" accept="image/*" multiple onChange={handleTattooPhotoChange} />
              {tattooPhotoError && <div className="error-text">{tattooPhotoError}</div>}
            </label>
          )}
          <label>
            {L('photo')}
            <input type="file" accept="image/*" onChange={handlePhotoChange} />
            {photoError && <div className="error-text">{photoError}</div>}
          </label>
        </div>

        <h3>{L('sectionFamily')}</h3>
        <div className="form-grid">
          <label>
            {L('maritalStatus')}
            <select value={form.maritalStatus} onChange={(e) => setField('maritalStatus', e.target.value)}>
              <option value="">{L('select')}</option>
              <option value="未婚">{L('single')}</option>
              <option value="已婚">{L('married')}</option>
            </select>
          </label>
          <label>{L('familyContactPhone')}<input value={form.familyContactPhone || ''} onChange={(e) => setField('familyContactPhone', e.target.value)} /></label>
          <label>{L('father')}<input value={form.fatherName || ''} onChange={(e) => setField('fatherName', e.target.value)} /></label>
          <label>{L('alive')}
            <select value={form.fatherAlive || ''} onChange={(e) => setField('fatherAlive', e.target.value)}>
              <option value="">{L('select')}</option>
              <option value="存">{L('stillAlive')}</option>
              <option value="歿">{L('deceased')}</option>
            </select>
          </label>
          <label>{L('age')}<input value={form.fatherAge || ''} onChange={(e) => setField('fatherAge', e.target.value)} /></label>
          <label>{L('occupation')}<input value={form.fatherOccupation || ''} onChange={(e) => setField('fatherOccupation', e.target.value)} onBlur={(e) => translateOnBlur('fatherOccupationZh', e.target.value)} /></label>

          <label>{L('mother')}<input value={form.motherName || ''} onChange={(e) => setField('motherName', e.target.value)} /></label>
          <label>{L('alive')}
            <select value={form.motherAlive || ''} onChange={(e) => setField('motherAlive', e.target.value)}>
              <option value="">{L('select')}</option>
              <option value="存">{L('stillAlive')}</option>
              <option value="歿">{L('deceased')}</option>
            </select>
          </label>
          <label>{L('age')}<input value={form.motherAge || ''} onChange={(e) => setField('motherAge', e.target.value)} /></label>
          <label>{L('occupation')}<input value={form.motherOccupation || ''} onChange={(e) => setField('motherOccupation', e.target.value)} onBlur={(e) => translateOnBlur('motherOccupationZh', e.target.value)} /></label>

          <label>{L('spouse')}<input value={form.spouseName || ''} onChange={(e) => setField('spouseName', e.target.value)} /></label>
          <label>{L('age')}<input value={form.spouseAge || ''} onChange={(e) => setField('spouseAge', e.target.value)} /></label>
          <label>{L('occupation')}<input value={form.spouseOccupation || ''} onChange={(e) => setField('spouseOccupation', e.target.value)} onBlur={(e) => translateOnBlur('spouseOccupationZh', e.target.value)} /></label>

          <label>{L('childrenCount')}<input type="number" value={form.childrenCount || ''} onChange={(e) => setField('childrenCount', e.target.value)} /></label>
          <label>{L('siblingsCount')}<input type="number" value={form.siblingsCount || ''} onChange={(e) => setField('siblingsCount', e.target.value)} /></label>
          <label>{L('birthOrder')}<input type="number" value={form.birthOrder || ''} onChange={(e) => setField('birthOrder', e.target.value)} /></label>
          <label>{L('relativesInTaiwan')}
            <select value={form.relativesInTaiwan} onChange={(e) => setField('relativesInTaiwan', e.target.value)}>
              <option value="">{L('select')}</option>
              <option value="有">{L('yes')}</option>
              <option value="無">{L('no')}</option>
            </select>
          </label>
          {form.relativesInTaiwan === '有' && (
            <label>{L('relativesLocation')}<input value={form.relativesLocation || ''} onChange={(e) => setField('relativesLocation', e.target.value)} /></label>
          )}
        </div>

        <h3>{L('sectionEducation')}</h3>
        <div className="form-grid">
          <label>{L('educationLevel')}<input value={form.educationLevel || ''} onChange={(e) => setField('educationLevel', e.target.value)} onBlur={(e) => translateOnBlur('educationLevelZh', e.target.value)} /></label>
          <label>
            {L('chineseLevel')}
            <select value={form.chineseLevel} onChange={(e) => setField('chineseLevel', e.target.value)}>
              <option value="">{L('select')}</option>
              <option value="不會">{L('langNone')}</option>
              <option value="會一點">{L('langLittle')}</option>
              <option value="中等">{L('langOk')}</option>
              <option value="流利">{L('langGood')}</option>
            </select>
          </label>
          <label>
            {L('englishLevel')}
            <select value={form.englishLevel} onChange={(e) => setField('englishLevel', e.target.value)}>
              <option value="">{L('select')}</option>
              <option value="不會">{L('langNone')}</option>
              <option value="會一點">{L('langLittle')}</option>
              <option value="中等">{L('langOk')}</option>
              <option value="流利">{L('langGood')}</option>
            </select>
          </label>
        </div>

        <h3>{L('sectionExperience')}</h3>
        <h4>{L('domesticExperience')}</h4>
        <ExperienceEditor rows={domesticExperience} setRows={setDomesticExperience} labels={experienceLabels} translatable />
        <h4>{L('overseasExperience')}</h4>
        <ExperienceEditor rows={overseasExperience} setRows={setOverseasExperience} labels={experienceLabels} translatable />

        <label style={{ display: 'block', marginTop: 16 }}>
          {L('interviewVideoLink')}
          <input value={form.interviewVideoLink || ''} onChange={(e) => setField('interviewVideoLink', e.target.value)} placeholder="https://..." />
        </label>

        <label style={{ display: 'block', marginTop: 16 }}>
          {L('specialties')}
          <textarea rows={3} value={form.specialties || ''} onChange={(e) => setField('specialties', e.target.value)} onBlur={(e) => translateOnBlur('specialtiesZh', e.target.value)} />
        </label>

        {error && <div className="error-text">{error}</div>}
        <button type="submit" className="primary" style={{ marginTop: 16 }} disabled={busy}>{busy ? L('submitting') : L('submit')}</button>
      </form>
    </div>
  );
}
