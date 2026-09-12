// Renders a colored status pill, e.g. <Tag value={student.status} map={STUDENT_TAG} />.
// Falls back to plain text if the value isn't in the map (unknown/blank status).
export default function Tag({ value, map }) {
  if (!value) return <span className="muted">—</span>;
  const cls = map?.[value];
  if (!cls) return <span>{value}</span>;
  return <span className={`tag ${cls}`}>{value}</span>;
}
