import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { monthlyCostReport } from '../../lib/foodCost';

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

const EXPENSE_ALLOCATIONS = ['批次直接費用', '月共同費用'];

export default function CostAnalysisPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'cost', role, overrides);
  const { rows: batches } = useCollection('foodfactory_productionBatches');
  const { rows: usage } = useCollection('foodfactory_productionMaterialUsage');
  const { rows: purchases } = useCollection('foodfactory_purchases');
  const { rows: expenses, add: addExpense, remove: removeExpense } = useCollection('foodfactory_productionExpenses');
  const { rows: products } = useCollection('foodfactory_products');
  const [month, setMonth] = useState(currentMonthStr());
  const [addingExpense, setAddingExpense] = useState(false);

  const report = monthlyCostReport(month, { batches, usage, purchases, expenses, products });
  const productName = (id) => products.find((p) => p.id === id)?.name || '(未知)';
  const batchProduct = (batchNo) => productName(batches.find((b) => b.batchNo === batchNo)?.productId);

  return (
    <div className="content">
      <div className="page-header"><h2>成本分析</h2></div>
      <p className="muted">依月份試算：用料成本（原料平均單價 × 用量）＋ 該批直接費用 ＋ 當月共同費用依產量分攤。</p>
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ marginBottom: 12 }} />
      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table>
          <thead><tr><th>批號</th><th>成品</th><th>用料成本</th><th>直接費用</th><th>共同費用</th><th>總成本</th><th>產量</th><th>單位成本</th><th>售價</th><th>單位毛利</th></tr></thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.batchNo}>
                <td>{r.batchNo}</td>
                <td>{batchProduct(r.batchNo)}</td>
                <td>{Math.round(r.materialCost).toLocaleString()}</td>
                <td>{Math.round(r.directExpense).toLocaleString()}</td>
                <td>{Math.round(r.commonExpense).toLocaleString()}</td>
                <td>{Math.round(r.totalCost).toLocaleString()}</td>
                <td>{r.actualQty}</td>
                <td>{r.unitCost.toFixed(2)}</td>
                <td>{r.price}</td>
                <td>{r.unitMargin.toFixed(2)}</td>
              </tr>
            ))}
            {report.rows.length === 0 && <tr><td colSpan={10} className="muted">沒有資料</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <div><div style={{ fontSize: 22, fontWeight: 700 }}>{Math.round(report.totals.materialCost).toLocaleString()}</div><div className="muted">用料成本總計</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 700 }}>{Math.round(report.totals.directExpense).toLocaleString()}</div><div className="muted">直接費用總計</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 700 }}>{Math.round(report.totals.commonExpense).toLocaleString()}</div><div className="muted">共同費用總計</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 700 }}>{Math.round(report.totals.totalCost).toLocaleString()}</div><div className="muted">總成本</div></div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="page-header" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>生產費用登錄</h3>
          {canEditPage && <button className="primary" onClick={() => setAddingExpense(true)}>新增費用</button>}
        </div>
        <p className="muted" style={{ marginTop: 0 }}>指定批號＝該批直接費用；不指定批號、只填月份＝當月共同費用，依各批產量比例分攤。</p>
        <table>
          <thead><tr><th>月份</th><th>批號</th><th>費用類型</th><th>金額</th>{canEditPage && <th></th>}</tr></thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id}>
                <td>{e.month}</td><td>{e.batchNo || '（月共同費用）'}</td><td>{e.type || '—'}</td><td>{e.amount}</td>
                {canEditPage && <td><button className="danger" onClick={() => removeExpense(e.id)}>刪除</button></td>}
              </tr>
            ))}
            {expenses.length === 0 && <tr><td colSpan={5} className="muted">沒有資料</td></tr>}
          </tbody>
        </table>
      </div>
      {addingExpense && (
        <ExpenseFormModal batches={batches} onCancel={() => setAddingExpense(false)} onSave={async (data) => { await addExpense(data); setAddingExpense(false); }} />
      )}
    </div>
  );
}

function ExpenseFormModal({ batches, onCancel, onSave }) {
  const [form, setForm] = useState({});
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>新增生產費用</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              分攤方式
              <select value={form.allocation || EXPENSE_ALLOCATIONS[0]} onChange={(e) => {
                const allocation = e.target.value;
                setForm({ ...form, allocation, batchNo: allocation === '批次直接費用' ? form.batchNo : '' });
              }}>
                {EXPENSE_ALLOCATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            {form.allocation !== '月共同費用' && (
              <label>
                生產批號
                <select value={form.batchNo || ''} onChange={(e) => setForm({ ...form, batchNo: e.target.value })}>
                  <option value="">請選擇</option>
                  {batches.map((b) => <option key={b.id} value={b.batchNo}>{b.batchNo}</option>)}
                </select>
              </label>
            )}
            <label>
              月份
              <input type="month" required value={form.month || ''} onChange={(e) => setForm({ ...form, month: e.target.value })} />
            </label>
            <label>費用類型<input value={form.type || ''} onChange={(e) => setForm({ ...form, type: e.target.value })} /></label>
            <label>金額<input type="number" required value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
            <label>備註<input value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          </div>
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
