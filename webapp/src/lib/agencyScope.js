// 業務人員只能看到跟自己所屬台仲（國內仲介）有關聯的資料；其他角色不受
// 這個限制。沒有台仲欄位、或台仲還沒填的資料一律不限制顯示（避免剛建立、
// 還沒分配仲介的雇主/案件被卡住、業務人員看不到也認領不到）；業務人員
// 自己還沒被系統管理員設定台仲時，也不限制（避免因為忘記設定就什麼都
// 看不到）。
//
// getAgencies(row) 回傳這筆資料關聯到的台仲名稱——大部分分頁資料本身就有
// taiwanAgency 欄位，直接回傳字串即可；沒有直接存這個欄位的分頁（例如
// 二面進度/錄取名單要透過 matchId 查媒合紀錄、安置中名單要透過 workerId
// 查這個工人所有媒合紀錄）可以回傳一個陣列，只要其中任一個等於業務人員
// 自己的台仲，這筆資料就會顯示。
export function scopeByTaiwanAgency(rows, { role, userTaiwanAgency, getAgencies }) {
  if (role !== '業務人員' || !userTaiwanAgency) return rows;
  return rows.filter((row) => {
    const raw = getAgencies(row);
    const agencies = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
    return agencies.length === 0 || agencies.includes(userTaiwanAgency);
  });
}
