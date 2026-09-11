import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { downloadCustomerInvoiceXlsx } from '../../lib/customerInvoiceXlsx';

function currentMonthStr() {
  const d = new Date();
  return { start: `${d.toISOString().slice(0, 7)}-01`, end: d.toISOString().slice(0, 10) };
}

export default function CustomerInvoicesPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'billing', role, overrides);
  const { rows: invoices, loading, update } = useCollection('foodfactory_customerInvoices', { order: ['issueDate', 'desc'] });
  const { rows: shipments, update: updateShipment } = useCollection('foodfactory_shipments');
  const { rows: customers } = useCollection('foodfactory_customers');
  const { rows: products } = useCollection('foodfactory_products');
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const customerName = (id) => customers.find((c) => c.id === id)?.name || '(未知)';

  // 把該客戶在期間內、還沒被請款單認領的出貨單全部撈出來加總成一張請款單，
  // 同時把這些出貨單標上 invoiceId，跟原本 createCustomerInvoice() 一致。
  async function handleCreate(customerId, periodStart, periodEnd) {
    const unbilled = shipments.filter((s) => s.customerId === customerId && !s.invoiceId && s.date >= periodStart && s.date <= periodEnd);
    if (!unbilled.length) { alert('該期間內找不到未請款的出貨紀錄'); return; }
    const totalAmount = unbilled.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const ref = await addDoc(collection(db, 'foodfactory_customerInvoices'), {
      invoiceNo: `INV${today.replace(/-/g, '')}`, customerId, periodStart, periodEnd,
      totalAmount, status: '已請款', issueDate: today, receivedDate: '', note: '',
    });
    await Promise.all(unbilled.map((s) => updateShipment(s.id, { invoiceId: ref.id })));
    setCreating(false);
  }

  async function handleDownload(inv) {
    setDownloadingId(inv.id);
    try {
      const items = shipments.filter((s) => s.invoiceId === inv.id);
      await downloadCustomerInvoiceXlsx(inv, customers.find((c) => c.id === inv.customerId), items, products);
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>客戶請款明細</h2>
        {canEditPage && <button className="primary" onClick={() => setCreating(true)}>建立請款單</button>}
      </div>
      <div className="card">
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead><tr><th>請款單號</th><th>客戶</th><th>期間</th><th>總金額</th><th>狀態</th><th>收款日期</th><th></th></tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.invoiceNo}</td>
                  <td>{customerName(inv.customerId)}</td>
                  <td>{inv.periodStart} ~ {inv.periodEnd}</td>
                  <td>{inv.totalAmount?.toLocaleString()}</td>
                  <td>{inv.status}</td>
                  <td>{inv.receivedDate || '—'}</td>
                  <td className="row-actions">
                    <button disabled={downloadingId === inv.id} onClick={() => handleDownload(inv)}>{downloadingId === inv.id ? '產生中…' : '下載請款單'}</button>
                    {canEditPage && inv.status !== '已收款' && <button onClick={() => setReceiving(inv)}>登錄收款</button>}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && <tr><td colSpan={7} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {creating && <CreateInvoiceModal customers={customers} onCancel={() => setCreating(false)} onSave={handleCreate} />}
      {receiving && (
        <ReceiveModal invoice={receiving} onCancel={() => setReceiving(null)} onSave={async (date) => { await update(receiving.id, { status: '已收款', receivedDate: date }); setReceiving(null); }} />
      )}
    </div>
  );
}

function CreateInvoiceModal({ customers, onCancel, onSave }) {
  const defaults = currentMonthStr();
  const [customerId, setCustomerId] = useState('');
  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd, setPeriodEnd] = useState(defaults.end);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>建立請款單</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(customerId, periodStart, periodEnd); }}>
          <div className="form-grid">
            <label>
              客戶
              <select required value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="" disabled>請選擇</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>期間起<input type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></label>
            <label>期間迄<input type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></label>
          </div>
          <div className="row-actions">
            <button type="submit" className="primary">建立</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReceiveModal({ invoice, onCancel, onSave }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>登錄收款 · {invoice.invoiceNo}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(date); }}>
          <div className="form-grid">
            <label>收款日期<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
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
