// 公司 → 底下系統的分組，純粹是選擇系統畫面的一層導覽，不影響路由（/tsaipei、
// /foodfactory 維持不變）也不影響 Firestore collection 命名。
export const COMPANIES = {
  junyu: { label: '鈞羽有限公司', icon: '🌸', systems: ['tsaipei'] },
  weizheng: { label: '瑋政有限公司', icon: '🏭', systems: ['foodfactory'] },
  chenwei: { label: '宸暐企業有限公司', icon: '🏢', systems: ['dispatch'] },
  finance: { label: '財務專用系統', icon: '💰', systems: ['dormMgmt'] },
  yujian: { label: '聿見國際有限公司', icon: '🏠', systems: ['yujian'] },
};

export function companyKeyForSystem(systemKey) {
  return Object.entries(COMPANIES).find(([, c]) => c.systems.includes(systemKey))?.[0];
}
