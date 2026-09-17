import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { downloadCustomerInvoiceXlsx } from '../../lib/customerInvoiceXlsx';
import { exportEntityCSV } from '../../lib/csv';
import { useAuth } from '../../auth/AuthContext';
import { logChange, nowIso } from '../../lib/changeLog';

function currentMonthStr() {
  const d = new Date();
  return { start: `${d.toISOString().slice(0, 7)}-01`, end: d.toISOString().slice(0, 10) };
}

const STATUSES = ['已請款', '已收款'];
const RECEIVE_METHODS = ['匯款', '現金', '支票'];
const CSV_FIELDS = [
  { key: 'invoiceNo', label: '請款單號' }, { key: 'customerName', label: '客戶' },
  { key: 'periodStart', label: '期間起' }, { key: 'periodEnd', label: '期間迄' },
  { key: 'totalAmount', label: '總金額' }, { key: 'status', label: '狀態' },
  { key: 'issueDate', label: '開立日期' }, { key: 'receivedDate', label: '收款日期' }, { key: 'receivedMethod', label: '收款方式' },
  { key: 'note', label: '備註' }, { key: 'updatedAt', label: '最後修改時間' },
];

export default function CustomerInvoicesPage() {
  const { system, role, overrides } = useOutletContext();
  const { user } = useAuth();
  const canEditPage = computeCanEdit(system, 'billing', role, overrides);
  const { rows: invoices, loading, update } = useCollection('foodfactory_customerInvoices', { order: ['issueDate', 'desc'] });
  const { rows: shipments, update: updateShipment } = useCollection('foodfactory_shipments');
  const { rows: customers } = useCollection('foodfactory_customers');
  const { rows: products } = useCollection('foodfactory_products');
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState(null);
  const [editing, setEditing] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [q, setQ] = useState('');

  const customerName = (id) => customers.find((c) => c.id === id)?.name || '(未知)';
  const searchQuery = q.trim().toLowerCase();
  const filteredInvoices = invoices.filter((inv) => !searchQuery || `${inv.invoiceNo || ''} ${customerName(inv.customerId)}`.toLowerCase().includes(searchQuery));

  function handleExportAll() {
    exportEntityCSV(invoices.map((inv) => ({ ...inv, customerName: customerName(inv.customerId) })), CSV_FIELDS, '客戶請款明細');
  }

  // 把該客戶在期間內、還沒被請款單認領的出貨單全部撈出來加總成一張請款單，
  // 同時把這些出貨單標上 invoiceId，跟原本 createCustomerInvoice() 一致。
  async function handleCreate(customerId, periodStart, periodEnd) {
    const unbilled = shipments.filter((s) => s.customerId === customerId && !s.invoiceId && s.date >= periodStart && s.date <= periodEnd);
    if (!unbilled.length) { alert('該期間內找不到未請款的出貨紀錄'); return; }
    const totalAmount = unbilled.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const invoiceNo = `INV${today.replace(/-/g, '')}`;
    const ref = await addDoc(collection(db, 'foodfactory_customerInvoices'), {
      invoiceNo, customerId, periodStart, periodEnd,
      totalAmount, status: '已請款', issueDate: today, receivedDate: '', note: '', updatedAt: nowIso(),
    });
    await Promise.all(unbilled.map((s) => updateShipment(s.id, { invoiceId: ref.id })));
    await logChange('客戶請款明細', '新增', invoiceNo, user?.email);
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
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setCreating(true)}>建立請款單</button>}
          <button onClick={handleExportAll}>下載完整資料</button>
        </div>
      </div>
      <input placeholder="搜尋請款單號或客戶" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      <div className="card">
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead><tr><th>請款單號</th><th>客戶</th><th>期間</th><th>總金額</th><th>狀態</th><th>收款日期</th><th>收款方式</th><th>最後修改時間</th><th></th></tr></thead>
            <tbody>
              {filteredInvoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.invoiceNo}</td>
                  <td>{customerName(inv.customerId)}</td>
                  <td>{inv.periodStart} ~ {inv.periodEnd}</td>
                  <td>{inv.totalAmount?.toLocaleString()}</td>
                  <td>{inv.status}</td>
                  <td>{inv.receivedDate || '—'}</td>
                  <td>{inv.receivedMethod || '—'}</td>
                  <td>{inv.updatedAt ? new Date(inv.updatedAt).toLocaleString() : '—'}</td>
                  <td className="row-actions">
                    <button disabled={downloadingId === inv.id} onClick={() => handleDownload(inv)}>{downloadingId === inv.id ? '產生中…' : '下載請款單'}</button>
                    {canEditPage && <button onClick={() => setEditing(inv)}>編輯</button>}
                    {canEditPage && inv.status !== '已收款' && <button onClick={() => setReceiving(inv)}>登錄收款</button>}
                  </td>
                </tr>
              ))}
              {filteredInvoices.length === 0 && <tr><td colSpan={9} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {creating && <CreateInvoiceModal customers={customers} onCancel={() => setCreating(false)} onSave={handleCreate} />}
      {receiving && (
        <ReceiveModal
          invoice={receiving}
          onCancel={() => setReceiving(null)}
          onSave={async (date, method) => {
            await update(receiving.id, { status: '已收款', receivedDate: date, receivedMethod: method, updatedAt: nowIso() });
            await logChange('客戶請款明細', '登錄收款', receiving.invoiceNo, user?.email);
            setReceiving(null);
          }}
        />
      )}
      {editing && (
        <EditInvoiceModal
          invoice={editing}
          onCancel={() => setEditing(null)}
          onSave={async (data) => {
            await update(editing.id, { ...data, updatedAt: nowIso() });
            await logChange('客戶請款明細', '編輯', data.invoiceNo, user?.email);
            setEditing(null);
          }}
        />
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

function EditInvoiceModal({ invoice, onCancel, onSave }) {
  const [form, setForm] = useState(invoice);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>編輯請款單 · {invoice.invoiceNo}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              請款單號
              <input required value={form.invoiceNo || ''} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} />
            </label>
            <label>
              總金額
              <input type="number" value={form.totalAmount ?? ''} onChange={(e) => setForm({ ...form, totalAmount: Number(e.target.value) || 0 })} />
            </label>
            <label>
              狀態
              <select value={form.status || STATUSES[0]} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>
              開立日期
              <input type="date" value={form.issueDate || ''} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
            </label>
            <label>
              收款日期
              <input type="date" value={form.receivedDate || ''} onChange={(e) => setForm({ ...form, receivedDate: e.target.value })} />
            </label>
            <label>
              收款方式
              <select value={form.receivedMethod || ''} onChange={(e) => setForm({ ...form, receivedMethod: e.target.value })}>
                <option value="">請選擇</option>
                {RECEIVE_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
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

function ReceiveModal({ invoice, onCancel, onSave }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState(RECEIVE_METHODS[0]);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>登錄收款 · {invoice.invoiceNo}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(date, method); }}>
          <div className="form-grid">
            <label>收款日期<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label>
              收款方式
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {RECEIVE_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
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
