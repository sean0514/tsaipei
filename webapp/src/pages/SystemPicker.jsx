import { Link } from 'react-router-dom';
import { SYSTEMS } from '../lib/permissions';
import { useAuth } from '../auth/AuthContext';

const SYSTEM_META = {
  tsaipei: { icon: '🌸', desc: '學生建檔、職缺媒合、簽證/居留、實習文件、在台生活、財務結算' },
  foodfactory: { icon: '🏭', desc: '原料庫存、生產管理、成品出貨、品質食安、成本分析、財務報表' },
};

export default function SystemPicker() {
  const { user, logout } = useAuth();
  return (
    <div className="picker-wrap">
      <div className="picker-topbar">
        <span className="muted">{user?.email}</span>
        <button onClick={logout}>登出</button>
      </div>
      <div className="picker-hero">
        <h1>選擇系統</h1>
        <p className="muted">選擇要進入的管理系統</p>
      </div>
      <div className="picker-grid">
        {Object.entries(SYSTEMS).map(([key, sys]) => (
          <Link key={key} to={`/${key}`} className="picker-card">
            <div className="picker-card-icon">{SYSTEM_META[key]?.icon}</div>
            <h2>{sys.label}</h2>
            <p className="muted">{SYSTEM_META[key]?.desc}</p>
            <span className="picker-card-enter">
              進入系統
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
