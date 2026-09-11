// Ported from incomeStatementMonth/autoAccountAmount_ in
// food-factory-mgmt/apps-script/Code.gs. Never persisted — recomputed live.

export function autoAccountAmount(autoSource, month, ctx) {
  const { shipments, purchases, pettyCashTransactions, productionExpenses } = ctx;
  if (autoSource === 'shipmentIncome') {
    return shipments.filter((s) => String(s.date).slice(0, 7) === month).reduce((sum, s) => sum + (Number(s.total) || 0), 0);
  }
  if (autoSource === 'materialCost') {
    return purchases.filter((p) => String(p.date).slice(0, 7) === month).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }
  if (autoSource === 'pettyCashOther') {
    return pettyCashTransactions
      .filter((t) => String(t.date).slice(0, 7) === month && t.direction === '支出' && !t.linkedPurchaseId)
      .reduce((sum, t) => sum + (Number(t.total) || 0), 0);
  }
  if (autoSource === 'productionExpense') {
    return productionExpenses.filter((e) => String(e.month).slice(0, 7) === month).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }
  return 0;
}

function sumByType(lines, type) {
  return lines.filter((l) => l.type === type).reduce((sum, l) => sum + l.amount, 0);
}

export function incomeStatementMonth(month, ctx) {
  const { accountCategories, manualLedgerEntries } = ctx;
  const monthEntries = manualLedgerEntries.filter((e) => e.month === month);
  const lines = accountCategories.map((c) => {
    const amount = c.source === 'auto'
      ? autoAccountAmount(c.autoSource, month, ctx)
      : monthEntries.filter((e) => String(e.categoryId) === String(c.id)).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    return { categoryId: c.id, name: c.name, type: c.type, amount };
  });
  const income = sumByType(lines, '收入');
  const variableCost = sumByType(lines, '變動成本');
  const fixedCost = sumByType(lines, '固定成本');
  const grossProfit = income - variableCost;
  const netProfit = grossProfit - fixedCost;
  return {
    month, lines, income, variableCost, fixedCost, grossProfit,
    grossMargin: income ? grossProfit / income : 0, netProfit, netMargin: income ? netProfit / income : 0,
  };
}
