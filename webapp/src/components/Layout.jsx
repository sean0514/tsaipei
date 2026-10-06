import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { SYSTEMS } from '../lib/permissions';
import { useAuth } from '../auth/AuthContext';
import { useRolePermissions, useSystemProfile } from '../auth/useSystemAccess';
import { canView } from '../lib/permissions';
import { NAV_ICONS } from '../lib/navIcons';
import { companyKeyForSystem } from '../lib/companies';

// Pages that actually exist as routes so far; every other module shows in
// the nav (if the role can view it) but links to a "尚未建置" placeholder.
export const IMPLEMENTED_MODULES = {
  tsaipei: [
    'dashboard', 'students', 'positions', 'matches', 'secondInterview', 'admitted', 'visaReminder',
    'internshipDocs', 'applicationProgress', 'inTaiwanVisa', 'inTaiwanCare', 'expectedArrival', 'bankAccountProgress', 'housing',
    'dormManagement', 'customerServicePending', 'benefits', 'meetings', 'closedCases', 'foreignSubsidyApplication', 'dailyExpenseApplication', 'users', 'bonus', 'clientFeeSetup', 'internalFeeSetup', 'managerReport', 'clientBilling',
    'studentSelfPayHousing', 'studentMasterSheet', 'foreignPayment', 'postageFee',
  ],
  foodfactory: [
    'inventory', 'stock', 'suppliers', 'purchases', 'products', 'customers', 'production', 'shipments',
    'qcTemplates', 'qcRecords', 'cost', 'pettyCash', 'incomeStatement', 'partners', 'billing', 'history', 'users',
  ],
  dispatch: [
    'dashboard', 'jobSeekers', 'interviews', 'employmentStatus', 'managerReport', 'meetings',
    'dailyExpenseApplication', 'cashPaymentList', 'salaryChange', 'clientBilling', 'employeeMasterSheet', 'clients', 'blacklist', 'clientFeeSetup', 'internalFeeSetup', 'bonus', 'referralBonusRate', 'referralBonus', 'users',
  ],
  dormMgmt: ['dashboard', 'leases', 'remittance', 'users'],
  yujian: [
    'dashboard', 'workers', 'employers', 'matches', 'secondInterview', 'admitted', 'placementList',
    'applicationProgress', 'expectedArrival', 'arrivedList', 'arrivedSummary', 'closedCases', 'meetings', 'dailyExpenseApplication', 'postageFee', 'users',
  ],
};

// A permission module can cover several routes at once — each route under
// the key shares that single permission. Anything not listed here is a
// single module == single route. (tsaipei's 職缺媒合/實習在台追蹤/會計專用/
// 資料建檔 used to be set up this way too; they're now each-page-independent
// permissions, so they're not listed here anymore — see GROUP_SECTIONS below
// for their sidebar section headers, which are purely visual now.)
const GROUP_ROUTES = {
  tsaipei: {
    applicationForms: [
      { route: 'foreignSubsidyApplication', label: '國外補助申請' },
      { route: 'dailyExpenseApplication', label: '日常支出申請' },
      { route: 'postageFee', label: '郵資費用紀錄' },
    ],
  },
  foodfactory: {
    inventory: [
      { route: 'inventory', label: '原料主檔' },
      { route: 'stock', label: '庫存' },
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
  dispatch: {
    applicationForms: [
      { route: 'dailyExpenseApplication', label: '日常支出申請' },
      { route: 'cashPaymentList', label: '領現名單' },
      { route: 'salaryChange', label: '薪資異動' },
    ],
    bonus: {
      subgroups: [
        { label: '會計專用', items: [
          { route: 'clientBilling', label: '客戶請款計算' },
          { route: 'employeeMasterSheet', label: '員工資料總檔' },
        ] },
        { label: '資料建檔', items: [
          { route: 'clients', label: '客戶資訊' },
          { route: 'blacklist', label: '黑名單' },
          { route: 'clientFeeSetup', label: '客戶費用建檔' },
          { route: 'internalFeeSetup', label: '內部費用建檔' },
          { route: 'bonus', label: '內部獎金計算' },
          { route: 'referralBonusRate', label: '推薦獎金設定' },
          { route: 'referralBonus', label: '招募獎金統計' },
        ] },
      ],
    },
  },
};

// 純視覺分組：只是讓側邊欄還是分組顯示標題，跟 GROUP_ROUTES 不一樣的地方是
// 這裡每個項目的權限都各自独立查自己的 canView，不是整組共用一個權限鍵。
const GROUP_SECTIONS = {
  tsaipei: [
    { label: '職缺媒合', items: ['positions', 'matches', 'secondInterview', 'admitted', 'visaReminder'] },
    { label: '實習在台追蹤', items: ['inTaiwanVisa', 'inTaiwanCare', 'expectedArrival', 'bankAccountProgress'] },
    { label: '會計專用', items: ['clientBilling', 'studentSelfPayHousing', 'studentMasterSheet', 'foreignPayment'] },
    { label: '資料建檔', items: ['clientFeeSetup', 'internalFeeSetup', 'bonus'] },
  ],
  yujian: [
    { label: '媒合紀錄', items: ['matches', 'secondInterview', 'admitted', 'placementList'] },
    { label: '申請表格', items: ['dailyExpenseApplication', 'postageFee'] },
  ],
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
  const companyKey = companyKeyForSystem(system);
  const backTo = companyKey ? `/company/${companyKey}` : '/';

  if (!sys) return <div className="content">找不到這個系統</div>;
  if (profile === undefined) return <div className="content">載入中…</div>;
  if (profile === null) {
    return (
      <div className="content">
        <p>你的帳號還沒有被加到「{sys.label}」，請聯絡系統管理員在「使用人員」頁面新增你的帳號與角色。</p>
        <Link to={backTo}>回系統選擇</Link>
      </div>
    );
  }

  const role = profile.role;

  return (
    <div className={`app-shell${system === 'tsaipei' ? ' theme-tsaipei' : ''}${system === 'yujian' ? ' theme-yujian' : ''}${system === 'dispatch' ? ' theme-dispatch' : ''}`}>
      <aside className="sidebar">
        {system === 'tsaipei' ? (
          <h1 className="brand-mark">🌸 鈞羽有限公司<br />境外實習生管理系統<div className="brand-sub">International Internship Desk</div></h1>
        ) : system === 'yujian' ? (
          <h1 className="brand-mark">🤝 聿見國際有限公司<br />外勞仲介管理系統<div className="brand-sub">Overseas Caregiver Placement</div></h1>
        ) : system === 'dispatch' ? (
          <h1 className="brand-mark">🩵 宸暐企業有限公司<br />派遣公司專用系統<div className="brand-sub">Staffing & Dispatch Desk</div></h1>
        ) : (
          <h1>{sys.label}</h1>
        )}
        <div className="back"><Link to={backTo}>← 切換系統</Link></div>
        <nav>
          {(() => {
            const renderedSections = new Set();
            return Object.entries(sys.modules).map(([key, label]) => {
              const section = GROUP_SECTIONS[system]?.find((s) => s.items.includes(key));
              if (section) {
                if (renderedSections.has(section)) return null;
                renderedSections.add(section);
                const visibleItems = section.items.filter((route) => canView(system, route, role, overrides));
                if (visibleItems.length === 0) return null;
                return (
                  <div key={section.label}>
                    <div style={{ padding: '9px 16px 2px', fontSize: 12, color: 'var(--sidebar-text-muted)' }}>{section.label}</div>
                    {visibleItems.map((route) => <NavItem key={route} system={system} route={route} label={sys.modules[route]} />)}
                  </div>
                );
              }
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
            });
          })()}
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
