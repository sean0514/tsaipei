import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../firebase';

const CERT_LEVELS = ['A1', 'A2', 'B1', 'B2'];
const MAX_PHOTO_SIZE = 3 * 1024 * 1024;

// 公開的線上履歷填寫頁面（/apply/vietnam?ref=專員姓名），不需要登入；表單
// 欄位依「外國籍學生基本資料表」(中越文對照) 的格式製作。網址帶 ?ref=
// 負責的專員姓名，送出後新增一筆 vietnam_resumeSubmissions，用 assignedStaff
// 記錄是哪個專員的連結——跟 DispatchApplyPage 的 ?ref= 招募專員同樣的模式。
// firestore.rules 只允許這裡用到的欄位、且 status 必須是「待處理」，其他
// 欄位（內部審核狀態、轉入學生資料後的 studentId 等）一律由內部人員後續
// 在「履歷表連結」頁面處理。
export default function VietnamResumeApplyPage() {
  const [searchParams] = useSearchParams();
  const assignedStaff = searchParams.get('ref') || '';
  const [form, setForm] = useState({ hasPassport: '', gender: '', hasCert: '' });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [passportPhotoFile, setPassportPhotoFile] = useState(null);
  const [passportPhotoError, setPassportPhotoError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleFileChange(e, setFile, setFileError) {
    const file = e.target.files?.[0] || null;
    setFileError('');
    if (file && file.size > MAX_PHOTO_SIZE) {
      setFileError('照片檔案太大（上限 3MB）Ảnh quá lớn (tối đa 3MB)');
      setFile(null);
      e.target.value = '';
      return;
    }
    setFile(file);
  }

  async function uploadPhoto(file, prefix) {
    if (!file) return '';
    const path = `vietnam_resumePhotos/${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, { contentType: file.type });
    return getDownloadURL(storageRef);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const [photoUrl, passportPhotoUrl] = await Promise.all([
        uploadPhoto(photoFile, 'headshot'),
        uploadPhoto(passportPhotoFile, 'passport'),
      ]);
      await addDoc(collection(db, 'vietnam_resumeSubmissions'), {
        originalName: form.originalName || '',
        chineseName: form.chineseName || '',
        vietnameseName: form.vietnameseName || '',
        hasPassport: form.hasPassport || '',
        passportId: form.passportId || '',
        gender: form.gender || '',
        birthDate: form.birthDate || '',
        nationality: form.nationality || '',
        height: form.height || '',
        weight: form.weight || '',
        school: form.school || '',
        enrollDate: form.enrollDate || '',
        programYears: form.programYears || '',
        department: form.department || '',
        expectedGraduation: form.expectedGraduation || '',
        hasCert: form.hasCert || '',
        certType: form.certType || '',
        certLevel: form.certLevel || '',
        certPickupDate: form.certPickupDate || '',
        expectedExamDate: form.expectedExamDate || '',
        personalExperience: form.personalExperience || '',
        photoUrl,
        passportPhotoUrl,
        assignedStaff,
        status: '待處理',
        createdAt: serverTimestamp(),
      });
      setDone(true);
    } catch (err) {
      setError(`送出失敗 Gửi thất bại：${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="theme-vietnam login-wrap">
        <div className="login-card card">
          <h2 style={{ margin: 0 }}>履歷已送出 Hồ sơ đã được gửi</h2>
          <p className="muted">感謝您的填寫，我們會盡快與您聯繫。Cảm ơn bạn đã điền thông tin, chúng tôi sẽ liên hệ sớm nhất có thể.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-vietnam login-wrap">
      <form className="login-card card" onSubmit={handleSubmit} style={{ width: 560, maxWidth: '100%' }}>
        <h2 style={{ margin: 0 }}>外國籍學生基本資料表</h2>
        <p className="muted" style={{ marginTop: 0 }}>Mẫu đơn thông tin cơ bản dành cho sinh viên nước ngoài</p>
        <div className="form-grid">
          <label>
            英文姓名（與護照相符）Tên tiếng Anh (Hộ chiếu phù hợp)
            <input required value={form.originalName || ''} onChange={(e) => setField('originalName', e.target.value)} />
          </label>
          <label>
            中文姓名 Tên tiếng Trung
            <input value={form.chineseName || ''} onChange={(e) => setField('chineseName', e.target.value)} />
          </label>
          <label>
            越南姓名 Tên tiếng Việt
            <input value={form.vietnameseName || ''} onChange={(e) => setField('vietnameseName', e.target.value)} />
          </label>
          <label>
            大頭貼 Ảnh chân dung
            <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, setPhotoFile, setPhotoError)} />
            {photoError && <div className="error-text">{photoError}</div>}
          </label>
          <label>
            是否有護照 Bạn có hộ chiếu không？
            <select value={form.hasPassport} onChange={(e) => setField('hasPassport', e.target.value)}>
              <option value="">請選擇 Chọn</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>
          {form.hasPassport === 'Yes' && (
            <label>
              護照號碼 ID
              <input value={form.passportId || ''} onChange={(e) => setField('passportId', e.target.value)} />
            </label>
          )}
          {form.hasPassport === 'Yes' && (
            <label>
              護照照片 Ảnh hộ chiếu
              <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, setPassportPhotoFile, setPassportPhotoError)} />
              {passportPhotoError && <div className="error-text">{passportPhotoError}</div>}
            </label>
          )}
          <label>
            性別 Giới tính
            <select required value={form.gender} onChange={(e) => setField('gender', e.target.value)}>
              <option value="">請選擇 Chọn</option>
              <option value="男">男 Nam giới</option>
              <option value="女">女 Nữ giới</option>
            </select>
          </label>
          <label>
            出生日期 Ngày sinh
            <input type="date" value={form.birthDate || ''} onChange={(e) => setField('birthDate', e.target.value)} />
          </label>
          <label>
            國籍 Quốc tịch
            <input value={form.nationality || ''} onChange={(e) => setField('nationality', e.target.value)} />
          </label>
          <label>
            身高(cm) Chiều cao
            <input type="number" value={form.height || ''} onChange={(e) => setField('height', e.target.value)} />
          </label>
          <label>
            體重(kg) Cân nặng
            <input type="number" value={form.weight || ''} onChange={(e) => setField('weight', e.target.value)} />
          </label>
          <label>
            就讀學校 Trường học
            <input value={form.school || ''} onChange={(e) => setField('school', e.target.value)} />
          </label>
          <label>
            入學日期 Ngày đăng ký
            <input type="date" value={form.enrollDate || ''} onChange={(e) => setField('enrollDate', e.target.value)} />
          </label>
          <label>
            學制（年）Thời gian học (năm)
            <input type="number" value={form.programYears || ''} onChange={(e) => setField('programYears', e.target.value)} />
          </label>
          <label>
            科系 Khoa
            <input value={form.department || ''} onChange={(e) => setField('department', e.target.value)} />
          </label>
          <label>
            預計畢業時間 Thời gian dự kiến tốt nghiệp
            <input type="date" value={form.expectedGraduation || ''} onChange={(e) => setField('expectedGraduation', e.target.value)} />
          </label>
          <label>
            是否有華語證照 Bạn có chứng chỉ tiếng Trung Quốc không？
            <select required value={form.hasCert} onChange={(e) => setField('hasCert', e.target.value)}>
              <option value="">請選擇 Chọn</option>
              <option value="有">有 Có</option>
              <option value="已考試未領取證照">已考試未領取證照 Đã thi nhưng chưa nhận chứng chỉ</option>
              <option value="無">無 Không có</option>
            </select>
          </label>
          {(form.hasCert === '有' || form.hasCert === '已考試未領取證照') && (
            <label>
              證照類別 Loại chứng chỉ
              <select value={form.certType || ''} onChange={(e) => setField('certType', e.target.value)}>
                <option value="">請選擇 Chọn</option>
                <option value="TOCFL">華語文能力測驗 TOCFL</option>
                <option value="TOEIC">英文多益測驗 TOEIC</option>
              </select>
            </label>
          )}
          {(form.hasCert === '有' || form.hasCert === '已考試未領取證照') && (
            <label>
              等級 Trình độ
              <select value={form.certLevel || ''} onChange={(e) => setField('certLevel', e.target.value)}>
                <option value="">請選擇 Chọn</option>
                {CERT_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
          )}
          {form.hasCert === '已考試未領取證照' && (
            <label>
              證照領取日期 Ngày nhận chứng chỉ
              <input type="date" value={form.certPickupDate || ''} onChange={(e) => setField('certPickupDate', e.target.value)} />
            </label>
          )}
          {form.hasCert === '無' && (
            <label>
              預計考試日期 Ngày dự kiến thi
              <input type="date" value={form.expectedExamDate || ''} onChange={(e) => setField('expectedExamDate', e.target.value)} />
            </label>
          )}
          <label>
            工作經驗 Kinh nghiệm làm việc
            <textarea rows={4} value={form.personalExperience || ''} onChange={(e) => setField('personalExperience', e.target.value)} />
          </label>
        </div>
        {error && <div className="error-text">{error}</div>}
        <button type="submit" className="primary" disabled={busy}>{busy ? '送出中… Đang gửi…' : '送出 Gửi'}</button>
      </form>
    </div>
  );
}
