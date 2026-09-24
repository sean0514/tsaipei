// 「選擇顯示欄位」下拉清單，勾選/取消勾選控制表格顯示哪些欄位。
// sticky 欄位（例如固定在畫面左側的姓名欄）不能取消顯示，checkbox 停用。
export default function ColumnPicker({ columns, visibleKeys, onToggle }) {
  return (
    <details>
      <summary style={{ cursor: 'pointer' }}>選擇顯示欄位</summary>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', padding: '8px 4px', maxWidth: 640 }}>
        {columns.map((c) => (
          <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <input type="checkbox" checked={visibleKeys.has(c.key)} onChange={() => onToggle(c.key)} disabled={c.sticky} />
            {c.label}
          </label>
        ))}
      </div>
    </details>
  );
}
