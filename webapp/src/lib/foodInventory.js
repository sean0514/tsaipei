// Ported from food-factory-mgmt/apps-script/Code.gs — inventory is never
// stored as a running total, it's derived from InventoryLogs (入庫/出庫)
// every time, same as the original.

export function materialStock(materialId, inventoryLogs) {
  return inventoryLogs
    .filter((l) => String(l.materialId) === String(materialId))
    .reduce((qty, l) => qty + (l.type === '入庫' ? 1 : -1) * (Number(l.quantity) || 0), 0);
}

export function nextBatchNo(rows, dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const prefix = d.toISOString().slice(0, 10).replace(/-/g, '');
  let maxSeq = 0;
  rows.forEach((r) => {
    if (r.batchNo && String(r.batchNo).indexOf(prefix) === 0) {
      const seq = parseInt(String(r.batchNo).split('-')[1], 10);
      if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  });
  return `${prefix}-${String(maxSeq + 1).padStart(3, '0')}`;
}
