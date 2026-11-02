import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../firebase';

const MAX_PHOTO_SIZE = 3 * 1024 * 1024;

// 公開的線上履歷填寫頁面（/apply/laborAgency?ref=專員姓名），不需要登入；
// 欄位依使用者提供的「工廠移工人員履歷表」（中越文對照）製作，中文/越南文
// 可用上方按鈕切換顯示（跟 JunyuCompanySitePage.jsx 的語言切換同一套做法，
// 這裡詞彙是這張表單專用的，不進共用的 lib/i18n.js 字典）。送出後新增一筆
// laborAgency_resumeSubmissions，由內部人員在「履歷表連結」頁面轉入移工
// 資料（跟 vietnam 系統的 VietnamResumeApplyPage.jsx 同一套模式）。
const LABELS = {
  pageTitle: { zh: '工廠移工人員履歷表', vi: 'Sơ yếu lý lịch công nhân công xưởng' },
  sectionBasic: { zh: '個人基本資料', vi: 'Thông tin cơ bản cá nhân' },
  vietnameseName: { zh: '越文姓名', vi: 'Họ tên tiếng Việt' },
  chineseName: { zh: '中文姓名', vi: 'Họ tên tiếng Trung' },
  gender: { zh: '性別', vi: 'Giới tính' },
  male: { zh: '男', vi: 'Nam' },
  female: { zh: '女', vi: 'Nữ' },
  hometown: { zh: '地區', vi: 'Địa chỉ' },
  birthDate: { zh: '出生日期', vi: 'Ngày sinh' },
  height: { zh: '身高(cm)', vi: 'Chiều cao (cm)' },
  weight: { zh: '體重(kg)', vi: 'Cân nặng (kg)' },
  eyesight: { zh: '視力', vi: 'Thị lực' },
  religion: { zh: '宗教', vi: 'Tôn giáo' },
  ethnicity: { zh: '民族', vi: 'Dân tộc' },
  dominantHand: { zh: '慣用手', vi: 'Tay thuận' },
  leftHand: { zh: '左手', vi: 'Tay trái' },
  rightHand: { zh: '右手', vi: 'Tay phải' },
  majorSurgery: { zh: '是否有過重大手術', vi: 'Có hay không trải qua phẫu thuật lớn' },
  yes: { zh: '有', vi: 'Có' },
  no: { zh: '無', vi: 'Không' },
  hasTattoo: { zh: '是否有刺青', vi: 'Có hình xăm không' },
  tattooPhoto: { zh: '刺青照片', vi: 'Ảnh hình xăm' },
  photo: { zh: '照片', vi: 'Ảnh' },

  sectionFamily: { zh: '家庭狀況', vi: 'Gia đình' },
  maritalStatus: { zh: '結婚狀況', vi: 'Tình trạng hôn nhân' },
  single: { zh: '未婚', vi: 'Độc thân' },
  married: { zh: '已婚', vi: 'Đã kết hôn' },
  father: { zh: '父親姓名', vi: 'Họ tên Bố' },
  mother: { zh: '母親姓名', vi: 'Họ tên Mẹ' },
  spouse: { zh: '配偶姓名', vi: 'Họ tên Vợ/chồng' },
  alive: { zh: '存歿', vi: 'Còn/Mất' },
  stillAlive: { zh: '存', vi: 'Còn' },
  deceased: { zh: '歿', vi: 'Mất' },
  age: { zh: '年齡', vi: 'Tuổi' },
  occupation: { zh: '職業', vi: 'Nghề nghiệp' },
  childrenCount: { zh: '子女人數', vi: 'Số con' },
  siblingsCount: { zh: '兄弟姐妹人數', vi: 'Số anh chị em' },
  birthOrder: { zh: '家中排行', vi: 'Con thứ' },
  relativesInTaiwan: { zh: '在台親戚', vi: 'Người thân ở Đài Loan' },
  relativesLocation: { zh: '若有，哪個縣市', vi: 'Nếu có, ở tỉnh thành nào' },

  sectionEducation: { zh: '學歷、語言', vi: 'Học lực, Ngôn ngữ' },
  educationLevel: { zh: '最高學歷', vi: 'Học lực cao nhất' },
  chineseLevel: { zh: '中文程度', vi: 'Trình độ tiếng Trung' },
  englishLevel: { zh: '英文程度', vi: 'Trình độ tiếng Anh' },
  langNone: { zh: '不會', vi: 'Không biết' },
  langLittle: { zh: '會一點', vi: 'Biết chút ít' },
  langOk: { zh: '中等', vi: 'Trung bình' },
  langGood: { zh: '流利', vi: 'Thành thạo' },

  sectionExperience: { zh: '國內外工作經驗', vi: 'Kinh nghiệm làm việc trong, ngoài nước' },
  domesticExperience: { zh: '國內工作經驗', vi: 'Kinh nghiệm trong nước' },
  overseasExperience: { zh: '國外工作經驗', vi: 'Kinh nghiệm nước ngoài' },
  year: { zh: '年份', vi: 'Năm' },
  description: { zh: '工作內容', vi: 'Nội dung công việc' },
  leaveReason: { zh: '離職原因', vi: 'Nguyên nhân từ chức' },
  addRow: { zh: '+ 新增一筆', vi: '+ Thêm dòng' },
  removeRow: { zh: '移除', vi: 'Xóa' },

  specialties: { zh: '專長', vi: 'Chuyên môn' },

  submit: { zh: '送出', vi: 'Gửi' },
  submitting: { zh: '送出中…', vi: 'Đang gửi…' },
  select: { zh: '請選擇', vi: 'Chọn' },
  photoTooBig: { zh: '照片檔案太大（上限 3MB）', vi: 'Ảnh quá lớn (tối đa 3MB)' },
  submitFailed: { zh: '送出失敗', vi: 'Gửi thất bại' },
  doneTitle: { zh: '履歷已送出', vi: 'Hồ sơ đã được gửi' },
  doneDesc: { zh: '感謝您的填寫，我們會盡快與您聯繫。', vi: 'Cảm ơn bạn đã điền thông tin, chúng tôi sẽ liên hệ sớm nhất có thể.' },
};
const LANGS = [{ key: 'zh', label: '中文' }, { key: 'vi', label: 'Tiếng Việt' }];

function emptyExperienceRow() {
  return { year: '', description: '', reason: '' };
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
  const [tattooPhotoFile, setTattooPhotoFile] = useState(null);
  const [tattooPhotoError, setTattooPhotoError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const L = (key) => LABELS[key][lang];

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

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

  function handleTattooPhotoChange(e) {
    const file = e.target.files?.[0] || null;
    setTattooPhotoError('');
    if (file && file.size > MAX_PHOTO_SIZE) {
      setTattooPhotoError(L('photoTooBig'));
      setTattooPhotoFile(null);
      e.target.value = '';
      return;
    }
    setTattooPhotoFile(file);
  }

  async function uploadPhoto(file, prefix) {
    if (!file) return '';
    const path = `laborAgency_resumePhotos/${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, { contentType: file.type });
    return getDownloadURL(storageRef);
  }

  function ExperienceEditor({ rows, setRows }) {
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
            <label>
              {L('year')}
              <input value={r.year} onChange={(e) => updateRow(i, { year: e.target.value })} />
            </label>
            <label>
              {L('description')}
              <input value={r.description} onChange={(e) => updateRow(i, { description: e.target.value })} />
            </label>
            <label>
              {L('leaveReason')}
              <input value={r.reason} onChange={(e) => updateRow(i, { reason: e.target.value })} />
            </label>
            {rows.length > 1 && <button type="button" onClick={() => removeRow(i)} style={{ alignSelf: 'end' }}>{L('removeRow')}</button>}
          </div>
        ))}
        <button type="button" onClick={() => setRows([...rows, emptyExperienceRow()])}>{L('addRow')}</button>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const photoUrl = await uploadPhoto(photoFile, 'headshot');
      const tattooPhotoUrl = await uploadPhoto(tattooPhotoFile, 'tattoo');
      // 送出履歷時直接建立一筆工人資料（進「移工名冊」，案件
      // 階段從「雇主確認」起算），內部人員不用再手動「轉入移工管理」。
      const workerDoc = await addDoc(collection(db, 'laborAgency_workers'), {
        name: form.chineseName || form.vietnameseName || '',
        vietnameseName: form.vietnameseName || '',
        chineseName: form.chineseName || '',
        gender: form.gender || '',
        province: form.hometown || '',
        photoUrl,
        note: form.specialties || '',
        stage: '雇主確認',
        updatedAt: Date.now(),
      });
      await addDoc(collection(db, 'laborAgency_resumeSubmissions'), {
        vietnameseName: form.vietnameseName || '',
        chineseName: form.chineseName || '',
        gender: form.gender || '',
        hometown: form.hometown || '',
        birthDate: form.birthDate || '',
        height: form.height || '',
        weight: form.weight || '',
        eyesight: form.eyesight || '',
        religion: form.religion || '',
        ethnicity: form.ethnicity || '',
        dominantHand: form.dominantHand || '',
        majorSurgery: form.majorSurgery || '',
        hasTattoo: form.hasTattoo || '',
        tattooPhotoUrl,
        maritalStatus: form.maritalStatus || '',
        photoUrl,
        fatherName: form.fatherName || '',
        fatherAlive: form.fatherAlive || '',
        fatherAge: form.fatherAge || '',
        fatherOccupation: form.fatherOccupation || '',
        motherName: form.motherName || '',
        motherAlive: form.motherAlive || '',
        motherAge: form.motherAge || '',
        motherOccupation: form.motherOccupation || '',
        spouseName: form.spouseName || '',
        spouseAge: form.spouseAge || '',
        spouseOccupation: form.spouseOccupation || '',
        childrenCount: form.childrenCount || '',
        siblingsCount: form.siblingsCount || '',
        birthOrder: form.birthOrder || '',
        relativesInTaiwan: form.relativesInTaiwan || '',
        relativesLocation: form.relativesLocation || '',
        educationLevel: form.educationLevel || '',
        chineseLevel: form.chineseLevel || '',
        englishLevel: form.englishLevel || '',
        domesticExperience: JSON.stringify(domesticExperience.filter((r) => r.year || r.description || r.reason)),
        overseasExperience: JSON.stringify(overseasExperience.filter((r) => r.year || r.description || r.reason)),
        specialties: form.specialties || '',
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
            <input required value={form.vietnameseName || ''} onChange={(e) => setField('vietnameseName', e.target.value)} />
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
            <input value={form.hometown || ''} onChange={(e) => setField('hometown', e.target.value)} />
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
            <input value={form.religion || ''} onChange={(e) => setField('religion', e.target.value)} />
          </label>
          <label>
            {L('ethnicity')}
            <input value={form.ethnicity || ''} onChange={(e) => setField('ethnicity', e.target.value)} />
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
              <input type="file" accept="image/*" onChange={handleTattooPhotoChange} />
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
          <label>{L('father')}<input value={form.fatherName || ''} onChange={(e) => setField('fatherName', e.target.value)} /></label>
          <label>{L('alive')}
            <select value={form.fatherAlive || ''} onChange={(e) => setField('fatherAlive', e.target.value)}>
              <option value="">{L('select')}</option>
              <option value="存">{L('stillAlive')}</option>
              <option value="歿">{L('deceased')}</option>
            </select>
          </label>
          <label>{L('age')}<input value={form.fatherAge || ''} onChange={(e) => setField('fatherAge', e.target.value)} /></label>
          <label>{L('occupation')}<input value={form.fatherOccupation || ''} onChange={(e) => setField('fatherOccupation', e.target.value)} /></label>

          <label>{L('mother')}<input value={form.motherName || ''} onChange={(e) => setField('motherName', e.target.value)} /></label>
          <label>{L('alive')}
            <select value={form.motherAlive || ''} onChange={(e) => setField('motherAlive', e.target.value)}>
              <option value="">{L('select')}</option>
              <option value="存">{L('stillAlive')}</option>
              <option value="歿">{L('deceased')}</option>
            </select>
          </label>
          <label>{L('age')}<input value={form.motherAge || ''} onChange={(e) => setField('motherAge', e.target.value)} /></label>
          <label>{L('occupation')}<input value={form.motherOccupation || ''} onChange={(e) => setField('motherOccupation', e.target.value)} /></label>

          <label>{L('spouse')}<input value={form.spouseName || ''} onChange={(e) => setField('spouseName', e.target.value)} /></label>
          <label>{L('age')}<input value={form.spouseAge || ''} onChange={(e) => setField('spouseAge', e.target.value)} /></label>
          <label>{L('occupation')}<input value={form.spouseOccupation || ''} onChange={(e) => setField('spouseOccupation', e.target.value)} /></label>

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
          <label>{L('educationLevel')}<input value={form.educationLevel || ''} onChange={(e) => setField('educationLevel', e.target.value)} /></label>
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
        <ExperienceEditor rows={domesticExperience} setRows={setDomesticExperience} />
        <h4>{L('overseasExperience')}</h4>
        <ExperienceEditor rows={overseasExperience} setRows={setOverseasExperience} />

        <label style={{ display: 'block', marginTop: 16 }}>
          {L('specialties')}
          <textarea rows={3} value={form.specialties || ''} onChange={(e) => setField('specialties', e.target.value)} />
        </label>

        {error && <div className="error-text">{error}</div>}
        <button type="submit" className="primary" style={{ marginTop: 16 }} disabled={busy}>{busy ? L('submitting') : L('submit')}</button>
      </form>
    </div>
  );
}
