import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { SYSTEMS } from '../lib/permissions';
import { useAuth } from '../auth/AuthContext';
import { useRolePermissions, useSystemProfile } from '../auth/useSystemAccess';
import { canView } from '../lib/permissions';

// Pages that actually exist as routes so far; every other module shows in
// the nav (if the role can view it) but links to a "尚未建置" placeholder.
export const IMPLEMENTED_MODULES = {
  tsaipei: ['students'],
  foodfactory: ['inventory'],
};

export default function Layout() {
  const { system } = useParams();
  const { logout } = useAuth();
  const sys = SYSTEMS[system];
  const profile = useSystemProfile(system);
  const overrides = useRolePermissions(system);

  if (!sys) return <div className="content">找不到這個系統</div>;
  if (profile === undefined) return <div className="content">載入中…</div>;
  if (profile === null) {
    return (
      <div className="content">
        <p>你的帳號還沒有被加到「{sys.label}」，請聯絡系統管理員在「使用人員」頁面新增你的帳號與角色。</p>
        <Link to="/">回系統選擇</Link>
      </div>
    );
  }

  const role = profile.role;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>{sys.label}</h1>
        <div className="back"><Link to="/">← 切換系統</Link></div>
        <nav>
          {Object.entries(sys.modules).map(([key, label]) => {
            const visible = canView(system, key, role, overrides);
            if (!visible) return null;
            const implemented = IMPLEMENTED_MODULES[system]?.includes(key);
            return (
              <NavLink
                key={key}
                to={`/${system}/${implemented ? key : `todo/${key}`}`}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                {label}{!implemented && ' (建置中)'}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <div className="main">
        <div className="topbar">
          <span className="muted">{profile.displayName || profile.email} · {role}</span>
          <button onClick={logout}>登出</button>
        </div>
        <Outlet context={{ system, role, overrides }} />
      </div>
    </div>
  );
}

export function TodoModule() {
  const { module } = useParamsModule();
  return <div className="content"><p className="muted">「{module}」模組尚未建置。</p></div>;
}

function useParamsModule() {
  const { module } = useParams();
  return { module };
}
