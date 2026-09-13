import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { SYSTEMS } from '../lib/permissions';
import { useAuth } from '../auth/AuthContext';
import { useRolePermissions, useSystemProfile } from '../auth/useSystemAccess';
import { canView } from '../lib/permissions';
import { NAV_ICONS } from '../lib/navIcons';

// Pages that actually exist as routes so far; every other module shows in
// the nav (if the role can view it) but links to a "尚未建置" placeholder.
export const IMPLEMENTED_MODULES = {
  tsaipei: [
    'dashboard', 'students', 'positions', 'matches', 'secondInterview', 'admitted',
    'internshipDocs', 'applicationProgress', 'inTaiwanVisa', 'inTaiwanCare', 'expectedArrival', 'housing',
    'dormManagement', 'meetings', 'users', 'bonus', 'clientFeeSetup', 'internalFeeSetup', 'managerReport', 'clientBilling',
    'studentSelfPayHousing', 'studentMasterSheet',
  ],
  foodfactory: [
    'inventory', 'suppliers', 'purchases', 'products', 'customers', 'production', 'shipments',
    'qcTemplates', 'qcRecords', 'cost', 'pettyCash', 'incomeStatement', 'partners', 'billing', 'users',
  ],
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
      { route: 'expectedArrival', label: '預計入台/離台' },
    ],
    // 跟原本 NAV_STRUCTURE 一樣分成「會計專用」「資料建檔」兩個子群組顯示，
    // 雖然這裡兩組都是同一個 'bonus' 權限模組把關（跟原本 pageModuleKey()
    // 把這幾頁都對到 'bonus' 一致）。
    bonus: {
      subgroups: [
        { label: '會計專用', items: [
          { route: 'clientBilling', label: '客戶請款計算' },
          { route: 'studentSelfPayHousing', label: '學生自付宿舍' },
          { route: 'studentMasterSheet', label: '學生資料總檔' },
        ] },
        { label: '資料建檔', items: [
          { route: 'clientFeeSetup', label: '客戶費用建檔' },
          { route: 'internalFeeSetup', label: '內部費用建檔' },
          { route: 'bonus', label: '內部獎金計算' },
        ] },
      ],
    },
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
    qc: [
      { route: 'qcTemplates', label: '檢驗範本' },
      { route: 'qcRecords', label: '檢驗紀錄' },
    ],
    incomeStatement: [
      { route: 'incomeStatement', label: '損益表' },
      { route: 'partners', label: '合夥分潤' },
    ],
  },
};

function NavItem({ system, route, label }) {
  const implemented = IMPLEMENTED_MODULES[system]?.includes(route);
  const icon = NAV_ICONS[system]?.[route];
  return (
    <NavLink
      to={`/${system}/${implemented ? route : `todo/${route}`}`}
      className={({ isActive }) => (isActive ? 'active' : '')}
      style={{ paddingLeft: 28 }}
    >
      {icon && <span className="nav-icon">{icon}</span>}{label}{!implemented && ' (建置中)'}
    </NavLink>
  );
}

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
    <div className={`app-shell${system === 'tsaipei' ? ' theme-tsaipei' : ''}`}>
      <aside className="sidebar">
        {system === 'tsaipei' ? (
          <h1 className="brand-mark">🌸 鈞羽有限公司<br />境外實習生管理系統<div className="brand-sub">International Internship Desk</div></h1>
        ) : (
          <h1>{sys.label}</h1>
        )}
        <div className="back"><Link to="/">← 切換系統</Link></div>
        <nav>
          {Object.entries(sys.modules).map(([key, label]) => {
            const visible = canView(system, key, role, overrides);
            if (!visible) return null;
            const group = GROUP_ROUTES[system]?.[key];
            if (group?.subgroups) {
              return (
                <div key={key}>
                  {group.subgroups.map((sub) => (
                    <div key={sub.label}>
                      <div style={{ padding: '9px 16px 2px', fontSize: 12, color: 'var(--sidebar-text-muted)' }}>{sub.label}</div>
                      {sub.items.map(({ route, label: subLabel }) => <NavItem key={route} system={system} route={route} label={subLabel} />)}
                    </div>
                  ))}
                </div>
              );
            }
            if (group) {
              return (
                <div key={key}>
                  <div style={{ padding: '9px 16px 2px', fontSize: 12, color: 'var(--sidebar-text-muted)' }}>{label}</div>
                  {group.map(({ route, label: subLabel }) => <NavItem key={route} system={system} route={route} label={subLabel} />)}
                </div>
              );
            }
            const implemented = IMPLEMENTED_MODULES[system]?.includes(key);
            const icon = NAV_ICONS[system]?.[key];
            return (
              <NavLink
                key={key}
                to={`/${system}/${implemented ? key : `todo/${key}`}`}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                {icon && <span className="nav-icon">{icon}</span>}{label}{!implemented && ' (建置中)'}
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
