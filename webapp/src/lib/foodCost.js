// Ported from batchCost/monthlyCostReport in food-factory-mgmt/apps-script/Code.gs.
// Never persisted — recomputed from live collections every time, same as the original.

export function materialAvgUnitPrice(materialId, batchNo, purchases) {
  const matching = purchases.filter((p) => String(p.materialId) === String(materialId) && (!batchNo || p.batchNo === batchNo));
  if (!matching.length) return 0;
  const sum = matching.reduce((s, p) => s + (Number(p.unitPrice) || 0), 0);
  return sum / matching.length;
}

export function batchCost(batchNo, ctx) {
  const { usage, purchases, batches, expenses, products } = ctx;
  const batchUsage = usage.filter((u) => u.batchNo === batchNo);
  let materialCost = 0;
  batchUsage.forEach((u) => {
    materialCost += materialAvgUnitPrice(u.materialId, u.materialBatchNo, purchases) * (Number(u.quantity) || 0);
  });

  const batch = batches.find((b) => b.batchNo === batchNo);
  const month = batch ? String(batch.date).slice(0, 7) : '';
  const directExpense = expenses.filter((e) => e.batchNo === batchNo).reduce((s, e) => s + (Number(e.amount) || 0), 0);

  let commonExpense = 0;
  const monthExpenses = expenses.filter((e) => !e.batchNo && e.month === month);
  if (monthExpenses.length) {
    const monthBatches = batches.filter((b) => String(b.date).slice(0, 7) === month);
    const totalQty = monthBatches.reduce((s, b) => s + (Number(b.actualQty) || 0), 0);
    const thisQty = Number(batch?.actualQty) || 0;
    const totalCommon = monthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    commonExpense = totalQty ? totalCommon * (thisQty / totalQty) : 0;
  }

  const totalCost = materialCost + directExpense + commonExpense;
  const actualQty = Number(batch?.actualQty) || 0;
  const unitCost = actualQty ? totalCost / actualQty : 0;
  const product = batch ? products.find((p) => p.id === batch.productId) : null;
  const price = product ? Number(product.price) || 0 : 0;
  return { batchNo, materialCost, directExpense, commonExpense, totalCost, actualQty, unitCost, price, unitMargin: price - unitCost };
}

export function monthlyCostReport(month, ctx) {
  const rows = ctx.batches.filter((b) => String(b.date).slice(0, 7) === month).map((b) => batchCost(b.batchNo, ctx));
  const totals = rows.reduce((acc, r) => ({
    materialCost: acc.materialCost + r.materialCost,
    directExpense: acc.directExpense + r.directExpense,
    commonExpense: acc.commonExpense + r.commonExpense,
    totalCost: acc.totalCost + r.totalCost,
  }), { materialCost: 0, directExpense: 0, commonExpense: 0, totalCost: 0 });
  return { month, rows, totals };
}
