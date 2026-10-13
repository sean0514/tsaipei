import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { SYSTEMS } from '../lib/permissions';
import { useAuth } from '../auth/AuthContext';
import { useRolePermissions, useSystemProfile } from '../auth/useSystemAccess';
import { canView } from '../lib/permissions';
import { NAV_ICONS } from '../lib/navIcons';
import { companyKeyForSystem } from '../lib/companies';
import { useLanguage, t } from '../lib/i18n';

const ADMIN_ROLE = '系統管理員';

// 權限預覽：只有真正的系統管理員能切換，用 localStorage 記住選的角色
// (重新整理後還在，方便連續測試)，不會寫回 Firestore、也不影響實際登入
// 身分——側邊欄/頁面看到的畫面會照模擬的角色顯示，但 Firestore 寫入規則
// 還是看真實登入的 uid，系統管理員本來就一定能寫，所以這只是「畫面預覽」
// 工具，不是真的切換帳號權限，寫入端的權限還是要另外用該角色的帳號登入
// 測試才準。
function useViewAsRole(system, realRole) {
  const storageKey = `viewAsRole_${system}`;
  const [viewAsRole, setViewAsRole] = useState(() => {
    try { return localStorage.getItem(storageKey) || ''; } catch { return ''; }
  });
  useEffect(() => {
    try {
      if (viewAsRole) localStorage.setItem(storageKey, viewAsRole);
      else localStorage.removeItem(storageKey);
    } catch { /* 無痕視窗等情境拿不到 localStorage，純預覽功能不影響權限本身，忽略即可 */ }
  }, [storageKey, viewAsRole]);
  const effectiveRole = (realRole === ADMIN_ROLE && viewAsRole) ? viewAsRole : realRole;
  return { viewAsRole, setViewAsRole, effectiveRole };
}

// Pages that actually exist as routes so far; every other module shows in
// the nav (if the role can view it) but links to a "尚未建置" placeholder.
export const IMPLEMENTED_MODULES = {
  tsaipei: [
    'dashboard', 'unmatchedStudents', 'students', 'positions', 'matches', 'secondInterview', 'admitted', 'visaReminder',
    'internshipDocs', 'applicationProgress', 'inTaiwanVisa', 'inTaiwanCare', 'expectedArrival', 'bankAccountProgress', 'vehiclePickup', 'housing',
    'dormManagement', 'customerServicePending', 'adminPending', 'benefits', 'meetings', 'closedCases', 'foreignSubsidyApplication', 'dailyExpenseApplication', 'users', 'bonus', 'clientFeeSetup', 'internalFeeSetup', 'managerReport', 'clientBilling', 'studentBilling', 'dormProfitLoss', 'companyProfitLoss',
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
  // 越南實習生系統：複製 tsaipei 架構，分頁依 tsaipei 的分批複製進度陸續加入
  // 這裡；還沒加進來的模組側邊欄一樣看得到，但連到「尚未建置」畫面。
  vietnam: ['dashboard', 'students', 'positions', 'matches', 'secondInterview', 'admitted', 'visaReminder', 'internshipDocs', 'applicationProgress', 'users'],
};

// A permission module can cover several routes at once — each route under
// the key shares that single permission. Anything not listed here is a
// single module == single route. (tsaipei's 職缺媒合/實習在台追蹤/會計專用/
// 資料建檔 used to be set up this way too; they're now each-page-independent
// permissions, so they're not listed here anymore — see GROUP_SECTIONS below
// for their sidebar section headers, which are purely visual now.)
const GROUP_ROUTES = {
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
    { label: '實習在台追蹤', items: ['inTaiwanVisa', 'inTaiwanCare', 'expectedArrival', 'bankAccountProgress', 'vehiclePickup'] },
    { label: '會計專用', items: ['clientBilling', 'studentBilling', 'studentSelfPayHousing', 'studentMasterSheet', 'foreignPayment', 'dormProfitLoss', 'companyProfitLoss'] },
    { label: '資料建檔', items: ['clientFeeSetup', 'internalFeeSetup', 'bonus'] },
    { label: '申請表格', items: ['foreignSubsidyApplication', 'dailyExpenseApplication', 'postageFee'] },
  ],
  yujian: [
    { label: '媒合紀錄', items: ['matches', 'secondInterview', 'admitted', 'placementList'] },
    { label: '申請表格', items: ['dailyExpenseApplication', 'postageFee'] },
  ],
  vietnam: [
    { label: '職缺媒合', items: ['positions', 'matches', 'secondInterview', 'admitted', 'visaReminder'] },
    { label: '實習在台追蹤', items: ['inTaiwanVisa', 'inTaiwanCare', 'expectedArrival', 'bankAccountProgress', 'vehiclePickup'] },
    { label: '會計專用', items: ['clientBilling', 'studentBilling', 'studentSelfPayHousing', 'studentMasterSheet', 'foreignPayment', 'dormProfitLoss', 'companyProfitLoss'] },
    { label: '資料建檔', items: ['clientFeeSetup', 'internalFeeSetup', 'bonus'] },
    { label: '申請表格', items: ['foreignSubsidyApplication', 'dailyExpenseApplication', 'postageFee'] },
  ],
};

function NavItem({ system, route, label, lang }) {
  const implemented = IMPLEMENTED_MODULES[system]?.includes(route);
  const icon = NAV_ICONS[system]?.[route];
  return (
    <NavLink
      to={`/${system}/${implemented ? route : `todo/${route}`}`}
      className={({ isActive }) => (isActive ? 'active' : '')}
      style={{ paddingLeft: 28 }}
    >
      {icon && <span className="nav-icon">{icon}</span>}{t(label, lang)}{!implemented && ' (建置中)'}
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
  const { viewAsRole, setViewAsRole, effectiveRole } = useViewAsRole(system, profile?.role);
  const [lang, setLang] = useLanguage(system);
  const effectiveLang = sys?.bilingual ? lang : 'zh';

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

  const role = effectiveRole;

  return (
    <div className={`app-shell${system === 'tsaipei' ? ' theme-tsaipei' : ''}${system === 'yujian' ? ' theme-yujian' : ''}${system === 'dispatch' ? ' theme-dispatch' : ''}${system === 'vietnam' ? ' theme-vietnam' : ''}`}>
      <aside className="sidebar">
        {system === 'tsaipei' ? (
          <h1 className="brand-mark">🌸 鈞羽有限公司<br />境外實習生管理系統<div className="brand-sub">International Internship Desk</div></h1>
        ) : system === 'yujian' ? (
          <h1 className="brand-mark">🤝 聿見國際有限公司<br />外勞仲介管理系統<div className="brand-sub">Overseas Caregiver Placement</div></h1>
        ) : system === 'dispatch' ? (
          <h1 className="brand-mark">🩵 宸暐企業有限公司<br />派遣公司專用系統<div className="brand-sub">Staffing & Dispatch Desk</div></h1>
        ) : system === 'vietnam' ? (
          effectiveLang === 'vi' ? (
            <h1 className="brand-mark">🇻🇳 CÔNG TY TNHH TM & NNL NGUYÊN KHẢI<br />Hệ thống Quản lý Thực tập sinh<div className="brand-sub">Vietnam Internship Desk</div></h1>
          ) : (
            <h1 className="brand-mark">🇻🇳 元凱貿易及人力資源有限公司<br />越南實習生管理系統<div className="brand-sub">Vietnam Internship Desk</div></h1>
          )
        ) : (
          <h1>{sys.label}</h1>
        )}
        <div className="back"><Link to={backTo}>← {t('切換系統', effectiveLang)}</Link></div>
        {sys?.bilingual && (
          <div style={{ padding: '8px 16px 0' }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--sidebar-text-muted)', marginBottom: 4 }}>語言 / Ngôn ngữ</label>
            <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ width: '100%' }}>
              <option value="zh">中文</option>
              <option value="vi">Tiếng Việt</option>
            </select>
          </div>
        )}
        {profile.role === ADMIN_ROLE && (
          <div style={{ padding: '8px 16px 12px' }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--sidebar-text-muted)', marginBottom: 4 }}>{t('預覽身分（僅畫面顯示，測試用）', effectiveLang)}</label>
            <select value={viewAsRole} onChange={(e) => setViewAsRole(e.target.value)} style={{ width: '100%' }}>
              <option value="">{t('真實身分', effectiveLang)}（{ADMIN_ROLE}）</option>
              {sys.roles.filter((r) => r !== ADMIN_ROLE).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        )}
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
                    <div style={{ padding: '9px 16px 2px', fontSize: 12, color: 'var(--sidebar-text-muted)' }}>{t(section.label, effectiveLang)}</div>
                    {visibleItems.map((route) => <NavItem key={route} system={system} route={route} label={sys.modules[route]} lang={effectiveLang} />)}
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
                        <div style={{ padding: '9px 16px 2px', fontSize: 12, color: 'var(--sidebar-text-muted)' }}>{t(sub.label, effectiveLang)}</div>
                        {sub.items.map(({ route, label: subLabel }) => <NavItem key={route} system={system} route={route} label={subLabel} lang={effectiveLang} />)}
                      </div>
                    ))}
                  </div>
                );
              }
              if (group) {
                return (
                  <div key={key}>
                    <div style={{ padding: '9px 16px 2px', fontSize: 12, color: 'var(--sidebar-text-muted)' }}>{t(label, effectiveLang)}</div>
                    {group.map(({ route, label: subLabel }) => <NavItem key={route} system={system} route={route} label={subLabel} lang={effectiveLang} />)}
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
                  {icon && <span className="nav-icon">{icon}</span>}{t(label, effectiveLang)}{!implemented && ' (建置中)'}
                </NavLink>
              );
            });
          })()}
        </nav>
      </aside>
      <div className="main">
        {viewAsRole && (
          <div style={{ background: '#fff3cd', color: '#7a5c00', padding: '8px 16px', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>目前以「{viewAsRole}」身分預覽畫面——只影響畫面看得到什麼，Firestore 寫入規則仍以你的真實登入身分（{ADMIN_ROLE}）執行，不能用來測試實際寫入權限是否被擋下來。</span>
            <button onClick={() => setViewAsRole('')}>恢復管理員檢視</button>
          </div>
        )}
        <div className="topbar">
          <span className="muted">{profile.displayName || profile.email} · {profile.role}{viewAsRole && `（預覽：${viewAsRole}）`}</span>
          <button onClick={logout}>{t('登出', effectiveLang)}</button>
        </div>
        <Outlet context={{ system, role, overrides, lang: effectiveLang }} />
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
