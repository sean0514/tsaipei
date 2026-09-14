import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';

const EDITABLE_FIELDS = ['date', 'batchNo', 'unitPrice', 'expiryDate', 'inspectionStatus', 'note', 'billingCycle', 'paymentMethod', 'bankAccount', 'bankBranch', 'accountName'];
const INSPECTION_STATUSES = ['待驗收', '合格', '不合格'];
const PAYMENT_METHODS = ['現金', '匯款'];

export default function PurchasesPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'inventory', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('foodfactory_purchases', { order: ['date', 'desc'] });
  const { rows: materials } = useCollection('foodfactory_materials');
  const { rows: suppliers } = useCollection('foodfactory_suppliers');
  const [editing, setEditing] = useState(null);

  const materialName = (id) => materials.find((m) => m.id === id)?.name || '(未知)';
  const supplierName = (id) => suppliers.find((s) => s.id === id)?.name || '(未知)';

  // 新增進貨單同時建立一筆入庫的庫存異動紀錄，庫存量完全由 InventoryLogs 加總算出，
  // 不是 Purchases 表本身的欄位 — 跟原本 Apps Script 版 addPurchase() 一致。
  // 只允許改不影響庫存/成本連動的欄位；數量/原料/供應商要改的話刪除重建。
  async function handleSave(data) {
    if (data.id) {
      const { id } = data;
      const patch = {};
      EDITABLE_FIELDS.forEach((k) => { patch[k] = data[k] || ''; });
      const existing = rows.find((r) => r.id === id);
      patch.amount = (Number(existing.quantity) || 0) * (Number(data.unitPrice) || 0);
      await update(id, patch);
    } else {
      const amount = (Number(data.quantity) || 0) * (Number(data.unitPrice) || 0);
      const payload = { ...data, amount, source: data.source || '進貨單' };
      const ref = await add(payload);
      await addDoc(collection(db, 'foodfactory_inventoryLogs'), {
        materialId: data.materialId, batchNo: data.batchNo, type: '入庫', quantity: data.quantity,
        date: data.date, refType: '進貨單', refId: ref.id, note: `進貨單 ${data.purchaseNo || ''}`,
      });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>原料與庫存 · 進貨單</h2>
        {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增進貨單</button>}
      </div>
      <div className="card">
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>日期</th><th>原料</th><th>供應商</th><th>批號</th><th>數量</th><th>單價</th><th>金額</th><th>驗收狀態</th><th>計算週期</th><th>付款方式</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{materialName(r.materialId)}</td>
                  <td>{supplierName(r.supplierId)}</td>
                  <td>{r.batchNo || '—'}</td>
                  <td>{r.quantity}</td>
                  <td>{r.unitPrice}</td>
                  <td>{r.amount}</td>
                  <td>{r.inspectionStatus || '—'}</td>
                  <td>{r.billingCycle || '—'}</td>
                  <td>{r.paymentMethod || '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={11} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && (
        <PurchaseFormModal initial={editing} materials={materials} suppliers={suppliers} onCancel={() => setEditing(null)} onSave={handleSave} />
      )}
    </div>
  );
}

function PurchaseFormModal({ initial, materials, suppliers, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const isNew = !initial.id;
  const isTransfer = form.paymentMethod === '匯款';
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{isNew ? '新增進貨單' : '編輯進貨單'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              進貨單號
              <input value={form.purchaseNo || ''} disabled={!isNew} onChange={(e) => setForm({ ...form, purchaseNo: e.target.value })} />
            </label>
            <label>
              原料
              <select required disabled={!isNew} value={form.materialId || ''} onChange={(e) => setForm({ ...form, materialId: e.target.value })}>
                <option value="" disabled>請選擇</option>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label>
              供應商
              <select disabled={!isNew} value={form.supplierId || ''} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                <option value="">請選擇</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>
              日期
              <input type="date" required value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>
              批號
              <input value={form.batchNo || ''} onChange={(e) => setForm({ ...form, batchNo: e.target.value })} />
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
              效期
              <input type="date" value={form.expiryDate || ''} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
            </label>
            <label>
              驗收狀態
              <select value={form.inspectionStatus || ''} onChange={(e) => setForm({ ...form, inspectionStatus: e.target.value })}>
                <option value="">請選擇</option>
                {INSPECTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>
              計算週期
              <input value={form.billingCycle || ''} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })} />
            </label>
            <label>
              付款方式
              <select value={form.paymentMethod || ''} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                <option value="">請選擇</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            {isTransfer && (
              <>
                <label>
                  帳號
                  <input value={form.bankAccount || ''} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} />
                </label>
                <label>
                  分行
                  <input value={form.bankBranch || ''} onChange={(e) => setForm({ ...form, bankBranch: e.target.value })} />
                </label>
                <label>
                  戶名
                  <input value={form.accountName || ''} onChange={(e) => setForm({ ...form, accountName: e.target.value })} />
                </label>
              </>
            )}
            <label>
              備註
              <input value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
          </div>
          {!isNew && <p className="muted">數量/原料/供應商要改的話請刪除重建，避免跟已經入庫的庫存異動紀錄對不起來。</p>}
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
