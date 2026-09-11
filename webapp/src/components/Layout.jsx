import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { SYSTEMS } from '../lib/permissions';
import { useAuth } from '../auth/AuthContext';
import { useRolePermissions, useSystemProfile } from '../auth/useSystemAccess';
import { canView } from '../lib/permissions';

// Pages that actually exist as routes so far; every other module shows in
// the nav (if the role can view it) but links to a "尚未建置" placeholder.
export const IMPLEMENTED_MODULES = {
  tsaipei: [
    'dashboard', 'students', 'positions', 'matches', 'secondInterview', 'admitted',
    'internshipDocs', 'applicationProgress', 'inTaiwanVisa', 'inTaiwanCare', 'housing',
    'dormManagement', 'meetings', 'users', 'bonus', 'clientFeeSetup', 'internalFeeSetup', 'managerReport',
  ],
  foodfactory: ['inventory', 'suppliers', 'purchases', 'products', 'customers', 'production', 'shipments', 'users'],
};

// A permission module can cover several routes at once (matches the
// original app's single 'matching' permission module governing
// 實習單位/媒合紀錄/二面進度/錄取名單 together). Anything not listed here is
// a single module == single route.
const GROUP_ROUTES = {
  tsaipei: {
    matching: [
      { route: 'positions', label: '實習單位' },
      { route: 'matches', label: '媒合紀錄' },
      { route: 'secondInterview', label: '二面進度' },
      { route: 'admitted', label: '錄取名單' },
    ],
    inTaiwanTracking: [
      { route: 'inTaiwanVisa', label: '在台簽證追蹤' },
      { route: 'inTaiwanCare', label: '在台關懷紀錄' },
    ],
    bonus: [
      { route: 'bonus', label: '內部獎金計算' },
      { route: 'clientFeeSetup', label: '客戶費用建檔' },
      { route: 'internalFeeSetup', label: '內部費用建檔' },
    ],
  },
  foodfactory: {
    inventory: [
      { route: 'inventory', label: '原料主檔' },
      { route: 'suppliers', label: '供應商' },
      { route: 'purchases', label: '進貨單' },
    ],
    shipping: [
      { route: 'products', label: '成品主檔' },
      { route: 'customers', label: '客戶主檔' },
      { route: 'shipments', label: '出貨單' },
    ],
  },
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
            const group = GROUP_ROUTES[system]?.[key];
            if (group) {
              return (
                <div key={key}>
                  <div style={{ padding: '9px 16px 2px', fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
                  {group.map(({ route, label: subLabel }) => {
                    const implemented = IMPLEMENTED_MODULES[system]?.includes(route);
                    return (
                      <NavLink
                        key={route}
                        to={`/${system}/${implemented ? route : `todo/${route}`}`}
                        className={({ isActive }) => (isActive ? 'active' : '')}
                        style={{ paddingLeft: 28 }}
                      >
                        {subLabel}{!implemented && ' (建置中)'}
                      </NavLink>
                    );
                  })}
                </div>
              );
            }
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
