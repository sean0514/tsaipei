import { Link, useParams } from 'react-router-dom';
import { SYSTEMS, canView } from '../lib/permissions';
import { COMPANIES } from '../lib/companies';
import { useAuth } from '../auth/AuthContext';
import { useSystemProfile, useRolePermissions } from '../auth/useSystemAccess';

const SYSTEM_META = {
  tsaipei: { icon: '🌸', desc: '學生建檔、職缺媒合、簽證/居留、實習文件、在台生活、財務結算' },
  foodfactory: { icon: '🏭', desc: '原料庫存、生產管理、成品出貨、品質食安、成本分析、財務報表' },
  dispatch: { icon: '🧑‍💼', desc: '目前僅有基本骨架，業務功能陸續建置中' },
  dormMgmt: { icon: '🏠', desc: '目前僅有基本骨架，業務功能陸續建置中' },
  yujian: { icon: '🏠', desc: '看護/家事人員資料、雇主家庭/需求單、媒合紀錄，其他功能陸續建置中' },
};

// 公司主頁：列出該公司底下有哪些系統可以選。只有系統管理員在「使用人員」頁面
// 把帳號加進某個系統，這裡才會顯示那張卡片；只被加進一個系統的人員，選單就
// 只會看到那一個。目前只有 tsaipei/foodfactory 兩個系統存在，其餘公司（如
// 宸暐企業有限公司）底下系統清單是空的，顯示「尚未建置」。
export default function CompanyHomePage() {
  const { companyKey } = useParams();
  const { user, logout } = useAuth();
  const company = COMPANIES[companyKey];

  const tsaipeiProfile = useSystemProfile('tsaipei');
  const foodfactoryProfile = useSystemProfile('foodfactory');
  const dispatchProfile = useSystemProfile('dispatch');
  const dormMgmtProfile = useSystemProfile('dormMgmt');
  const yujianProfile = useSystemProfile('yujian');
  const tsaipeiOverrides = useRolePermissions('tsaipei');
  const foodfactoryOverrides = useRolePermissions('foodfactory');
  const dispatchOverrides = useRolePermissions('dispatch');
  const dormMgmtOverrides = useRolePermissions('dormMgmt');
  const yujianOverrides = useRolePermissions('yujian');
  const profiles = { tsaipei: tsaipeiProfile, foodfactory: foodfactoryProfile, dispatch: dispatchProfile, dormMgmt: dormMgmtProfile, yujian: yujianProfile };
  const overrides = { tsaipei: tsaipeiOverrides, foodfactory: foodfactoryOverrides, dispatch: dispatchOverrides, dormMgmt: dormMgmtOverrides, yujian: yujianOverrides };

  if (!company) return <div className="content">找不到這間公司。<Link to="/">回選擇公司</Link></div>;

  const companySystemKeys = company.systems;
  const loading = companySystemKeys.some((key) => profiles[key] === undefined);
  const visibleSystems = Object.entries(SYSTEMS).filter(([key]) => companySystemKeys.includes(key) && profiles[key]);

  return (
    <div className="picker-wrap">
      <div className="picker-topbar">
        <span className="muted">{user?.email}</span>
        <button onClick={logout}>登出</button>
      </div>
      <div className="picker-hero">
        <div className="picker-back"><Link to="/">← 切換公司</Link></div>
        <h1>{company.label}</h1>
        <p className="muted">選擇要進入的管理系統</p>
      </div>
      {companySystemKeys.length === 0 ? (
        <p className="muted">這間公司的系統尚未建置，敬請期待。</p>
      ) : loading ? <p className="muted">載入中…</p> : visibleSystems.length === 0 ? (
        <p className="muted">你的帳號還沒有被加到這間公司底下的任何系統，請聯絡系統管理員在「使用人員」頁面新增你的帳號與角色。</p>
      ) : (
      <div className="picker-grid">
        {visibleSystems.map(([key, sys]) => {
          const role = profiles[key]?.role;
          const showManageUsers = role && canView(key, 'users', role, overrides[key]);
          return (
            <div key={key} className="picker-card">
              <Link to={`/${key}`} className="picker-card-link">
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
              {showManageUsers && <Link to={`/${key}/users`} className="picker-card-manage-users">管理使用人員</Link>}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
