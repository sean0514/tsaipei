import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { computeClientBillingForMonth, currentMonthStr } from '../../lib/bonus';
import { computeClientInvoice } from '../../lib/clientInvoice';
import { downloadClientInvoiceXlsx } from '../../lib/clientInvoiceXlsx';
import { downloadFilledXlsxTemplate } from '../../lib/xlsxExport';
import { fillInvoiceTemplate, parseCellMap, base64ToArrayBuffer } from '../../lib/clientInvoiceTemplate';

function parseJson(json, fallback) {
  try { return json ? JSON.parse(json) : fallback; } catch { return fallback; }
}

// 可以直接手動修改的金額欄位（辦件費～代墊費用供應商），稅金/合計總額是
// 算出來的，不開放直接改。
const EDITABLE_AMOUNT_FIELDS = [
  'monthlyProcessingFee', 'monthlyServiceFee', 'monthlyDormFee', 'monthlyDormManageFee',
  'dailyExpenseChargeJunyu', 'dailyExpenseChargeSupplier',
];
// 稅金只對這幾項(不含代墊費用供應商)課徵，跟 lib/bonus.js
// computeClientBillingForMonth 的稅金公式一致。
const TAXABLE_AMOUNT_FIELDS = EDITABLE_AMOUNT_FIELDS.filter((k) => k !== 'dailyExpenseChargeSupplier');

export default function ClientBillingPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'clientBilling', role, overrides);
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: inTaiwanVisaRecords } = useCollection('tsaipei_inTaiwanVisa');
  const { rows: clientFeeSetupRecords } = useCollection('tsaipei_clientFeeSetup');
  const { rows: dailyExpenseApplications } = useCollection('tsaipei_dailyExpenseApplications');
  const { rows: housingRecords } = useCollection('tsaipei_housingRecords');
  const { rows: locks, add: addLock, update: updateLock, remove: removeLock } = useCollection('tsaipei_clientBillingLocks');
  const [month, setMonth] = useState(currentMonthStr());
  const [busyKey, setBusyKey] = useState(null);
  const [editKey, setEditKey] = useState(null);
  const [editValues, setEditValues] = useState(null);

  const ctx = { students, matches, positions, admittedList, inTaiwanVisaRecords, clientFeeSetupRecords, dailyExpenseApplications, housingRecords };
  const liveRows = computeClientBillingForMonth(month, ctx);

  function lockFor(row) {
    return locks.find((l) => l.month === month && l.projectCode === row.projectCode && l.client === row.client) || null;
  }

  // 已確認封存的客戶／專案，表格顯示封存當下的固定數字，不再隨原始資料
  // (客戶費用建檔、在台簽證、日常支出申請…) 異動重算，避免事後資料變更
  // 影響已經對過帳、下載過的請款紀錄。
  const rows = liveRows.map((r) => {
    const lock = lockFor(r);
    if (!lock) return { ...r, locked: false };
    return { ...r, ...parseJson(lock.billingRow, {}), locked: true, lockId: lock.id };
  });

  async function handleDownload(row) {
    const key = `${row.projectCode}||${row.client}`;
    setBusyKey(key);
    try {
      const lock = lockFor(row);
      const invoice = lock ? parseJson(lock.invoice, null) : computeClientInvoice(row.projectCode, row.client, month, ctx);
      if (!invoice) {
        alert('此專案／客戶在該月份沒有可計算的學生資料，請確認在台簽證追蹤與客戶費用建檔是否都已設定。');
        return;
      }
      const feeSetup = clientFeeSetupRecords.find((r) => (r.projectCode || '') === (row.projectCode || '') && r.client === row.client);
      if (feeSetup?.invoiceTemplateData) {
        const cellMap = parseCellMap(feeSetup.invoiceCellMap);
        const templateBuffer = base64ToArrayBuffer(feeSetup.invoiceTemplateData);
        const filename = feeSetup.invoiceTemplateName || `${row.client}_請款單.xlsx`;
        await downloadFilledXlsxTemplate(filename, templateBuffer, (workbook) => {
          fillInvoiceTemplate(workbook, invoice, row.client, row.projectCode, cellMap);
        });
      } else {
        await downloadClientInvoiceXlsx(row.client, invoice);
      }
    } finally {
      setBusyKey(null);
    }
  }

  // 確認封存：把這個客戶／專案當下算出來的表格數字跟請款單內容（給下載
  // 用）各存一份 JSON，之後原始資料再怎麼改，這筆紀錄都維持封存當下的
  // 樣子，直到按「取消確認」解除封存。
  async function handleConfirm(row) {
    try {
      const invoice = computeClientInvoice(row.projectCode, row.client, month, ctx);
      if (!invoice) {
        alert('此專案／客戶在該月份沒有可計算的學生資料，無法封存。');
        return;
      }
      const billingRow = { amounts: row.amounts, tax: row.tax, total: row.total, totalDays: row.totalDays };
      await addLock({
        month, projectCode: row.projectCode, client: row.client,
        billingRow: JSON.stringify(billingRow), invoice: JSON.stringify(invoice),
        lockedAt: new Date().toISOString(),
      });
    } catch (err) {
      alert(`封存失敗：${err.message || err}`);
    }
  }

  async function handleUnlock(row) {
    if (!window.confirm(`確定要取消封存「${row.client}」${month} 的請款紀錄嗎？取消後表格會改回即時重算的數字。`)) return;
    try {
      await removeLock(row.lockId);
    } catch (err) {
      alert(`取消封存失敗：${err.message || err}`);
    }
  }

  function handleStartEdit(row) {
    setEditKey(`${row.projectCode}||${row.client}`);
    setEditValues({
      totalDays: row.totalDays,
      monthlyProcessingFee: row.amounts.monthlyProcessingFee || 0,
      monthlyServiceFee: row.amounts.monthlyServiceFee || 0,
      monthlyDormFee: row.amounts.monthlyDormFee || 0,
      monthlyDormManageFee: row.amounts.monthlyDormManageFee || 0,
      dailyExpenseChargeJunyu: row.amounts.dailyExpenseChargeJunyu || 0,
      dailyExpenseChargeSupplier: row.amounts.dailyExpenseChargeSupplier || 0,
    });
  }

  function handleCancelEdit() {
    setEditKey(null);
    setEditValues(null);
  }

  // 手動修改：把編輯後的數字存成跟「確認封存」一樣的封存快照（稅金/合計
  // 總額照公式重算），之後原始資料再怎麼異動都維持人工修正過的數字，直到
  // 按「取消確認」解除封存才會改回即時試算。這筆客戶/專案如果本來就已經
  // 封存，直接更新同一筆封存紀錄；還沒封存的話，順便建立封存（請款單下載
  // 用的 invoice 明細照目前即時資料算一份存起來）。
  async function handleSaveEdit(row) {
    const v = editValues;
    const amounts = { ...row.amounts };
    EDITABLE_AMOUNT_FIELDS.forEach((k) => { amounts[k] = Number(v[k]) || 0; });
    const taxableAmount = TAXABLE_AMOUNT_FIELDS.reduce((s, k) => s + amounts[k], 0);
    const tax = Math.round(taxableAmount * 0.05);
    const total = taxableAmount + tax + amounts.dailyExpenseChargeSupplier;
    const billingRow = { amounts, tax, total, totalDays: Number(v.totalDays) || 0 };
    try {
      const lock = lockFor(row);
      if (lock) {
        await updateLock(lock.id, { billingRow: JSON.stringify(billingRow) });
      } else {
        const invoice = computeClientInvoice(row.projectCode, row.client, month, ctx);
        await addLock({
          month, projectCode: row.projectCode, client: row.client,
          billingRow: JSON.stringify(billingRow), invoice: invoice ? JSON.stringify(invoice) : null,
          lockedAt: new Date().toISOString(),
        });
      }
      setEditKey(null);
      setEditValues(null);
    } catch (err) {
      alert(`儲存失敗：${err.message || err}`);
    }
  }

  return (
    <div className="content">
      <div className="page-header"><div><h2>客戶請款計算</h2><div className="page-desc">依月份自動試算：客戶費用建檔金額 ÷ 當月天數 × 學生當月在台天數，以實習單位（專案＋客戶）加總</div></div></div>
      <p className="muted">依月份自動試算：依「實習單位（專案編號＋客戶）」把所有學生當月在台天數加總，乘以客戶費用建檔的月費率÷當月天數。</p>
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ marginBottom: 12 }} />
      <ClientBillingChart rows={rows} />
      <div className="card" style={{ overflowX: 'auto' }}>
        <div className="table-wrap"><table>
          <thead><tr><th>客戶</th><th>專案編號</th><th>辦件費(未稅)</th><th>服務費(未稅)</th><th>宿舍費(未稅)</th><th>宿管費(未稅)</th><th>代墊費用(鈞羽未稅)</th><th>稅金5%</th><th>代墊費用(供應商)</th><th>合計總額</th><th>在台總天數</th><th>狀態</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const key = `${r.projectCode}||${r.client}`;
              const editing = editKey === key;
              if (editing) {
                const v = editValues;
                const setField = (field) => (e) => setEditValues({ ...v, [field]: e.target.value });
                return (
                  <tr key={key}>
                    <td>{r.client || '—'}</td>
                    <td>{r.projectCode}</td>
                    <td><input type="number" value={v.monthlyProcessingFee} onChange={setField('monthlyProcessingFee')} style={{ width: 90 }} /></td>
                    <td><input type="number" value={v.monthlyServiceFee} onChange={setField('monthlyServiceFee')} style={{ width: 90 }} /></td>
                    <td><input type="number" value={v.monthlyDormFee} onChange={setField('monthlyDormFee')} style={{ width: 90 }} /></td>
                    <td><input type="number" value={v.monthlyDormManageFee} onChange={setField('monthlyDormManageFee')} style={{ width: 90 }} /></td>
                    <td><input type="number" value={v.dailyExpenseChargeJunyu} onChange={setField('dailyExpenseChargeJunyu')} style={{ width: 90 }} /></td>
                    <td className="muted">自動計算</td>
                    <td><input type="number" value={v.dailyExpenseChargeSupplier} onChange={setField('dailyExpenseChargeSupplier')} style={{ width: 90 }} /></td>
                    <td className="muted">自動計算</td>
                    <td><input type="number" value={v.totalDays} onChange={setField('totalDays')} style={{ width: 60 }} /></td>
                    <td><span className="muted">編輯中</span></td>
                    <td className="row-actions">
                      <button className="primary" onClick={() => handleSaveEdit(r)}>儲存</button>
                      <button onClick={handleCancelEdit}>取消</button>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={key}>
                  <td>{r.client || '—'}</td>
                  <td>{r.projectCode}</td>
                  <td>{(r.amounts.monthlyProcessingFee || 0).toLocaleString()}</td>
                  <td>{(r.amounts.monthlyServiceFee || 0).toLocaleString()}</td>
                  <td>{(r.amounts.monthlyDormFee || 0).toLocaleString()}</td>
                  <td>{(r.amounts.monthlyDormManageFee || 0).toLocaleString()}</td>
                  <td>{(r.amounts.dailyExpenseChargeJunyu || 0).toLocaleString()}</td>
                  <td>{(r.tax || 0).toLocaleString()}</td>
                  <td>{(r.amounts.dailyExpenseChargeSupplier || 0).toLocaleString()}</td>
                  <td>{r.total.toLocaleString()}</td>
                  <td>{r.totalDays} 天</td>
                  <td>{r.locked ? <span className="tag tag-green">已封存</span> : <span className="muted">即時試算</span>}</td>
                  <td className="row-actions">
                    <button disabled={busyKey === key} onClick={() => handleDownload(r)}>{busyKey === key ? '產生中…' : '下載請款單'}</button>
                    {canEditPage && <button onClick={() => handleStartEdit(r)}>編輯</button>}
                    {canEditPage && (r.locked
                      ? <button onClick={() => handleUnlock(r)}>取消確認</button>
                      : <button className="primary" onClick={() => handleConfirm(r)}>確認封存</button>)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={13} className="muted">沒有資料</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

// 不畫圖，只把表格裡的每個金額欄位(辦件費/服務費/.../代墊費用供應商)
// 跨所有客戶加總，顯示當月各分類的總額數字。
const CATEGORY_TOTALS = [
  { key: 'monthlyProcessingFee', label: '辦件費(未稅)', fromAmounts: true },
  { key: 'monthlyServiceFee', label: '服務費(未稅)', fromAmounts: true },
  { key: 'monthlyDormFee', label: '宿舍費(未稅)', fromAmounts: true },
  { key: 'monthlyDormManageFee', label: '宿管費(未稅)', fromAmounts: true },
  { key: 'dailyExpenseChargeJunyu', label: '代墊費用(鈞羽未稅)', fromAmounts: true },
  { key: 'tax', label: '稅金5%', fromAmounts: false },
  { key: 'dailyExpenseChargeSupplier', label: '代墊費用(供應商)', fromAmounts: true },
  { key: 'total', label: '合計總額', fromAmounts: false },
];

function ClientBillingChart({ rows }) {
  if (!rows.length) return null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>當月各分類總額</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        {CATEGORY_TOTALS.map((cat) => {
          const sum = rows.reduce((s, r) => s + (cat.fromAmounts ? (r.amounts[cat.key] || 0) : (r[cat.key] || 0)), 0);
          return (
            <div key={cat.key}>
              <div className="muted" style={{ fontSize: 13 }}>{cat.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{sum.toLocaleString()}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
