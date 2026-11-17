import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';
import { employerLabel, CURRENCIES, DEFAULT_CURRENCY, formatMoney, formatMoneyMap, sumByCurrency, subtractCurrencyMaps, canCloseFee } from './constants';

const PAYMENT_CATEGORIES = ['招募者獎金', '內部獎金', '其他支出', '機票費用', '簽證費用', '掛牌費用'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'recipient', label: '收款人' }, { key: 'category', label: '款項類別' },
  { key: 'workerId', label: '對應移工ID' }, { key: 'date', label: '支付日期' }, { key: 'amount', label: '金額' },
  { key: 'currency', label: '幣別' }, { key: 'note', label: '備註' },
];

// 支付紀錄：跟收費紀錄(ChargeRecordsPage.jsx)一樣，「招募者獎金」類別
// 的款項改成以「費用計算」每一筆設定彙總顯示——招募者獎金是費用計算
// 設定裡要付給招募人員的金額，已付招募者獎金是這個移工底下所有款項
// 類別為「招募者獎金」的支付紀錄加總，餘額是兩者差額。台仲收費也顯示
// 在同一列，但只是參考數字（元凱自己抽的部分，不是付給別人的錢，不
// 記錄它的「付款進度」）。
//
// 「內部獎金」「其他支出」這兩類款項不是按單一移工的費用計算金額去
// 追蹤（內部獎金是行政/會計/外務/主管每個案件固定一筆，可能同時對應
// 好幾位移工；其他支出常常不對應任何移工），沒辦法套進上面那個彙總
// 表，另外用原本的流水帳列表「其他支付紀錄」顯示在下面。
//
// 結案：跟費用計算/收費紀錄共用同一個 closed 欄位（存在費用計算設定
// 上），三邊互通，按一邊「結案」另外兩邊也會跟著收起來。
export default function PaymentRecordsPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'paymentRecords', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('laborAgency_paymentRecords');
  const { rows: workers } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');
  const { rows: feeSetups, update: updateFeeSetup } = useCollection('laborAgency_feeSetup');
  const { rows: users } = useCollection('laborAgency_users');
  const [editing, setEditing] = useState(null); // 新增/編輯單筆支付紀錄
  const [viewing, setViewing] = useState(null); // 查看某筆費用計算設定底下的所有支付紀錄
  const [q, setQ] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const { handleExport, handleImport } = useCsvOverwrite('laborAgency_paymentRecords', CSV_FIELDS, { entityLabel: '支付紀錄', requiredKeys: ['recipient'], canEdit: canEditPage });

  function workerOf(workerId) { return workers.find((w) => w.id === workerId); }
  function recordsOf(workerId) { return rows.filter((r) => r.workerId === workerId); }
  function paidRecruiterMapOf(workerId) {
    return sumByCurrency(recordsOf(workerId).filter((r) => r.category === '招募者獎金'), 'amount', 'currency');
  }

  const searchQuery = q.trim().toLowerCase();
  // 應付/已付招募者獎金/餘額都依幣別分開算，不轉換成同一個基準幣別
  // 加總（見 constants.js 的說明）。
  const summaries = feeSetups
    .filter((fs) => !searchQuery || (workerOf(fs.workerId)?.name || '').toLowerCase().includes(searchQuery))
    .map((fs) => {
      const paidMap = paidRecruiterMapOf(fs.workerId);
      const dueMap = { [fs.currency || DEFAULT_CURRENCY]: Number(fs.recruiterBonus) || 0 };
      return { feeSetup: fs, paidMap, balanceMap: subtractCurrencyMaps(dueMap, paidMap) };
    })
    .sort((a, b) => (workerOf(a.feeSetup.workerId)?.name || '').localeCompare(workerOf(b.feeSetup.workerId)?.name || ''));
  const openSummaries = summaries.filter((s) => s.feeSetup.closed !== '是');
  const closedSummaries = summaries.filter((s) => s.feeSetup.closed === '是');

  // 已結案的支付紀錄改成依「支付日期」的月份分組顯示（不是依移工彙總），
  // 每個月列出當月實際付出去的所有支付紀錄（不分款項類別），並加總
  // 當月的總計金額——結案後案件本身已經不會再變動，這時候看的是「這個
  // 月付了多少錢出去」的記帳角度，不是「這個案件還欠多少」。
  const closedWorkerIds = new Set(closedSummaries.map((s) => s.feeSetup.workerId));
  const closedRecords = rows.filter((r) => closedWorkerIds.has(r.workerId));
  const closedByMonth = {};
  closedRecords.forEach((r) => {
    const month = (r.date || '').slice(0, 7) || t('未知月份', lang);
    (closedByMonth[month] ||= []).push(r);
  });
  const closedMonths = Object.keys(closedByMonth).sort().reverse();

  // 「其他支付紀錄」：款項類別不是「招募者獎金」的，或是「招募者獎金」
  // 但對應的移工查無費用計算設定的（理論上不太會發生，先求保險不要
  // 讓資料憑空消失不顯示）。
  const otherRecords = rows
    .filter((r) => r.category !== '招募者獎金' || !feeSetups.some((fs) => fs.workerId === r.workerId))
    .filter((r) => !searchQuery || (r.recipient || '').toLowerCase().includes(searchQuery))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  async function handleSave(data) {
    const payload = { ...data, amount: Number(data.amount) || 0, currency: data.currency || DEFAULT_CURRENCY };
    if (data.id) {
      const { id, ...rest } = payload;
      await update(id, rest);
    } else {
      await add(payload);
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('支付紀錄', lang)}</h2>
          <div className="page-desc">{t('實際付出的款項日誌（招募者獎金、內部獎金或其他支出）', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          <input placeholder={t('搜尋收款人', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增支付紀錄', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <>
          <div className="card" style={{ overflowX: 'auto' }}>
            <SummaryTable list={openSummaries} workerOf={workerOf} employers={employers} canEditPage={canEditPage} setViewing={setViewing} setEditing={setEditing} updateFeeSetup={updateFeeSetup} lang={lang} />
          </div>
          <div style={{ margin: '12px 0' }}>
            <label className="row-actions" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} style={{ width: 'auto' }} />
              {t('顯示已結案名單', lang)}（{closedSummaries.length}）
            </label>
          </div>
          {showClosed && (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="row-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
                  {closedSummaries.map(({ feeSetup: fs }) => (
                    <span key={fs.id} className="tag tag-grey" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {workerOf(fs.workerId)?.name || '—'}
                      {canEditPage && <button onClick={() => updateFeeSetup(fs.id, { closed: '' })} className="small">{t('取消已結案', lang)}</button>}
                    </span>
                  ))}
                  {closedSummaries.length === 0 && <span className="muted">{t('沒有資料', lang)}</span>}
                </div>
              </div>
              <h3 style={{ marginTop: 0 }}>{t('已結案支付紀錄（依月份）', lang)}</h3>
              {closedMonths.length === 0 ? (
                <div className="card"><p className="muted" style={{ margin: 0 }}>{t('這個月沒有已結案的支付紀錄', lang)}</p></div>
              ) : closedMonths.map((month) => {
                const records = closedByMonth[month];
                const monthTotal = sumByCurrency(records, 'amount', 'currency');
                return (
                  <div className="card" key={month} style={{ marginBottom: 16, overflowX: 'auto' }}>
                    <div className="row-actions" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                      <h4 style={{ margin: 0 }}>{month}</h4>
                      <div className="muted">{t('本月總計', lang)}：{formatMoneyMap(monthTotal, lang)}</div>
                    </div>
                    <div className="table-wrap"><table>
                      <thead><tr><th>{t('支付日期', lang)}</th><th>{t('收款人', lang)}</th><th>{t('款項類別', lang)}</th><th>{t('對應移工', lang)}</th><th>{t('金額', lang)}</th><th>{t('備註', lang)}</th></tr></thead>
                      <tbody>
                        {records.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((r) => (
                          <tr key={r.id}>
                            <td>{r.date || '—'}</td>
                            <td style={{ fontWeight: 600 }}>{r.recipient || '—'}</td>
                            <td>{t(r.category, lang) || '—'}</td>
                            <td>{workerOf(r.workerId)?.name || '—'}</td>
                            <td>{formatMoney(r.amount, r.currency, lang)}</td>
                            <td className="muted">{r.note || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  </div>
                );
              })}
            </>
          )}

          <h3 style={{ marginTop: 24 }}>{t('其他支付紀錄', lang)}</h3>
          <div className="card" style={{ overflowX: 'auto' }}>
            <div className="table-wrap"><table>
              <thead><tr><th>{t('支付日期', lang)}</th><th>{t('收款人', lang)}</th><th>{t('款項類別', lang)}</th><th>{t('對應移工', lang)}</th><th>{t('金額', lang)}</th><th>{t('備註', lang)}</th>{canEditPage && <th></th>}</tr></thead>
              <tbody>
                {otherRecords.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{r.recipient || '—'}</td>
                    <td>{t(r.category, lang) || '—'}</td>
                    <td>{workerOf(r.workerId)?.name || '—'}</td>
                    <td>{formatMoney(r.amount, r.currency, lang)}</td>
                    <td className="muted">{r.note || '—'}</td>
                    {canEditPage && (
                      <td className="row-actions">
                        <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                        <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                      </td>
                    )}
                  </tr>
                ))}
                {otherRecords.length === 0 && <tr><td colSpan={canEditPage ? 7 : 6} className="muted">{t('尚未建立支付紀錄', lang)}</td></tr>}
              </tbody>
            </table></div>
          </div>
        </>
      )}
      {editing && <PaymentRecordFormModal initial={editing} workers={workers} feeSetups={feeSetups} users={users} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
      {viewing && (
        <PaymentDetailModal
          worker={workerOf(viewing.workerId)}
          records={recordsOf(viewing.workerId)}
          onClose={() => setViewing(null)}
          onEdit={(r) => setEditing(r)}
          onAdd={() => setEditing({ workerId: viewing.workerId, category: '招募者獎金' })}
          onRemove={(id) => remove(id)}
          lang={lang}
        />
      )}
    </div>
  );
}

// 獨立宣告在元件外面——寫在 PaymentRecordsPage 裡面的話，每次父元件
// 重新 render 都會產生新的函式參照，React 會當成不同的元件型別整個
// 重新掛載（這個頁面其他地方也有同樣的教訓，見 VisaProcessingPage.jsx
// 的註解）。
function SummaryTable({ list, workerOf, employers, canEditPage, setViewing, setEditing, updateFeeSetup, lang }) {
  return (
    <div className="table-wrap"><table>
      <thead>
        <tr>
          <th>{t('姓名', lang)}</th><th>{t('雇主', lang)}</th><th>{t('台仲收費', lang)}</th><th>{t('招募者獎金', lang)}</th>
          <th>{t('已付招募者獎金', lang)}</th><th>{t('餘額', lang)}</th><th>{t('支付審核', lang)}</th>{canEditPage && <th></th>}
        </tr>
      </thead>
      <tbody>
        {list.map(({ feeSetup: fs, paidMap, balanceMap }) => (
          <tr key={fs.id}>
            <td style={{ fontWeight: 600 }}>{workerOf(fs.workerId)?.name || '—'}</td>
            <td>{employerLabel(employers, fs.employerId, lang)}</td>
            <td className="muted">{formatMoney(fs.taiwanAgencyFee, fs.currency, lang)}</td>
            <td>{formatMoney(fs.recruiterBonus, fs.currency, lang)}</td>
            <td>{formatMoneyMap(paidMap, lang)}</td>
            <td style={{ fontWeight: 600 }}>{formatMoneyMap(balanceMap, lang)}</td>
            <td>
              <span className={`tag ${fs.paymentReviewed === '是' ? 'tag-green' : 'tag-grey'}`}>
                {fs.paymentReviewed === '是' ? t('審核完成', lang) : t('未審核', lang)}
              </span>
            </td>
            {canEditPage && (
              <td className="row-actions">
                <button onClick={() => setViewing(fs)}>{t('查看明細', lang)}</button>
                <button className="primary" onClick={() => setEditing({ workerId: fs.workerId, category: '招募者獎金' })}>+ {t('新增支付紀錄', lang)}</button>
                {fs.paymentReviewed === '是'
                  ? <button onClick={() => updateFeeSetup(fs.id, { paymentReviewed: '' })}>{t('取消審核', lang)}</button>
                  : <button onClick={() => updateFeeSetup(fs.id, { paymentReviewed: '是' })}>{t('審核完成', lang)}</button>}
                {fs.closed === '是'
                  ? <button onClick={() => updateFeeSetup(fs.id, { closed: '' })}>{t('取消已結案', lang)}</button>
                  : <button disabled={!canCloseFee(fs)} title={!canCloseFee(fs) ? t('需先完成收費與支付審核才能結案', lang) : ''} onClick={() => updateFeeSetup(fs.id, { closed: '是' })}>{t('結案', lang)}</button>}
              </td>
            )}
          </tr>
        ))}
        {list.length === 0 && <tr><td colSpan={canEditPage ? 7 : 6} className="muted">{t('尚未建立費用設定', lang)}</td></tr>}
      </tbody>
    </table></div>
  );
}

// 查看某一位移工底下所有支付紀錄的明細（不分款項類別，主列表的彙總
// 只看「招募者獎金」那一類，這裡列出這個移工名下全部的支付紀錄）。
function PaymentDetailModal({ worker, records, onClose, onEdit, onAdd, onRemove, lang }) {
  const sorted = [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: '100%' }}>
        <h3 style={{ marginTop: 0 }}>{worker?.name || '—'} － {t('支付紀錄', lang)}</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>{t('支付日期', lang)}</th><th>{t('款項類別', lang)}</th><th>{t('金額', lang)}</th><th></th></tr></thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td>{r.date || '—'}</td>
                <td>{t(r.category, lang) || '—'}</td>
                <td>{formatMoney(r.amount, r.currency, lang)}</td>
                <td className="row-actions">
                  <button onClick={() => onEdit(r)}>{t('編輯', lang)}</button>
                  <button className="danger" onClick={() => onRemove(r.id)}>{t('刪除', lang)}</button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={4} className="muted">{t('此移工目前沒有支付紀錄', lang)}</td></tr>}
          </tbody>
        </table></div>
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button type="button" className="primary" onClick={onAdd}>+ {t('新增支付紀錄', lang)}</button>
          <button type="button" onClick={onClose}>{t('關閉', lang)}</button>
        </div>
      </div>
    </div>
  );
}

// 對應移工選單改成帶入「費用計算」已設定好的名單（而不是整個移工
// 名冊），比照收費紀錄(ChargeRecordsPage.jsx)的做法；選了之後若款項
// 類別是「招募者獎金」且金額還沒填，自動帶入該筆設定的招募者獎金當作
// 預設金額，不用再手動對照費用計算的金額填一次。「其他支出」這類不
// 對應特定移工的款項，仍保留「（無）」選項。
function PaymentRecordFormModal({ initial, workers, feeSetups, users, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);

  function workerOf(workerId) { return workers.find((w) => w.id === workerId); }
  const sortedFeeSetups = [...feeSetups].sort((a, b) => (workerOf(a.workerId)?.name || '').localeCompare(workerOf(b.workerId)?.name || ''));
  const staffOptions = [...new Set((users || []).map((u) => u.displayName || u.email).filter(Boolean))].sort();

  function handleFeeSetupChange(feeSetupId) {
    const fs = feeSetups.find((f) => f.id === feeSetupId);
    if (!fs) { setForm({ ...form, workerId: '' }); return; }
    const isRecruiterBonus = form.category === '招募者獎金';
    setForm({ ...form, workerId: fs.workerId, amount: isRecruiterBonus ? (form.amount || fs.recruiterBonus || '') : form.amount });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯支付紀錄', lang) : t('新增支付紀錄', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('收款人', lang)}
              <input
                list="payment-recipient-options"
                required
                value={form.recipient || ''}
                placeholder={t('選擇或自行輸入姓名', lang)}
                onChange={(e) => setForm({ ...form, recipient: e.target.value })}
              />
              <datalist id="payment-recipient-options">
                {staffOptions.map((o) => <option key={o} value={o} />)}
              </datalist>
            </label>
            <label>
              {t('款項類別', lang)}
              <select value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">{t('請選擇', lang)}</option>
                {PAYMENT_CATEGORIES.map((o) => <option key={o} value={o}>{t(o, lang)}</option>)}
              </select>
            </label>
            <label>
              {t('對應移工', lang)}（{t('費用計算', lang)}）
              <select value={sortedFeeSetups.find((f) => f.workerId === form.workerId)?.id || ''} onChange={(e) => handleFeeSetupChange(e.target.value)}>
                <option value="">{t('（無）', lang)}</option>
                {sortedFeeSetups.map((f) => (
                  <option key={f.id} value={f.id}>{workerOf(f.workerId)?.name || '—'}（{(f.recruiterBonus || 0).toLocaleString()}）</option>
                ))}
              </select>
            </label>
            <label>
              {t('支付日期', lang)}
              <input type="date" required value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>
              {t('金額', lang)}
              <input type="number" required value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            <label>
              {t('幣別', lang)}
              <select value={form.currency || DEFAULT_CURRENCY} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{t(c, lang)}</option>)}
              </select>
            </label>
          </div>
          <label style={{ display: 'block', marginTop: 8 }}>
            {t('備註', lang)}
            <textarea rows={3} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ marginBottom: 16 }} />
          </label>
          <div className="row-actions">
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
