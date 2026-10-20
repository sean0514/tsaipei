import { t } from '../lib/i18n';

// Renders a colored status pill, e.g. <Tag value={student.status} map={STUDENT_TAG} />.
// Falls back to plain text if the value isn't in the map (unknown/blank status).
// 色塊依原始中文值查表，顯示文字另外用 t(value, lang) 翻譯——元凱系統（越南
// 系統）頁面才會傳 lang，傳了才會翻譯顯示文字，不影響 tag-* 顏色判斷邏輯。
export default function Tag({ value, map, lang }) {
  if (!value) return <span className="muted">—</span>;
  const cls = map?.[value];
  const label = t(value, lang);
  if (!cls) return <span>{label}</span>;
  return <span className={`tag ${cls}`}>{label}</span>;
}
