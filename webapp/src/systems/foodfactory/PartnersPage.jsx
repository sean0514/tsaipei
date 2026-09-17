import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { incomeStatementMonth } from '../../lib/incomeStatement';
import { exportEntityCSV } from '../../lib/csv';
import { useAuth } from '../../auth/AuthContext';
import { logChange, nowIso } from '../../lib/changeLog';

const PARTNER_CSV_FIELDS = [{ key: 'name', label: '合夥人姓名' }, { key: 'sharePct', label: '分潤比例(%)' }, { key: 'updatedAt', label: '最後修改時間' }];
const PAYOUT_CSV_FIELDS = [
  { key: 'partnerName', label: '合夥人' }, { key: 'dueAmount', label: '應分金額' }, { key: 'paidAmount', label: '已給付' },
  { key: 'paidDate', label: '給付日期' }, { key: 'status', label: '狀態' }, { key: 'updatedAt', label: '最後修改時間' },
];

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

export default function PartnersPage() {
  const { system, role, overrides } = useOutletContext();
  const { user } = useAuth();
  const canEditPage = computeCanEdit(system, 'incomeStatement', role, overrides);
  const { rows: partners, add: addPartner, update: updatePartner, remove: removePartner } = useCollection('foodfactory_partners');
  const { rows: payouts, add: addPayout, update: updatePayout } = useCollection('foodfactory_profitPayouts');
  const { rows: accountCategories } = useCollection('foodfactory_accountCategories');
  const { rows: manualLedgerEntries } = useCollection('foodfactory_manualLedgerEntries');
  const { rows: shipments } = useCollection('foodfactory_shipments');
  const { rows: purchases } = useCollection('foodfactory_purchases');
  const { rows: pettyCashTransactions } = useCollection('foodfactory_pettyCashTransactions');
  const { rows: productionExpenses } = useCollection('foodfactory_productionExpenses');
  const [month, setMonth] = useState(currentMonthStr());
  const [addingPartner, setAddingPartner] = useState(false);
  const [editingPartner, setEditingPartner] = useState(null);
  const [paying, setPaying] = useState(null);

  const statement = incomeStatementMonth(month, { accountCategories, manualLedgerEntries, shipments, purchases, pettyCashTransactions, productionExpenses });
  const monthPayouts = payouts.filter((p) => p.month === month);
  const partnerName = (id) => partners.find((p) => p.id === id)?.name || '(未知)';

  function handleDownloadPartners() {
    exportEntityCSV(partners, PARTNER_CSV_FIELDS, '合夥人');
  }

  function handleDownloadPayouts() {
    exportEntityCSV(monthPayouts.map((p) => ({ ...p, partnerName: partnerName(p.partnerId) })), PAYOUT_CSV_FIELDS, `合夥分潤_${month}`);
  }

  async function handleDeletePartner(partner) {
    await removePartner(partner.id);
    await logChange('合夥人', '刪除', partner.name, user?.email);
  }

  // 依當月淨利 × 分潤比例算應分金額，找得到既有紀錄就更新、找不到就新增（upsert），
  // 跟原本 computeProfitPayouts() 一致。
  async function computePayouts() {
    const updatedAt = nowIso();
    await Promise.all(partners.map(async (p) => {
      const due = (statement.netProfit * (Number(p.sharePct) || 0)) / 100;
      const existing = monthPayouts.find((e) => e.partnerId === p.id);
      if (existing) await updatePayout(existing.id, { dueAmount: due, updatedAt });
      else await addPayout({ month, partnerId: p.id, dueAmount: due, paidAmount: 0, paidDate: '', status: '未付', updatedAt });
    }));
    await logChange('合夥分潤', '試算/更新', month, user?.email);
  }

  async function markPaid(payout, paidAmount, paidDate) {
    const due = Number(payout.dueAmount) || 0;
    const status = Number(paidAmount) >= due ? '已付' : (Number(paidAmount) > 0 ? '部分給付' : '未付');
    await updatePayout(payout.id, { paidAmount, paidDate, status, updatedAt: nowIso() });
    await logChange('合夥分潤', '登錄給付', partnerName(payout.partnerId), user?.email);
    setPaying(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>損益表 · 合夥分潤</h2>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setAddingPartner(true)}>新增合夥人</button>}
          <button onClick={handleDownloadPartners}>下載合夥人資料</button>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>合夥人姓名</th><th>分潤比例</th><th>最後修改時間</th>{canEditPage && <th></th>}</tr></thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td><td>{p.sharePct}%</td>
                <td>{p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '—'}</td>
                {canEditPage && (
                  <td className="row-actions">
                    <button onClick={() => setEditingPartner(p)}>編輯</button>
                    <button className="danger" onClick={() => handleDeletePartner(p)}>刪除</button>
                  </td>
                )}
              </tr>
            ))}
            {partners.length === 0 && <tr><td colSpan={4} className="muted">沒有資料</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="page-header" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{month} 分潤試算（當月淨利 {Math.round(statement.netProfit).toLocaleString()}）</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            {canEditPage && <button onClick={computePayouts}>試算/更新分潤</button>}
            <button onClick={handleDownloadPayouts}>下載完整資料</button>
          </div>
        </div>
        <table>
          <thead><tr><th>合夥人</th><th>應分金額</th><th>已給付</th><th>給付日期</th><th>狀態</th><th>最後修改時間</th>{canEditPage && <th></th>}</tr></thead>
          <tbody>
            {monthPayouts.map((p) => (
              <tr key={p.id}>
                <td>{partnerName(p.partnerId)}</td>
                <td>{Math.round(p.dueAmount).toLocaleString()}</td>
                <td>{p.paidAmount || 0}</td>
                <td>{p.paidDate || '—'}</td>
                <td>{p.status}</td>
                <td>{p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '—'}</td>
                {canEditPage && <td><button onClick={() => setPaying(p)}>登錄給付</button></td>}
              </tr>
            ))}
            {monthPayouts.length === 0 && <tr><td colSpan={7} className="muted">尚未試算</td></tr>}
          </tbody>
        </table>
      </div>

      {addingPartner && (
        <PartnerFormModal
          onCancel={() => setAddingPartner(false)}
          onSave={async (data) => {
            await addPartner({ ...data, updatedAt: nowIso() });
            await logChange('合夥人', '新增', data.name, user?.email);
            setAddingPartner(false);
          }}
        />
      )}
      {editingPartner && (
        <PartnerFormModal
          initial={editingPartner}
          onCancel={() => setEditingPartner(null)}
          onSave={async (data) => {
            const { id, ...rest } = data;
            await updatePartner(id, { ...rest, updatedAt: nowIso() });
            await logChange('合夥人', '編輯', rest.name, user?.email);
            setEditingPartner(null);
          }}
        />
      )}
      {paying && <PayFormModal payout={paying} onCancel={() => setPaying(null)} onSave={markPaid} />}
    </div>
  );
}

function PartnerFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial || {});
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{form.id ? '編輯合夥人' : '新增合夥人'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>姓名<input required value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>分潤比例(%)<input type="number" required value={form.sharePct || ''} onChange={(e) => setForm({ ...form, sharePct: e.target.value })} /></label>
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

function PayFormModal({ payout, onCancel, onSave }) {
  const [paidAmount, setPaidAmount] = useState(payout.paidAmount || '');
  const [paidDate, setPaidDate] = useState(payout.paidDate || '');
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>登錄給付</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(payout, paidAmount, paidDate); }}>
          <div className="form-grid">
            <label>已給付金額<input type="number" required value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} /></label>
            <label>給付日期<input type="date" required value={paidDate} onChange={(e) => setPaidDate(e.target.value)} /></label>
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
