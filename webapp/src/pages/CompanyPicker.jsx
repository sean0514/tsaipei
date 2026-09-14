import { Link } from 'react-router-dom';
import { COMPANIES } from '../lib/companies';
import { useAuth } from '../auth/AuthContext';

// 選擇系統的第一層畫面：先選公司，再進到該公司底下的系統列表
// （見 CompanyHomePage.jsx）。公司本身不是權限管控的對象，三張卡片一律顯示。
export default function CompanyPicker() {
  const { user, logout } = useAuth();
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
      <div className="picker-grid">
        {Object.entries(COMPANIES).map(([key, company]) => (
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
    </div>
  );
}
