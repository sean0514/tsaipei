import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { exportEntityCSV } from '../../lib/csv';

const CSV_FIELDS = [
  { key: 'date', label: '日期' }, { key: 'customerName', label: '客戶' }, { key: 'productName', label: '成品' },
  { key: 'batchNo', label: '批號' }, { key: 'quantity', label: '數量' }, { key: 'unitPrice', label: '單價' },
  { key: 'amount', label: '金額' }, { key: 'tax', label: '稅金' }, { key: 'total', label: '總額' }, { key: 'note', label: '備註' },
];

export default function ShipmentsPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'shipping', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('foodfactory_shipments', { order: ['date', 'desc'] });
  const { rows: products } = useCollection('foodfactory_products');
  const { rows: customers } = useCollection('foodfactory_customers');
  const { rows: productInventory, update: updateInv } = useCollection('foodfactory_productInventory');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');

  const productName = (id) => products.find((p) => p.id === id)?.name || '(未知)';
  const customerName = (id) => customers.find((c) => c.id === id)?.name || '(未知)';
  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows.filter((r) => !searchQuery || `${customerName(r.customerId)} ${productName(r.productId)} ${r.batchNo || ''}`.toLowerCase().includes(searchQuery));

  function handleDownload() {
    exportEntityCSV(rows.map((r) => ({ ...r, customerName: customerName(r.customerId), productName: productName(r.productId) })), CSV_FIELDS, '出貨單');
  }

  // 稅金固定 5%，依金額自動算，不用手動輸入；出貨會從成品庫存扣數量，刪除
  // 出貨單要把數量還原回去，跟原本 Apps Script 版一致。
  const TAX_RATE = 0.05;

  async function handleSave(data) {
    if (data.id) {
      const existing = rows.find((r) => r.id === data.id);
      const amount = (Number(existing.quantity) || 0) * (Number(data.unitPrice) || 0);
      const tax = Math.round(amount * TAX_RATE);
      await update(data.id, { date: data.date, unitPrice: data.unitPrice, note: data.note, amount, tax, total: amount + tax });
    } else {
      const qty = Number(data.quantity) || 0;
      const inv = productInventory.find((i) => i.productId === data.productId && i.batchNo === data.batchNo);
      if (!inv) { alert(`找不到該成品批號的庫存紀錄（可能尚未完成入庫）：${data.batchNo}`); return; }
      const stockQty = Number(inv.quantity) || 0;
      if (stockQty < qty) { alert(`庫存不足：批號 ${data.batchNo} 目前庫存 ${stockQty}，出貨數量 ${qty}`); return; }
      const amount = qty * (Number(data.unitPrice) || 0);
      const tax = Math.round(amount * TAX_RATE);
      const total = amount + tax;
      await add({ ...data, amount, tax, total });
      await updateInv(inv.id, { quantity: stockQty - qty });
    }
    setEditing(null);
  }

  async function handleDelete(r) {
    const inv = productInventory.find((i) => i.productId === r.productId && i.batchNo === r.batchNo);
    if (inv) await updateInv(inv.id, { quantity: (Number(inv.quantity) || 0) + (Number(r.quantity) || 0) });
    await remove(r.id);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>成品與出貨 · 出貨單</h2>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增出貨單</button>}
          <button onClick={handleDownload}>下載完整資料</button>
        </div>
      </div>
      <div className="card">
        <input placeholder="搜尋客戶/成品/批號" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead><tr><th>日期</th><th>客戶</th><th>成品</th><th>批號</th><th>數量</th><th>單價</th><th>金額</th><th>稅金(5%)</th><th>總額</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{customerName(r.customerId)}</td>
                  <td>{productName(r.productId)}</td>
                  <td>{r.batchNo}</td>
                  <td>{r.quantity}</td>
                  <td>{r.unitPrice}</td>
                  <td>{r.amount}</td>
                  <td>{r.tax}</td>
                  <td>{r.total}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => handleDelete(r)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={canEditPage ? 10 : 9} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {editing && (
        <ShipmentFormModal initial={editing} products={products} customers={customers} productInventory={productInventory} onCancel={() => setEditing(null)} onSave={handleSave} />
      )}
    </div>
  );
}

function ShipmentFormModal({ initial, products, customers, productInventory, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const isNew = !initial.id;
  const selectedProduct = products.find((p) => p.id === form.productId);
  const matchedInv = productInventory.find((i) => i.productId === form.productId && i.batchNo === form.batchNo);

  // 金額／稅金只是即時預覽，讓使用者送出前就能看到算出來的結果；實際存檔的
  // 金額/稅金/總額是 handleSave 依同一套 5% 稅率重新算一次。
  const previewAmount = (Number(form.quantity) || 0) * (Number(form.unitPrice) || 0);
  const previewTax = Math.round(previewAmount * 0.05);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{isNew ? '新增出貨單' : '編輯出貨單'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              客戶
              <select required disabled={!isNew} value={form.customerId || ''} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                <option value="" disabled>請選擇</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>
              成品
              <select
                required
                disabled={!isNew}
                value={form.productId || ''}
                onChange={(e) => {
                  const product = products.find((p) => p.id === e.target.value);
                  setForm({ ...form, productId: e.target.value, batchNo: product?.batchNo || '', unitPrice: product?.price ?? form.unitPrice });
                }}
              >
                <option value="" disabled>請選擇</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label>
              批號
              <input required disabled={!isNew} value={form.batchNo || ''} onChange={(e) => setForm({ ...form, batchNo: e.target.value })} />
              {isNew && selectedProduct && (
                <span className="muted" style={{ fontSize: 12 }}>
                  依成品主檔「{selectedProduct.name}」自動帶入{matchedInv ? `，目前庫存 ${matchedInv.quantity}` : '（尚無此批號的庫存紀錄）'}
                </span>
              )}
            </label>
            <label>
              日期
              <input type="date" required value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>
              數量
              <input type="number" required disabled={!isNew} value={form.quantity || ''} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </label>
            <label>
              單價
              <input type="number" value={form.unitPrice || ''} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
            </label>
            <label>
              金額
              <input value={previewAmount.toLocaleString()} disabled />
            </label>
            <label>
              稅金(5%)
              <input value={previewTax.toLocaleString()} disabled />
            </label>
            <label>
              備註
              <input value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
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
