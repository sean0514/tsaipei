import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { computeClientBillingForMonth, currentMonthStr } from '../../lib/bonus';
import { computeClientInvoice } from '../../lib/clientInvoice';
import { downloadClientInvoiceXlsx } from '../../lib/clientInvoiceXlsx';
import { downloadFilledXlsxTemplate } from '../../lib/xlsxExport';
import { fillInvoiceTemplate, parseCellMap, base64ToArrayBuffer } from '../../lib/clientInvoiceTemplate';
import { t } from '../../lib/i18n';

function parseJson(json, fallback) {
  try { return json ? JSON.parse(json) : fallback; } catch { return fallback; }
}

// 複製自 systems/tsaipei/ClientBillingPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。lib/clientInvoice*、lib/bonus.js、
// lib/xlsxExport.js 都是跨系統共用的純邏輯，不用額外複製。
export default function ClientBillingPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'clientBilling', role, overrides);
  const { rows: students } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: positions } = useCollection('vietnam_positions');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: inTaiwanVisaRecords } = useCollection('vietnam_inTaiwanVisa');
  const { rows: clientFeeSetupRecords } = useCollection('vietnam_clientFeeSetup');
  const { rows: dailyExpenseApplications } = useCollection('vietnam_dailyExpenseApplications');
  const { rows: locks, add: addLock, remove: removeLock } = useCollection('vietnam_clientBillingLocks');
  const [month, setMonth] = useState(currentMonthStr());
  const [busyKey, setBusyKey] = useState(null);

  const ctx = { students, matches, positions, admittedList, inTaiwanVisaRecords, clientFeeSetupRecords, dailyExpenseApplications };
  const liveRows = computeClientBillingForMonth(month, ctx);

  function lockFor(row) {
    return locks.find((l) => l.month === month && l.projectCode === row.projectCode && l.client === row.client) || null;
  }

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

  return (
    <div className="content">
      <div className="page-header"><div><h2>{t('客戶請款計算', lang)}</h2><div className="page-desc">{t('依月份自動試算：客戶費用建檔金額 ÷ 當月天數 × 學生當月在台天數，以實習單位（專案＋客戶）加總', lang)}</div></div></div>
      <p className="muted">{t('依月份自動試算：依「實習單位（專案編號＋客戶）」把所有學生當月在台天數加總，乘以客戶費用建檔的月費率÷當月天數。', lang)}</p>
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ marginBottom: 12 }} />
      <ClientBillingChart rows={rows} lang={lang} />
      <div className="card" style={{ overflowX: 'auto' }}>
        <div className="table-wrap"><table>
          <thead><tr><th>{t('客戶', lang)}</th><th>{t('專案編號', lang)}</th><th>{t('辦件費(未稅)', lang)}</th><th>{t('服務費(未稅)', lang)}</th><th>{t('宿舍費(未稅)', lang)}</th><th>{t('宿管費(未稅)', lang)}</th><th>{t('代墊費用(鈞羽未稅)', lang)}</th><th>{t('稅金5%', lang)}</th><th>{t('代墊費用(供應商)', lang)}</th><th>{t('合計總額', lang)}</th><th>{t('在台總天數', lang)}</th><th>{t('狀態', lang)}</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const key = `${r.projectCode}||${r.client}`;
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
                  <td>{r.totalDays} {t('天', lang)}</td>
                  <td>{r.locked ? <span className="tag tag-green">{t('已封存', lang)}</span> : <span className="muted">{t('即時試算', lang)}</span>}</td>
                  <td className="row-actions">
                    <button disabled={busyKey === key} onClick={() => handleDownload(r)}>{busyKey === key ? t('產生中…', lang) : t('下載請款單', lang)}</button>
                    {canEditPage && (r.locked
                      ? <button onClick={() => handleUnlock(r)}>{t('取消確認', lang)}</button>
                      : <button className="primary" onClick={() => handleConfirm(r)}>{t('確認封存', lang)}</button>)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={13} className="muted">{t('沒有資料', lang)}</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

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

function ClientBillingChart({ rows, lang }) {
  if (!rows.length) return null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>{t('當月各分類總額', lang)}</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        {CATEGORY_TOTALS.map((cat) => {
          const sum = rows.reduce((s, r) => s + (cat.fromAmounts ? (r.amounts[cat.key] || 0) : (r[cat.key] || 0)), 0);
          return (
            <div key={cat.key}>
              <div className="muted" style={{ fontSize: 13 }}>{t(cat.label, lang)}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{sum.toLocaleString()}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
