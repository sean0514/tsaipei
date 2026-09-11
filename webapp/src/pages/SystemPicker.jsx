import { Link } from 'react-router-dom';
import { SYSTEMS } from '../lib/permissions';
import { useAuth } from '../auth/AuthContext';

export default function SystemPicker() {
  const { logout } = useAuth();
  return (
    <div className="content">
      <div className="page-header">
        <h2>選擇系統</h2>
        <button onClick={logout}>登出</button>
      </div>
      <div className="portal-grid">
        {Object.entries(SYSTEMS).map(([key, sys]) => (
          <Link key={key} to={`/${key}`} className="portal-card card">
            <h3 style={{ marginTop: 0 }}>{sys.label}</h3>
            <p className="muted">進入系統</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
