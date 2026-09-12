import Tag from './Tag';

// Ported from the original app's per-status "panel" grouping pattern used
// in renderMatches/renderSecondInterview/renderAdmitted etc. — instead of
// one flat table, each status gets its own section with a tag+count header.
export default function StatusSections({ statuses, tagMap, rows, statusKey = 'status', sortKey, headerCells, renderRow, colSpan, emptyText = '目前沒有此狀態的紀錄。' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {statuses.map((status) => {
        let items = rows.filter((r) => r[statusKey] === status);
        if (sortKey) items = items.slice().sort((a, b) => (a[sortKey] || '').localeCompare(b[sortKey] || ''));
        return (
          <div className="card" key={status}>
            <h3 style={{ marginTop: 0 }}>
              <Tag value={status} map={tagMap} /> <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {items.length} 筆</span>
            </h3>
            <div className="table-wrap">
              <table>
                <thead><tr>{headerCells}</tr></thead>
                <tbody>
                  {items.map(renderRow)}
                  {items.length === 0 && <tr><td colSpan={colSpan} className="muted">{emptyText}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
