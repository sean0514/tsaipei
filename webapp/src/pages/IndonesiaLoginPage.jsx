import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// 印尼實習生系統的品牌化登入入口（/login/indonesia）：跟全系統共用的
// /login（pages/Login.jsx）邏輯完全一樣，只是外觀套用印尼系統的主題色
// (theme-indonesia) 跟品牌標題，方便把這個網址單獨發給印尼端的使用者。
// 登入成功後一樣導回「/」(CompanyPicker)，再依帳號能看到的系統/公司自然
// 顯示印尼實習生管理系統卡片，不影響既有的帳號權限/登入流程。
export default function IndonesiaLoginPage() {
  const { login, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch {
      setError('帳號或密碼錯誤 Email atau kata sandi salah');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="theme-indonesia login-wrap">
      <form className="login-card card" onSubmit={handleSubmit}>
        <h2 className="brand-mark" style={{ margin: 0, fontSize: 22 }}>
          🇮🇩 元凱貿易及人力資源有限公司
          <div className="brand-sub">印尼實習生管理系統 · Sistem Pengelolaan Peserta Magang</div>
        </h2>
        <label className="muted">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="muted">
          密碼 Kata Sandi
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="error-text">{error}</div>}
        <button type="submit" className="primary" disabled={busy}>{busy ? '登入中… Memproses…' : '登入 Masuk'}</button>
      </form>
    </div>
  );
}
