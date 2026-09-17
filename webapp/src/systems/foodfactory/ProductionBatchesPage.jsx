import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { nextBatchNo } from '../../lib/foodInventory';
import { exportEntityCSV } from '../../lib/csv';

const CSV_FIELDS = [
  { key: 'batchNo', label: '批號' }, { key: 'productName', label: '成品' }, { key: 'date', label: '日期' },
  { key: 'line', label: '產線' }, { key: 'responsible', label: '負責人' }, { key: 'plannedQty', label: '計畫產量' },
  { key: 'actualQty', label: '實際產量' }, { key: 'status', label: '狀態' },
];

export default function ProductionBatchesPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'production', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('foodfactory_productionBatches', { order: ['date', 'desc'] });
  const { rows: products } = useCollection('foodfactory_products');
  const { rows: productInventory, add: addInv, update: updateInv } = useCollection('foodfactory_productInventory');
  const { rows: materials } = useCollection('foodfactory_materials');
  const { rows: usage, add: addUsage } = useCollection('foodfactory_productionMaterialUsage');
  const [editing, setEditing] = useState(null);
  const [usageFor, setUsageFor] = useState(null);
  const [q, setQ] = useState('');

  const productName = (id) => products.find((p) => p.id === id)?.name || '(未知)';
  const materialName = (id) => materials.find((m) => m.id === id)?.name || '(未知)';
  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows.filter((r) => !searchQuery || `${r.batchNo || ''} ${productName(r.productId)} ${r.line || ''} ${r.responsible || ''}`.toLowerCase().includes(searchQuery));

  function handleDownload() {
    exportEntityCSV(rows.map((r) => ({ ...r, productName: productName(r.productId) })), CSV_FIELDS, '生產批次');
  }

  // 記一筆用料同時寫一筆出庫的庫存異動紀錄，庫存扣帳完全靠 InventoryLogs 加總，
  // 跟 addProductionMaterialUsage() 一致。
  async function handleAddUsage(batchNo, data) {
    await addUsage({ batchNo, materialId: data.materialId, materialBatchNo: data.materialBatchNo, quantity: data.quantity });
    await addDoc(collection(db, 'foodfactory_inventoryLogs'), {
      materialId: data.materialId, batchNo: data.materialBatchNo, type: '出庫', quantity: data.quantity,
      date: new Date().toISOString().slice(0, 10), refType: '生產批次', refId: batchNo, note: '生產用料',
    });
    setUsageFor(null);
  }

  // 已完成入庫的批次若修改實際產量，要同步調整已經計入的成品庫存，避免兩邊對不起來。
  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      const existing = rows.find((r) => r.id === id);
      if (existing.status === '完成') {
        const diff = (Number(rest.actualQty) || 0) - (Number(existing.actualQty) || 0);
        if (diff !== 0) {
          const inv = productInventory.find((i) => i.productId === existing.productId && i.batchNo === existing.batchNo);
          if (inv) await updateInv(inv.id, { quantity: (Number(inv.quantity) || 0) + diff });
        }
      }
      await update(id, { date: rest.date, line: rest.line, responsible: rest.responsible, plannedQty: rest.plannedQty, actualQty: rest.actualQty });
    } else {
      await add({ ...data, batchNo: data.batchNo || nextBatchNo(rows, data.date), status: '生產中' });
    }
    setEditing(null);
  }

  // 刪除已完成入庫的批次要把當初計入的成品庫存扣回去，避免留下多餘庫存。
  async function handleDelete(batch) {
    if (batch.status === '完成') {
      const inv = productInventory.find((i) => i.productId === batch.productId && i.batchNo === batch.batchNo);
      if (inv) await updateInv(inv.id, { quantity: (Number(inv.quantity) || 0) - (Number(batch.actualQty) || 0) });
    }
    await remove(batch.id);
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
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增生產批次</button>}
          <button onClick={handleDownload}>下載完整資料</button>
        </div>
      </div>
      <div className="card">
        <input placeholder="搜尋批號/成品/產線/負責人" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead><tr><th>批號</th><th>成品</th><th>日期</th><th>產線</th><th>負責人</th><th>計畫產量</th><th>實際產量</th><th>狀態</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filteredRows.map((r) => (
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
                      <button onClick={() => setUsageFor(r)}>用料明細</button>
                      <button onClick={() => setEditing(r)}>編輯</button>
                      {r.status !== '完成' && <button onClick={() => completeBatch(r)}>完成入庫</button>}
                      <button className="danger" onClick={() => handleDelete(r)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={9} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {editing && <BatchFormModal initial={editing} products={products} onCancel={() => setEditing(null)} onSave={handleSave} />}
      {usageFor && (
        <UsageModal
          batch={usageFor}
          materials={materials}
          usage={usage.filter((u) => u.batchNo === usageFor.batchNo)}
          materialName={materialName}
          onCancel={() => setUsageFor(null)}
          onAdd={(data) => handleAddUsage(usageFor.batchNo, data)}
        />
      )}
    </div>
  );
}

function UsageModal({ batch, materials, usage, materialName, onCancel, onAdd }) {
  const [form, setForm] = useState({});
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>用料明細 · {batch.batchNo}</h3>
        <table style={{ marginBottom: 16 }}>
          <thead><tr><th>原料</th><th>使用批號</th><th>數量</th></tr></thead>
          <tbody>
            {usage.map((u) => (
              <tr key={u.id}><td>{materialName(u.materialId)}</td><td>{u.materialBatchNo || '—'}</td><td>{u.quantity}</td></tr>
            ))}
            {usage.length === 0 && <tr><td colSpan={3} className="muted">尚無用料紀錄</td></tr>}
          </tbody>
        </table>
        <form onSubmit={(e) => { e.preventDefault(); onAdd(form); setForm({}); }}>
          <div className="form-grid">
            <label>
              原料
              <select required value={form.materialId || ''} onChange={(e) => setForm({ ...form, materialId: e.target.value })}>
                <option value="" disabled>請選擇</option>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label>
              使用原料批號
              <input value={form.materialBatchNo || ''} onChange={(e) => setForm({ ...form, materialBatchNo: e.target.value })} />
            </label>
            <label>
              使用數量
              <input type="number" required value={form.quantity || ''} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </label>
          </div>
          <div className="row-actions">
            <button type="submit" className="primary">新增用料</button>
            <button type="button" onClick={onCancel}>關閉</button>
          </div>
        </form>
      </div>
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
