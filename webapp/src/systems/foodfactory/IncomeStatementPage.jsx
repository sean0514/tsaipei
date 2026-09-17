import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { incomeStatementMonth } from '../../lib/incomeStatement';
import { exportEntityCSV } from '../../lib/csv';
import { useAuth } from '../../auth/AuthContext';
import { logChange, nowIso } from '../../lib/changeLog';

const TYPES = ['收入', '變動成本', '固定成本'];
const AUTO_SOURCES = ['shipmentIncome', 'materialCost', 'pettyCashOther', 'productionExpense'];
const AUTO_SOURCE_LABELS = { shipmentIncome: '出貨收入', materialCost: '原料進貨成本', pettyCashOther: '零用金其他支出', productionExpense: '生產費用' };
const STATEMENT_CSV_FIELDS = [{ key: 'name', label: '科目' }, { key: 'type', label: '類型' }, { key: 'amount', label: '金額' }];

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

export default function IncomeStatementPage() {
  const { system, role, overrides } = useOutletContext();
  const { user } = useAuth();
  const canEditPage = computeCanEdit(system, 'incomeStatement', role, overrides);
  const { rows: accountCategories, add: addCategory, update: updateCategory, remove: removeCategory } = useCollection('foodfactory_accountCategories');
  const { rows: manualLedgerEntries, add: addEntry, update: updateEntry, remove: removeEntry } = useCollection('foodfactory_manualLedgerEntries');
  const { rows: shipments } = useCollection('foodfactory_shipments');
  const { rows: purchases } = useCollection('foodfactory_purchases');
  const { rows: pettyCashTransactions } = useCollection('foodfactory_pettyCashTransactions');
  const { rows: productionExpenses } = useCollection('foodfactory_productionExpenses');
  const [month, setMonth] = useState(currentMonthStr());
  const [addingCategory, setAddingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [addingEntry, setAddingEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

  const ctx = { accountCategories, manualLedgerEntries, shipments, purchases, pettyCashTransactions, productionExpenses };
  const statement = incomeStatementMonth(month, ctx);

  function handleDownload() {
    exportEntityCSV(statement.lines, STATEMENT_CSV_FIELDS, `損益表_${month}`);
  }

  async function handleDeleteCategory(category) {
    await removeCategory(category.id);
    await logChange('會計科目', '刪除', category.name, user?.email);
  }

  async function handleDeleteEntry(entry) {
    await removeEntry(entry.id);
    await logChange('手動分錄', '刪除', accountCategories.find((c) => c.id === entry.categoryId)?.name || '', user?.email);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>損益表</h2>
        <button onClick={handleDownload}>下載損益表</button>
      </div>
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ marginBottom: 12 }} />

      <div className="card" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>科目</th><th>類型</th><th>金額</th></tr></thead>
          <tbody>
            {statement.lines.map((l) => <tr key={l.categoryId}><td>{l.name}</td><td>{l.type}</td><td>{Math.round(l.amount).toLocaleString()}</td></tr>)}
          </tbody>
        </table>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 16 }}>
          <div><div style={{ fontSize: 20, fontWeight: 700 }}>{Math.round(statement.income).toLocaleString()}</div><div className="muted">收入</div></div>
          <div><div style={{ fontSize: 20, fontWeight: 700 }}>{Math.round(statement.grossProfit).toLocaleString()}</div><div className="muted">毛利（{(statement.grossMargin * 100).toFixed(1)}%）</div></div>
          <div><div style={{ fontSize: 20, fontWeight: 700 }}>{Math.round(statement.netProfit).toLocaleString()}</div><div className="muted">淨利（{(statement.netMargin * 100).toFixed(1)}%）</div></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="page-header" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>會計科目</h3>
          {canEditPage && <button onClick={() => setAddingCategory(true)}>新增科目</button>}
        </div>
        <table>
          <thead><tr><th>科目名稱</th><th>類型</th><th>資料來源</th><th>自動來源</th><th>最後修改時間</th>{canEditPage && <th></th>}</tr></thead>
          <tbody>
            {accountCategories.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td><td>{c.type}</td><td>{c.source === 'auto' ? '自動' : '手動輸入'}</td>
                <td>{c.source === 'auto' ? AUTO_SOURCE_LABELS[c.autoSource] : '—'}</td>
                <td>{c.updatedAt ? new Date(c.updatedAt).toLocaleString() : '—'}</td>
                {canEditPage && (
                  <td className="row-actions">
                    <button onClick={() => setEditingCategory(c)}>編輯</button>
                    <button className="danger" onClick={() => handleDeleteCategory(c)}>刪除</button>
                  </td>
                )}
              </tr>
            ))}
            {accountCategories.length === 0 && <tr><td colSpan={6} className="muted">沒有資料</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="page-header" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>手動分錄（{month}）</h3>
          {canEditPage && <button onClick={() => setAddingEntry(true)}>新增分錄</button>}
        </div>
        <table>
          <thead><tr><th>科目</th><th>對象</th><th>金額</th><th>備註</th><th>最後修改時間</th>{canEditPage && <th></th>}</tr></thead>
          <tbody>
            {manualLedgerEntries.filter((e) => e.month === month).map((e) => (
              <tr key={e.id}>
                <td>{accountCategories.find((c) => c.id === e.categoryId)?.name || '(未知)'}</td>
                <td>{e.counterparty || '—'}</td><td>{e.amount}</td><td>{e.note || '—'}</td>
                <td>{e.updatedAt ? new Date(e.updatedAt).toLocaleString() : '—'}</td>
                {canEditPage && (
                  <td className="row-actions">
                    <button onClick={() => setEditingEntry(e)}>編輯</button>
                    <button className="danger" onClick={() => handleDeleteEntry(e)}>刪除</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addingCategory && (
        <CategoryFormModal
          onCancel={() => setAddingCategory(false)}
          onSave={async (data) => {
            await addCategory({ ...data, updatedAt: nowIso() });
            await logChange('會計科目', '新增', data.name, user?.email);
            setAddingCategory(false);
          }}
        />
      )}
      {editingCategory && (
        <CategoryFormModal
          initial={editingCategory}
          onCancel={() => setEditingCategory(null)}
          onSave={async (data) => {
            const { id, ...rest } = data;
            await updateCategory(id, { ...rest, updatedAt: nowIso() });
            await logChange('會計科目', '編輯', rest.name, user?.email);
            setEditingCategory(null);
          }}
        />
      )}
      {addingEntry && (
        <EntryFormModal
          month={month}
          categories={accountCategories.filter((c) => c.source !== 'auto')}
          onCancel={() => setAddingEntry(false)}
          onSave={async (data) => {
            await addEntry({ ...data, updatedAt: nowIso() });
            await logChange('手動分錄', '新增', accountCategories.find((c) => c.id === data.categoryId)?.name || '', user?.email);
            setAddingEntry(false);
          }}
        />
      )}
      {editingEntry && (
        <EntryFormModal
          month={month}
          categories={accountCategories.filter((c) => c.source !== 'auto')}
          initial={editingEntry}
          onCancel={() => setEditingEntry(null)}
          onSave={async (data) => {
            const { id, ...rest } = data;
            await updateEntry(id, { ...rest, updatedAt: nowIso() });
            await logChange('手動分錄', '編輯', accountCategories.find((c) => c.id === rest.categoryId)?.name || '', user?.email);
            setEditingEntry(null);
          }}
        />
      )}
    </div>
  );
}

function CategoryFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial || { type: '收入', source: 'manual' });
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{form.id ? '編輯會計科目' : '新增會計科目'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>科目名稱<input required value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>
              類型
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>
              資料來源
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                <option value="manual">手動輸入</option>
                <option value="auto">自動彙總</option>
              </select>
            </label>
            {form.source === 'auto' && (
              <label>
                自動來源對應
                <select value={form.autoSource || ''} onChange={(e) => setForm({ ...form, autoSource: e.target.value })}>
                  <option value="">請選擇</option>
                  {AUTO_SOURCES.map((s) => <option key={s} value={s}>{AUTO_SOURCE_LABELS[s]}</option>)}
                </select>
              </label>
            )}
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

function EntryFormModal({ month, categories, initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial || { month });
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{form.id ? '編輯手動分錄' : '新增手動分錄'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              科目
              <select required value={form.categoryId || ''} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="" disabled>請選擇</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>對象<input value={form.counterparty || ''} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} /></label>
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
