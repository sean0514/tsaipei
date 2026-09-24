import { useState } from 'react';

// 「選擇顯示欄位」共用邏輯：預設全部欄位顯示，回傳目前顯示的欄位集合跟切換函式。
export function useColumnVisibility(columns) {
  const [visibleKeys, setVisibleKeys] = useState(() => new Set(columns.map((c) => c.key)));

  function toggleColumn(key) {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return { visibleKeys, toggleColumn };
}
