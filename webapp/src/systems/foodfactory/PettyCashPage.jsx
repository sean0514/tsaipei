import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { exportEntityCSV } from '../../lib/csv';

const DIRECTIONS = ['支出', '收入'];
const PAYMENT_METHODS = ['現金', '轉帳', '信用卡', '支票'];
const CSV_FIELDS = [
  { key: 'date', label: '日期' }, { key: 'vendor', label: '廠商' }, { key: 'categoryName', label: '類別' },
  { key: 'itemName', label: '品名' }, { key: 'direction', label: '收支別' }, { key: 'total', label: '總計' },
  { key: 'runningBalance', label: '累計餘額' }, { key: 'paymentMethod', label: '付款方式' }, { key: 'note', label: '備註' },
];

export default function PettyCashPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'pettyCash', role, overrides);
  const { rows: transactions, loading, add, update, remove } = useCollection('foodfactory_pettyCashTransactions', { order: ['date', 'asc'] });
  const { rows: categories, add: addCategory } = useCollection('foodfactory_expenseCategories');
  const { rows: materials, add: addMaterial } = useCollection('foodfactory_materials');
  const { rows: suppliers, add: addSupplier } = useCollection('foodfactory_suppliers');
  const [editing, setEditing] = useState(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [q, setQ] = useState('');

  const categoryName = (id) => categories.find((c) => c.id === id)?.name || '(未分類)';

  let balance = 0;
  const withBalance = transactions.map((t) => {
    const total = Number(t.total) || 0;
    balance += t.direction === '支出' ? -total : total;
    return { ...t, runningBalance: balance };
  });

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = withBalance.filter((t) => !searchQuery || `${t.vendor || ''} ${categoryName(t.categoryId)} ${t.itemName || ''}`.toLowerCase().includes(searchQuery));

  function handleDownload() {
    exportEntityCSV(withBalance.map((t) => ({ ...t, categoryName: categoryName(t.categoryId) })), CSV_FIELDS, '零用金對帳');
  }

  // 支出且類別勾選「連動原料庫存」時，自動找/建原料、供應商，並用 addPurchase 邏輯
  // 建一筆進貨紀錄（連帶建立入庫的庫存異動）——跟原本 addPettyCashTransaction() 一致。
  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      const amount = (Number(rest.quantity) || 0) * (Number(rest.unitPrice) || 0);
      await update(id, { ...rest, amount, total: amount + (Number(rest.tax) || 0) });
      setEditing(null);
      return;
    }

    const amount = (Number(data.quantity) || 0) * (Number(data.unitPrice) || 0);
    const total = amount + (Number(data.tax) || 0);
    const payload = { ...data, amount, total };

    const category = categories.find((c) => c.id === data.categoryId);
    if (category?.linkInventory && data.direction === '支出') {
      let material = materials.find((m) => m.name === data.itemName);
      if (!material) {
        const ref = await addMaterial({ name: data.itemName, category: category.name, unit: '', note: '零用金自動建立' });
        material = { id: ref.id, name: data.itemName };
      }
      let supplier = suppliers.find((s) => s.name === data.vendor);
      if (!supplier && data.vendor) {
        const ref = await addSupplier({ name: data.vendor });
        supplier = { id: ref.id, name: data.vendor };
      }
      const batchNo = `PC-${data.date}-${material.id}`;
      const purchaseRef = await addDoc(collection(db, 'foodfactory_purchases'), {
        purchaseNo: '', supplierId: supplier?.id || '', date: data.date, materialId: material.id,
        batchNo, quantity: data.quantity, unitPrice: data.unitPrice, expiryDate: '', inspectionStatus: '合格',
        source: '零用金支出', note: '零用金自動建立進貨紀錄', amount,
      });
      await addDoc(collection(db, 'foodfactory_inventoryLogs'), {
        materialId: material.id, batchNo, type: '入庫', quantity: data.quantity, date: data.date,
        refType: '進貨單', refId: purchaseRef.id, note: '零用金支出',
      });
      payload.linkedMaterialId = material.id;
      payload.linkedPurchaseId = purchaseRef.id;
    }
    await add(payload);
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>零用金對帳</h2>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增紀錄</button>}
          <button onClick={handleDownload}>下載完整資料</button>
        </div>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <input placeholder="搜尋廠商/類別/品名" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead><tr><th>日期</th><th>廠商</th><th>類別</th><th>品名</th><th>收支別</th><th>總計</th><th>累計餘額</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filteredRows.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td><td>{t.vendor || '—'}</td><td>{categoryName(t.categoryId)}</td><td>{t.itemName}</td>
                  <td>{t.direction}</td><td>{t.total}</td><td>{t.runningBalance.toLocaleString()}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(t)}>編輯</button>
                      <button className="danger" onClick={() => remove(t.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={8} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="page-header" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>支出類別</h3>
          {canEditPage && <button onClick={() => setAddingCategory(true)}>新增類別</button>}
        </div>
        <table>
          <thead><tr><th>類別名稱</th><th>連動原料庫存</th></tr></thead>
          <tbody>
            {categories.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.linkInventory ? '是' : '否'}</td></tr>)}
            {categories.length === 0 && <tr><td colSpan={2} className="muted">沒有資料</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <TransactionFormModal initial={editing} categories={categories} onCancel={() => setEditing(null)} onSave={handleSave} />
      )}
      {addingCategory && (
        <CategoryFormModal onCancel={() => setAddingCategory(false)} onSave={async (data) => { await addCategory(data); setAddingCategory(false); }} />
      )}
    </div>
  );
}

function TransactionFormModal({ initial, categories, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const isNew = !initial.id;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{isNew ? '新增零用金紀錄' : '編輯零用金紀錄'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>日期<input type="date" required value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label>廠商<input value={form.vendor || ''} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></label>
            <label>
              類別
              <select value={form.categoryId || ''} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">請選擇</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>品名<input required value={form.itemName || ''} onChange={(e) => setForm({ ...form, itemName: e.target.value })} /></label>
            <label>
              收支別
              <select value={form.direction || '支出'} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>數量<input type="number" value={form.quantity || ''} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
            <label>單價<input type="number" value={form.unitPrice || ''} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} /></label>
            <label>稅金<input type="number" value={form.tax || ''} onChange={(e) => setForm({ ...form, tax: e.target.value })} /></label>
            <label>
              付款方式
              <select value={form.paymentMethod || ''} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                <option value="">請選擇</option>
                {PAYMENT_METHODS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label>收到發票日<input type="date" value={form.invoiceDate || ''} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} /></label>
            <label>匯款日<input type="date" value={form.remittanceDate || ''} onChange={(e) => setForm({ ...form, remittanceDate: e.target.value })} /></label>
            <label>備註<input value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          </div>
          {!isNew && <p className="muted">編輯不會回頭調整已經連動建立的進貨/庫存紀錄，數量/單價/類別要改到影響庫存的話請刪除重建。</p>}
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CategoryFormModal({ onCancel, onSave }) {
  const [form, setForm] = useState({ linkInventory: false });
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>新增支出類別</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>類別名稱<input required value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>
              連動原料庫存
              <select value={form.linkInventory} onChange={(e) => setForm({ ...form, linkInventory: e.target.value === 'true' })}>
                <option value="false">否</option>
                <option value="true">是</option>
              </select>
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
