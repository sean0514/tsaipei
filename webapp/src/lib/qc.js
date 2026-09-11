// Ported from evalQcItemPass_ in food-factory-mgmt/apps-script/Code.gs.
export function evalQcItemPass(dataType, spec, value) {
  if (dataType === '合格判定') return String(value) === '合格' || value === true || value === 'true';
  if (dataType === '數值') {
    const v = Number(value);
    if (Number.isNaN(v) || !spec) return true; // 無標準值可比對時，不阻擋（視為記錄用）
    const s = String(spec).trim();
    let m;
    if ((m = s.match(/^>=\s*(-?\d+(\.\d+)?)$/))) return v >= Number(m[1]);
    if ((m = s.match(/^<=\s*(-?\d+(\.\d+)?)$/))) return v <= Number(m[1]);
    if ((m = s.match(/^>\s*(-?\d+(\.\d+)?)$/))) return v > Number(m[1]);
    if ((m = s.match(/^<\s*(-?\d+(\.\d+)?)$/))) return v < Number(m[1]);
    if ((m = s.match(/^(-?\d+(\.\d+)?)\s*[~-]\s*(-?\d+(\.\d+)?)$/))) return v >= Number(m[1]) && v <= Number(m[3]);
    if ((m = s.match(/^(-?\d+(\.\d+)?)$/))) return v === Number(m[1]);
    return true;
  }
  return true; // 文字型項目僅記錄，不判定合格/不合格
}
