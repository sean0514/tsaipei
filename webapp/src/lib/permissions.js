// Mirrors the role/permission model from each system's original Apps Script
// backend (ROLES + DEFAULT_PERMISSIONS in Code.gs). Levels are 'edit' | 'view' | 'none'.
// 系統管理員 (admin) is always 'edit' on every module — enforced both here and
// in firestore.rules, never trust the stored role-permission doc for admins.

export const SYSTEMS = {
  tsaipei: {
    label: '境外實習生管理系統',
    roles: ['系統管理員', '主管', '業務人員', '服務人員', '翻譯人員', '國外供應', '行政人員', '會計人員', '宿管人員'],
    // Key order here drives the sidebar order (Layout.jsx), matching
    // NAV_STRUCTURE in apps-script/Index.html: dashboard, students, 職缺媒合
    // group, internshipDocs, applicationProgress, 實習在台追蹤 group,
    // managerReport, housing, dormManagement, meetings, then the
    // 會計專用/資料建檔 groups (both gated by the 'bonus' permission here —
    // see GROUP_ROUTES.tsaipei.bonus.subgroups in Layout.jsx), then users.
    modules: {
      dashboard: '儀表板',
      students: '學生資料',
      matching: '職缺媒合',
      internshipDocs: '實習文件追蹤',
      applicationProgress: '申辦進度追蹤',
      inTaiwanTracking: '實習在台追蹤',
      managerReport: '主管報表',
      housing: '住宿安排',
      dormManagement: '宿舍管理',
      meetings: '會議記錄',
      bonus: '會計專用 / 資料建檔',
      users: '使用人員',
    },
    defaultPermissions: {
      dashboard: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'view', 服務人員: 'view', 翻譯人員: 'view', 國外供應: 'view', 行政人員: 'view', 會計人員: 'view', 宿管人員: 'view' },
      students: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'view', 服務人員: 'edit', 翻譯人員: 'view', 國外供應: 'view', 行政人員: 'edit', 會計人員: 'view', 宿管人員: 'view' },
      matching: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 服務人員: 'view', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'view', 會計人員: 'none', 宿管人員: 'none' },
      applicationProgress: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'edit', 翻譯人員: 'view', 國外供應: 'none', 行政人員: 'edit', 會計人員: 'none', 宿管人員: 'none' },
      inTaiwanTracking: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'edit', 翻譯人員: 'view', 國外供應: 'none', 行政人員: 'edit', 會計人員: 'none', 宿管人員: 'edit' },
      internshipDocs: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'edit', 翻譯人員: 'view', 國外供應: 'none', 行政人員: 'edit', 會計人員: 'none', 宿管人員: 'none' },
      housing: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'edit', 翻譯人員: 'view', 國外供應: 'none', 行政人員: 'edit', 會計人員: 'none', 宿管人員: 'edit' },
      dormManagement: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'view', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'edit', 會計人員: 'view', 宿管人員: 'edit' },
      meetings: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 服務人員: 'edit', 翻譯人員: 'view', 國外供應: 'none', 行政人員: 'view', 會計人員: 'view', 宿管人員: 'view' },
      bonus: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'none', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'none', 會計人員: 'edit', 宿管人員: 'none' },
      users: { 系統管理員: 'edit', 主管: 'view', 業務人員: 'none', 服務人員: 'none', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'none', 會計人員: 'none', 宿管人員: 'none' },
      managerReport: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'none', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'none', 會計人員: 'none', 宿管人員: 'none' },
    },
  },
  dispatch: {
    label: '派遣公司專用系統',
    roles: ['系統管理員', '主管', '業務人員', '行政人員', '會計人員'],
    modules: {
      dashboard: '儀表板',
      users: '使用人員',
    },
    defaultPermissions: {
      dashboard: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'view', 行政人員: 'view', 會計人員: 'view' },
      users: { 系統管理員: 'edit', 主管: 'view', 業務人員: 'none', 行政人員: 'none', 會計人員: 'none' },
    },
  },
  dormMgmt: {
    label: '宿舍管理系統',
    roles: ['系統管理員', '主管', '行政人員', '會計人員'],
    modules: {
      dashboard: '儀表板',
      leases: '宿舍租賃主檔',
      users: '使用人員',
    },
    defaultPermissions: {
      dashboard: { 系統管理員: 'edit', 主管: 'edit', 行政人員: 'view', 會計人員: 'view' },
      leases: { 系統管理員: 'edit', 主管: 'edit', 行政人員: 'edit', 會計人員: 'view' },
      users: { 系統管理員: 'edit', 主管: 'view', 行政人員: 'none', 會計人員: 'none' },
    },
  },
  foodfactory: {
    label: '食品工廠管理系統',
    roles: ['系統管理員', '廠長主管', '倉管人員', '產線人員', '品管人員', '業務出貨人員', '會計人員'],
    modules: {
      dashboard: '儀表板',
      inventory: '原料與庫存',
      production: '生產管理',
      shipping: '成品與出貨',
      billing: '客戶請款明細',
      qc: '品質/食安',
      cost: '成本分析',
      pettyCash: '零用金對帳',
      incomeStatement: '損益表',
      users: '使用人員',
    },
    defaultPermissions: buildFoodFactoryDefaults(),
  },
};

function buildFoodFactoryDefaults() {
  const roles = ['系統管理員', '廠長主管', '倉管人員', '產線人員', '品管人員', '業務出貨人員', '會計人員'];
  const modules = ['dashboard', 'inventory', 'production', 'shipping', 'billing', 'qc', 'cost', 'pettyCash', 'incomeStatement', 'users'];
  const out = {};
  modules.forEach((m) => {
    out[m] = {};
    roles.forEach((r) => {
      let level = 'view';
      if (r === '倉管人員' && m === 'inventory') level = 'edit';
      if (r === '產線人員' && m === 'production') level = 'edit';
      if (r === '業務出貨人員' && (m === 'shipping' || m === 'billing')) level = 'edit';
      if (r === '品管人員' && m === 'qc') level = 'edit';
      if (r === '會計人員' && (m === 'cost' || m === 'pettyCash' || m === 'incomeStatement' || m === 'billing')) level = 'edit';
      if (r === '廠長主管') level = 'view';
      if (m === 'users' && r !== '系統管理員') level = 'none';
      out[m][r] = level;
    });
  });
  return out;
}

const LEVEL_RANK = { none: 0, view: 1, edit: 2 };

export function permissionLevel(system, module, role, rolePermissionsOverride) {
  if (role === '系統管理員') return 'edit';
  const override = rolePermissionsOverride?.[module]?.[role];
  if (override) return override;
  return SYSTEMS[system]?.defaultPermissions?.[module]?.[role] || 'none';
}

export function canView(system, module, role, rolePermissionsOverride) {
  return LEVEL_RANK[permissionLevel(system, module, role, rolePermissionsOverride)] >= LEVEL_RANK.view;
}

export function canEdit(system, module, role, rolePermissionsOverride) {
  return LEVEL_RANK[permissionLevel(system, module, role, rolePermissionsOverride)] >= LEVEL_RANK.edit;
}
