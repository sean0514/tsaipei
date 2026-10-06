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
    // 會計專用/資料建檔 group, then users.
    // 職缺媒合/實習在台追蹤/會計專用/資料建檔這幾組原本共用一個權限模組，
    // 依需求改成每個分頁各自独立設定權限；側邊欄的分組標題還是用
    // GROUP_SECTIONS（純視覺分組，見 Layout.jsx）顯示，不影響這裡的權限粒度。
    modules: {
      dashboard: '儀表板',
      students: '學生資料',
      positions: '實習單位',
      matches: '媒合紀錄',
      secondInterview: '二面進度',
      admitted: '錄取名單',
      visaReminder: '辦理簽證提醒',
      internshipDocs: '實習文件追蹤',
      applicationProgress: '申辦進度追蹤',
      inTaiwanVisa: '在台簽證追蹤',
      inTaiwanCare: '在台關懷紀錄',
      expectedArrival: '預計入台/離台',
      bankAccountProgress: '開戶進度追蹤',
      managerReport: '主管報表',
      housing: '住宿安排',
      dormManagement: '宿舍管理',
      benefits: '實習單位福利',
      meetings: '會議記錄',
      closedCases: '已結案名單',
      applicationForms: '申請表格',
      clientBilling: '客戶請款計算',
      studentSelfPayHousing: '學生自付宿舍',
      studentMasterSheet: '學生資料總檔',
      foreignPayment: '國外付款紀錄',
      clientFeeSetup: '客戶費用建檔',
      internalFeeSetup: '內部費用建檔',
      bonus: '內部獎金計算',
      users: '使用人員',
    },
    defaultPermissions: {
      dashboard: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'view', 服務人員: 'view', 翻譯人員: 'view', 國外供應: 'view', 行政人員: 'view', 會計人員: 'view', 宿管人員: 'view' },
      students: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'view', 服務人員: 'edit', 翻譯人員: 'view', 國外供應: 'view', 行政人員: 'edit', 會計人員: 'view', 宿管人員: 'view' },
      positions: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 服務人員: 'view', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'view', 會計人員: 'none', 宿管人員: 'none' },
      matches: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 服務人員: 'view', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'view', 會計人員: 'none', 宿管人員: 'none' },
      secondInterview: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 服務人員: 'view', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'view', 會計人員: 'none', 宿管人員: 'none' },
      admitted: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 服務人員: 'view', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'view', 會計人員: 'none', 宿管人員: 'none' },
      visaReminder: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 服務人員: 'view', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'view', 會計人員: 'none', 宿管人員: 'none' },
      applicationProgress: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'edit', 翻譯人員: 'view', 國外供應: 'none', 行政人員: 'edit', 會計人員: 'none', 宿管人員: 'none' },
      inTaiwanVisa: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'edit', 翻譯人員: 'view', 國外供應: 'none', 行政人員: 'edit', 會計人員: 'none', 宿管人員: 'edit' },
      inTaiwanCare: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'edit', 翻譯人員: 'view', 國外供應: 'none', 行政人員: 'edit', 會計人員: 'none', 宿管人員: 'edit' },
      expectedArrival: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'edit', 翻譯人員: 'view', 國外供應: 'none', 行政人員: 'edit', 會計人員: 'none', 宿管人員: 'edit' },
      bankAccountProgress: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'edit', 翻譯人員: 'view', 國外供應: 'none', 行政人員: 'edit', 會計人員: 'none', 宿管人員: 'edit' },
      internshipDocs: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'edit', 翻譯人員: 'view', 國外供應: 'none', 行政人員: 'edit', 會計人員: 'none', 宿管人員: 'none' },
      housing: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'edit', 翻譯人員: 'view', 國外供應: 'none', 行政人員: 'edit', 會計人員: 'none', 宿管人員: 'edit' },
      dormManagement: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'view', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'edit', 會計人員: 'view', 宿管人員: 'edit' },
      benefits: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'view', 服務人員: 'view', 翻譯人員: 'view', 國外供應: 'none', 行政人員: 'view', 會計人員: 'none', 宿管人員: 'none' },
      meetings: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 服務人員: 'edit', 翻譯人員: 'view', 國外供應: 'none', 行政人員: 'view', 會計人員: 'view', 宿管人員: 'view' },
      closedCases: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 服務人員: 'edit', 翻譯人員: 'view', 國外供應: 'none', 行政人員: 'edit', 會計人員: 'none', 宿管人員: 'none' },
      applicationForms: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 服務人員: 'edit', 翻譯人員: 'view', 國外供應: 'none', 行政人員: 'edit', 會計人員: 'edit', 宿管人員: 'none' },
      clientBilling: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'none', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'none', 會計人員: 'edit', 宿管人員: 'none' },
      studentSelfPayHousing: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'none', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'none', 會計人員: 'edit', 宿管人員: 'none' },
      studentMasterSheet: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'none', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'none', 會計人員: 'edit', 宿管人員: 'none' },
      foreignPayment: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'none', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'none', 會計人員: 'edit', 宿管人員: 'none' },
      clientFeeSetup: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'none', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'none', 會計人員: 'edit', 宿管人員: 'none' },
      internalFeeSetup: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'none', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'none', 會計人員: 'edit', 宿管人員: 'none' },
      bonus: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'none', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'none', 會計人員: 'edit', 宿管人員: 'none' },
      users: { 系統管理員: 'edit', 主管: 'view', 業務人員: 'none', 服務人員: 'none', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'none', 會計人員: 'none', 宿管人員: 'none' },
      managerReport: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 服務人員: 'none', 翻譯人員: 'none', 國外供應: 'none', 行政人員: 'none', 會計人員: 'none', 宿管人員: 'none' },
    },
  },
  dispatch: {
    label: '宸暐企業\n派遣公司專用系統',
    roles: ['系統管理員', '主管', '業務人員', '行政人員', '會計人員'],
    // 比照鈞羽 tsaipei 系統的模式建置：儀表板、求職者資訊、面試概況、
    // 在職/離職概況、主管報表、會議記錄、申請表格（日常支出申請）、
    // 會計專用/資料建檔（都掛在 'bonus' 權限下，跟 tsaipei 一樣）、使用人員。
    modules: {
      dashboard: '儀表板',
      jobSeekers: '求職者資訊',
      interviews: '面試概況',
      employmentStatus: '在職/離職概況',
      managerReport: '主管報表',
      meetings: '會議記錄',
      applicationForms: '申請表格',
      bonus: '會計專用 / 資料建檔',
      users: '使用人員',
    },
    defaultPermissions: {
      dashboard: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'view', 行政人員: 'view', 會計人員: 'view' },
      jobSeekers: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 行政人員: 'edit', 會計人員: 'view' },
      interviews: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 行政人員: 'view', 會計人員: 'none' },
      employmentStatus: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'view', 行政人員: 'edit', 會計人員: 'view' },
      managerReport: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 行政人員: 'none', 會計人員: 'none' },
      meetings: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 行政人員: 'view', 會計人員: 'view' },
      applicationForms: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 行政人員: 'edit', 會計人員: 'edit' },
      bonus: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 行政人員: 'none', 會計人員: 'edit' },
      users: { 系統管理員: 'edit', 主管: 'view', 業務人員: 'none', 行政人員: 'none', 會計人員: 'none' },
    },
  },
  yujian: {
    label: '外勞仲介管理系統',
    roles: ['系統管理員', '主管', '業務人員', '行政人員'],
    // 媒合紀錄/二面進度/錄取名單/安置中名單、日常支出申請/郵資費用紀錄，
    // 原本各自掛在 'matching'/'applicationForms' 共用權限下，現在改成每個
    // 分頁各自独立設定權限（側邊欄的分組標題改用 Layout.jsx 的 GROUP_SECTIONS
    // 純視覺分組維持，不影響權限本身）。
    modules: {
      dashboard: '儀表板',
      workers: '看護/家事人員資料',
      employers: '雇主家庭/需求單',
      matches: '媒合紀錄',
      secondInterview: '二面進度',
      admitted: '錄取名單',
      placementList: '安置中名單',
      applicationProgress: '申辦進度追蹤',
      expectedArrival: '預計入台名單',
      arrivedList: '已入台名單',
      arrivedSummary: '下載總表',
      closedCases: '已結案名單',
      meetings: '會議記錄',
      dailyExpenseApplication: '日常支出申請',
      postageFee: '郵資費用紀錄',
      users: '使用人員',
    },
    defaultPermissions: {
      dashboard: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'view', 行政人員: 'view' },
      workers: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 行政人員: 'edit' },
      employers: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 行政人員: 'edit' },
      matches: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 行政人員: 'view' },
      secondInterview: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 行政人員: 'view' },
      admitted: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 行政人員: 'view' },
      placementList: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 行政人員: 'view' },
      applicationProgress: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 行政人員: 'edit' },
      expectedArrival: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'none', 行政人員: 'edit' },
      arrivedList: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'view', 行政人員: 'edit' },
      arrivedSummary: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'view', 行政人員: 'edit' },
      closedCases: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 行政人員: 'view' },
      meetings: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 行政人員: 'view' },
      dailyExpenseApplication: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 行政人員: 'edit' },
      postageFee: { 系統管理員: 'edit', 主管: 'edit', 業務人員: 'edit', 行政人員: 'edit' },
      users: { 系統管理員: 'edit', 主管: 'view', 業務人員: 'none', 行政人員: 'none' },
    },
  },
  dormMgmt: {
    label: '宿舍管理系統',
    roles: ['系統管理員', '主管', '行政人員', '會計人員'],
    modules: {
      dashboard: '儀表板',
      leases: '宿舍租賃主檔',
      remittance: '宿舍匯款',
      users: '使用人員',
    },
    defaultPermissions: {
      dashboard: { 系統管理員: 'edit', 主管: 'edit', 行政人員: 'view', 會計人員: 'view' },
      leases: { 系統管理員: 'edit', 主管: 'edit', 行政人員: 'edit', 會計人員: 'view' },
      remittance: { 系統管理員: 'edit', 主管: 'edit', 行政人員: 'view', 會計人員: 'edit' },
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
      history: '歷史資料',
      users: '使用人員',
    },
    defaultPermissions: buildFoodFactoryDefaults(),
  },
};

function buildFoodFactoryDefaults() {
  const roles = ['系統管理員', '廠長主管', '倉管人員', '產線人員', '品管人員', '業務出貨人員', '會計人員'];
  const modules = ['dashboard', 'inventory', 'production', 'shipping', 'billing', 'qc', 'cost', 'pettyCash', 'incomeStatement', 'history', 'users'];
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
