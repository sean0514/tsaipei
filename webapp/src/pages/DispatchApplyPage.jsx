import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { PERSONAL_FIELDS } from '../systems/dispatch/JobSeekersPage';

// 公開的線上履歷填寫頁面，不需要登入。網址帶 ?ref=招募專員姓名，送出後
// 直接新增一筆 dispatch_jobSeekers，recruiter 帶入 ref 參數，讓「使用人員」
// 分享出去的專屬連結可以追蹤是誰帶來的履歷，供招募獎金統計使用。
// firestore.rules 只允許這裡用到的欄位、且 status 必須是「求職中」，其他
// 欄位（廠商、班別、黑名單、薪資等）一律由內部人員之後在「求職者資訊」補上。
export default function DispatchApplyPage() {
  const [searchParams] = useSearchParams();
  const recruiter = searchParams.get('ref') || '';
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await addDoc(collection(db, 'dispatch_jobSeekers'), {
        ...form, recruiter, status: '求職中', createdAt: serverTimestamp(),
      });
      setDone(true);
    } catch (err) {
      setError(`送出失敗：${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="theme-dispatch login-wrap">
        <div className="login-card card">
          <h2 style={{ margin: 0 }}>履歷已送出</h2>
          <p className="muted">感謝您的填寫，我們會盡快與您聯繫。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-dispatch login-wrap">
      <form className="login-card card" onSubmit={handleSubmit} style={{ width: 480, maxWidth: '100%' }}>
        <h2 style={{ margin: 0 }}>線上履歷填寫</h2>
        <div className="form-grid">
          {PERSONAL_FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              {f.options ? (
                <select value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                  {f.options.map((o) => <option key={o} value={o}>{o || '請選擇'}</option>)}
                </select>
              ) : (
                <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              )}
            </label>
          ))}
        </div>
        {error && <div className="error-text">{error}</div>}
        <button type="submit" className="primary" disabled={busy}>{busy ? '送出中…' : '送出履歷'}</button>
      </form>
    </div>
  );
}
