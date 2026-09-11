import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { nextBatchNo } from '../../lib/foodInventory';

export default function ProductionBatchesPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'production', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('foodfactory_productionBatches', { order: ['date', 'desc'] });
  const { rows: products } = useCollection('foodfactory_products');
  const { rows: productInventory, add: addInv, update: updateInv } = useCollection('foodfactory_productInventory');
  const [editing, setEditing] = useState(null);

  const productName = (id) => products.find((p) => p.id === id)?.name || '(未知)';

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, { date: rest.date, line: rest.line, responsible: rest.responsible, plannedQty: rest.plannedQty, actualQty: rest.actualQty });
    } else {
      await add({ ...data, batchNo: data.batchNo || nextBatchNo(rows, data.date), status: '生產中' });
    }
    setEditing(null);
  }

  // 完成入庫：把實際產量計入成品庫存（同批號+同成品就加總），並依成品保存期限算出效期。
  async function completeBatch(batch) {
    const qty = Number(batch.actualQty) || 0;
    if (!qty) { alert('實際產量為 0，請先填實際產量'); return; }
    const product = products.find((p) => p.id === batch.productId);
    let expiryDate = '';
    if (product?.shelfLifeDays) {
      const d = new Date(batch.date);
      d.setDate(d.getDate() + Number(product.shelfLifeDays));
      expiryDate = d.toISOString().slice(0, 10);
    }
    const existing = productInventory.find((i) => i.batchNo === batch.batchNo && i.productId === batch.productId);
    if (existing) {
      await updateInv(existing.id, { quantity: (Number(existing.quantity) || 0) + qty });
    } else {
      await addInv({ batchNo: batch.batchNo, productId: batch.productId, quantity: qty, expiryDate, location: '' });
    }
    await update(batch.id, { status: '完成' });
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>生產管理 · 生產批次</h2>
        {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增生產批次</button>}
      </div>
      <div className="card">
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead><tr><th>批號</th><th>成品</th><th>日期</th><th>產線</th><th>負責人</th><th>計畫產量</th><th>實際產量</th><th>狀態</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.batchNo}</td>
                  <td>{productName(r.productId)}</td>
                  <td>{r.date}</td>
                  <td>{r.line || '—'}</td>
                  <td>{r.responsible || '—'}</td>
                  <td>{r.plannedQty || '—'}</td>
                  <td>{r.actualQty || '—'}</td>
                  <td>{r.status}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      {r.status !== '完成' && <button onClick={() => setEditing(r)}>編輯</button>}
                      {r.status !== '完成' && <button onClick={() => completeBatch(r)}>完成入庫</button>}
                      {r.status !== '完成' && <button className="danger" onClick={() => remove(r.id)}>刪除</button>}
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {editing && <BatchFormModal initial={editing} products={products} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function BatchFormModal({ initial, products, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯生產批次' : '新增生產批次'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              成品
              <select required disabled={!!initial.id} value={form.productId || ''} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                <option value="" disabled>請選擇</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label>
              日期
              <input type="date" required value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>
              產線
              <input value={form.line || ''} onChange={(e) => setForm({ ...form, line: e.target.value })} />
            </label>
            <label>
              負責人
              <input value={form.responsible || ''} onChange={(e) => setForm({ ...form, responsible: e.target.value })} />
            </label>
            <label>
              計畫產量
              <input type="number" value={form.plannedQty || ''} onChange={(e) => setForm({ ...form, plannedQty: e.target.value })} />
            </label>
            <label>
              實際產量
              <input type="number" value={form.actualQty || ''} onChange={(e) => setForm({ ...form, actualQty: e.target.value })} />
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
