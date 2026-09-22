import { Link } from 'react-router-dom';
import { COMPANIES } from '../lib/companies';
import { useAuth } from '../auth/AuthContext';
import { useSystemProfile } from '../auth/useSystemAccess';

// 選擇系統的第一層畫面：先選公司，再進到該公司底下的系統列表
// （見 CompanyHomePage.jsx）。公司卡片本身依「底下有沒有任何一個系統這個
// 帳號能存取」過濾——完全沒有系統的公司（尚未建置任何系統）維持顯示，
// 沒必要因為「還沒有系統」就先擋掉。
export default function CompanyPicker() {
  const { user, logout } = useAuth();
  const profiles = {
    tsaipei: useSystemProfile('tsaipei'),
    foodfactory: useSystemProfile('foodfactory'),
    dispatch: useSystemProfile('dispatch'),
    dormMgmt: useSystemProfile('dormMgmt'),
    yujian: useSystemProfile('yujian'),
  };
  const loading = Object.values(profiles).some((p) => p === undefined);
  const visibleCompanies = Object.entries(COMPANIES).filter(([, company]) =>
    company.systems.length === 0 || company.systems.some((sysKey) => profiles[sysKey])
  );

  return (
    <div className="picker-wrap">
      <div className="picker-topbar">
        <span className="muted">{user?.email}</span>
        <button onClick={logout}>登出</button>
      </div>
      <div className="picker-hero">
        <h1>選擇公司</h1>
        <p className="muted">選擇要進入的公司</p>
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        <div className="picker-grid">
          {visibleCompanies.map(([key, company]) => (
            <Link key={key} to={`/company/${key}`} className="picker-card picker-card-link">
              <div className="picker-card-icon">{company.icon}</div>
              <h2>{company.label}</h2>
              <span className="picker-card-enter">
                進入公司
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
