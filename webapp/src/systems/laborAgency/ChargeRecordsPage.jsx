import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';
import { employerLabel, CURRENCIES, DEFAULT_CURRENCY, formatMoney, formatMoneyMap, sumByCurrency, subtractCurrencyMaps, canCloseFee } from './constants';

const CHARGE_TARGETS = ['工人', '招募'];
// 收費項目除了這幾個常見類別，也可以自己輸入新的項目名稱（見下面
// ChargeRecordAddModal/ChargeRecordEditModal 的 datalist 做法，跟支付
// 紀錄「收款人」欄位同一套模式），不是寫死只能選這幾項。
const CHARGE_ITEM_PRESETS = ['訂金', '預付款', '尾款', '其他費用'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'workerId', label: '移工ID' }, { key: 'date', label: '收費日期' },
  { key: 'item', label: '收費項目' }, { key: 'amount', label: '金額' }, { key: 'currency', label: '幣別' },
  { key: 'chargeTarget', label: '收費對象' }, { key: 'note', label: '備註' },
];

// 收費紀錄：畫面改成以「費用計算」每一筆設定（一位移工配對一個雇主
// 一筆）彙總顯示——應繳費用是費用計算設定的總金額，已繳費用是這個
// 移工底下所有收費紀錄（可能有訂金/預付款/尾款/其他費用好幾筆）加總，
// 餘額是兩者差額，不用自己心算還差多少沒收。個別的收費紀錄（哪一天
// 收了哪個項目多少錢）透過「查看明細」另外開視窗看，不是每一筆都直接
// 列在主列表，不然同一位移工收好幾次款項主列表會拆成好幾行、看不出
// 整體收款進度。
//
// 已繳費用是用 workerId（不是 workerId+employerId）加總所有收費紀錄
// ——收費紀錄本身沒有記錄是對應哪一筆雇主配對，如果同一位移工同時
// 配對多個雇主、各自有費用計算設定，已繳費用這裡沒辦法正確拆開算，
// 是既有資料結構的限制，不是這次新增的彙總邏輯造成的；多數情況一位
// 移工只有一筆費用計算，不受影響。
//
// 結案：比照「雇主需求單」已結案職缺的做法（見 tsaipei/PositionsPage.jsx），
// 存在費用計算設定的 closed 欄位（'是'/''），結案後從主列表收起、移到
// 下方「已結案」收合區塊，資料還在，可以「取消已結案」移回來，不是
// 刪除。
export default function ChargeRecordsPage() {
  const { system, role, overrides, lang, userDisplayName } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'chargeRecords', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('laborAgency_chargeRecords');
  const { rows: workers } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');
  const { rows: feeSetups, update: updateFeeSetup } = useCollection('laborAgency_feeSetup');
  const [editing, setEditing] = useState(null); // 新增/編輯單筆收費紀錄
  const [viewing, setViewing] = useState(null); // 查看某筆費用計算設定底下的所有收費紀錄
  const [q, setQ] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  // 移工ID欄位如果填了一個查不到對應移工的 ID，畫面上的姓名就會顯示
  // 「—」，看起來像這筆資料是空的——擋掉這種查無對應移工的列，不讓它
  // 匯入進來（比照費用計算 FeeSetupPage.jsx 的同一套檢查）。
  const { handleExport, handleImport } = useCsvOverwrite('laborAgency_chargeRecords', CSV_FIELDS, {
    entityLabel: '收費紀錄',
    requiredKeys: ['workerId'],
    validateRow: (row) => workers.some((w) => w.id === row.workerId),
    canEdit: canEditPage,
  });

  function workerOf(workerId) { return workers.find((w) => w.id === workerId); }
  function recordsOf(workerId) { return rows.filter((r) => r.workerId === workerId); }

  const searchQuery = q.trim().toLowerCase();
  // 應繳/已繳/餘額都依幣別分開算，不轉換成同一個基準幣別加總——同一
  // 位移工可能分好幾筆用不同幣別收款（見 constants.js 的說明）。
  const summaries = feeSetups
    .filter((fs) => !searchQuery || (workerOf(fs.workerId)?.name || '').toLowerCase().includes(searchQuery))
    .map((fs) => {
      const paidMap = sumByCurrency(recordsOf(fs.workerId), 'amount', 'currency');
      const dueMap = { [fs.currency || DEFAULT_CURRENCY]: Number(fs.totalFee) || 0 };
      return { feeSetup: fs, paidMap, balanceMap: subtractCurrencyMaps(dueMap, paidMap) };
    })
    .sort((a, b) => (workerOf(a.feeSetup.workerId)?.name || '').localeCompare(workerOf(b.feeSetup.workerId)?.name || ''));
  const openSummaries = summaries.filter((s) => s.feeSetup.closed !== '是');
  const closedSummaries = summaries.filter((s) => s.feeSetup.closed === '是');

  async function handleSave(data) {
    const payload = { ...data, amount: Number(data.amount) || 0, currency: data.currency || DEFAULT_CURRENCY };
    const { id, ...rest } = payload;
    await update(id, rest);
    setEditing(null);
  }

  // 新增收費一次可以填好幾列（訂金/預付款/尾款可能同一次登打，日期也
  // 可能各自不同），逐列各自呼叫 add() 存成獨立一筆 laborAgency_chargeRecords
  // 文件——跟既有單筆收費紀錄的資料結構完全一樣，只是這裡一次送出多筆。
  async function handleSaveMultiple(workerId, newRows) {
    const validRows = newRows.filter((r) => r.date || r.item || r.amount);
    await Promise.all(validRows.map((r) => add({
      workerId,
      date: r.date || '',
      item: r.item || '',
      amount: Number(r.amount) || 0,
      currency: r.currency || DEFAULT_CURRENCY,
      chargeTarget: r.chargeTarget || '',
      note: r.note || '',
    })));
    setEditing(null);
  }

  // 審核／覆核各自記錄按下當下登入人員的姓名，不只是一個是/否的勾選
  // ——覆核要先完成審核才能按，兩個關卡各自獨立的核准人（canCloseFee
  // 判斷只看覆核是否完成，見 constants.js 的說明）。
  function handleReview(fs) {
    updateFeeSetup(fs.id, { chargeReviewed: '是', chargeReviewedBy: userDisplayName, chargeReviewedAt: Date.now() });
  }
  function handleUnreview(fs) {
    updateFeeSetup(fs.id, { chargeReviewed: '', chargeReviewedBy: '', chargeReviewedAt: '' });
  }
  function handleCountersign(fs) {
    updateFeeSetup(fs.id, { chargeCountersigned: '是', chargeCountersignedBy: userDisplayName, chargeCountersignedAt: Date.now() });
  }
  function handleUncountersign(fs) {
    updateFeeSetup(fs.id, { chargeCountersigned: '', chargeCountersignedBy: '', chargeCountersignedAt: '' });
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('收費紀錄', lang)}</h2>
          <div className="page-desc">{t('實際向工人或招募人員收到款項的日誌', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          <input placeholder={t('搜尋姓名', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增收費紀錄', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <>
          <div className="card" style={{ overflowX: 'auto' }}>
            <SummaryTable
              list={openSummaries} workerOf={workerOf} employers={employers} canEditPage={canEditPage}
              setViewing={setViewing} setEditing={setEditing}
              onReview={handleReview} onUnreview={handleUnreview} onCountersign={handleCountersign} onUncountersign={handleUncountersign}
              updateFeeSetup={updateFeeSetup} lang={lang}
            />
          </div>
          <div style={{ margin: '12px 0' }}>
            <label className="row-actions" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} style={{ width: 'auto' }} />
              {t('顯示已結案名單', lang)}（{closedSummaries.length}）
            </label>
          </div>
          {showClosed && (
            <div className="card" style={{ overflowX: 'auto' }}>
              <SummaryTable
                list={closedSummaries} workerOf={workerOf} employers={employers} canEditPage={canEditPage}
                setViewing={setViewing} setEditing={setEditing}
                onReview={handleReview} onUnreview={handleUnreview} onCountersign={handleCountersign} onUncountersign={handleUncountersign}
                updateFeeSetup={updateFeeSetup} lang={lang}
              />
            </div>
          )}
        </>
      )}
      {editing && (editing.id
        ? <ChargeRecordEditModal initial={editing} feeSetups={feeSetups} workerOf={workerOf} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />
        : <ChargeRecordAddModal initial={editing} workers={workers} feeSetups={feeSetups} onCancel={() => setEditing(null)} onSave={handleSaveMultiple} lang={lang} />
      )}
      {viewing && (
        <ChargeDetailModal
          worker={workerOf(viewing.workerId)}
          records={recordsOf(viewing.workerId)}
          onClose={() => setViewing(null)}
          onEdit={(r) => setEditing(r)}
          onAdd={() => setEditing({ workerId: viewing.workerId })}
          onRemove={(id) => remove(id)}
          lang={lang}
        />
      )}
    </div>
  );
}

// 獨立宣告在元件外面——寫在 ChargeRecordsPage 裡面的話，每次父元件
// 重新 render 都會產生新的函式參照，React 會當成不同的元件型別整個
// 重新掛載（這個頁面其他地方也有同樣的教訓，見 VisaProcessingPage.jsx
// 的註解）。
function SummaryTable({ list, workerOf, employers, canEditPage, setViewing, setEditing, onReview, onUnreview, onCountersign, onUncountersign, updateFeeSetup, lang }) {
  return (
    <div className="table-wrap"><table>
      <thead>
        <tr>
          <th>{t('姓名', lang)}</th><th>{t('雇主', lang)}</th><th>{t('應繳費用', lang)}</th>
          <th>{t('已繳費用', lang)}</th><th>{t('餘額', lang)}</th><th>{t('審核', lang)}</th><th>{t('覆核', lang)}</th>{canEditPage && <th></th>}
        </tr>
      </thead>
      <tbody>
        {list.map(({ feeSetup: fs, paidMap, balanceMap }) => (
          <tr key={fs.id}>
            <td style={{ fontWeight: 600 }}>{workerOf(fs.workerId)?.name || '—'}</td>
            <td>{employerLabel(employers, fs.employerId, lang)}</td>
            <td>{formatMoney(fs.totalFee, fs.currency, lang)}</td>
            <td>{formatMoneyMap(paidMap, lang)}</td>
            <td style={{ fontWeight: 600 }}>{formatMoneyMap(balanceMap, lang)}</td>
            <td>
              <ReviewTag done={fs.chargeReviewed === '是'} doneLabel={t('審核完成', lang)} notDoneLabel={t('未審核', lang)} approverName={fs.chargeReviewedBy} approvedAt={fs.chargeReviewedAt} lang={lang} />
            </td>
            <td>
              <ReviewTag done={fs.chargeCountersigned === '是'} doneLabel={t('覆核完成', lang)} notDoneLabel={t('未覆核', lang)} approverName={fs.chargeCountersignedBy} approvedAt={fs.chargeCountersignedAt} lang={lang} />
            </td>
            {canEditPage && (
              <td className="row-actions">
                <button onClick={() => setViewing(fs)}>{t('查看明細', lang)}</button>
                <button className="primary" onClick={() => setEditing({ workerId: fs.workerId })}>+ {t('新增收費', lang)}</button>
                {fs.chargeReviewed === '是'
                  ? (fs.chargeCountersigned !== '是' && <button onClick={() => onUnreview(fs)}>{t('取消審核', lang)}</button>)
                  : <button onClick={() => onReview(fs)}>{t('審核完成', lang)}</button>}
                {fs.chargeReviewed === '是' && (fs.chargeCountersigned === '是'
                  ? <button onClick={() => onUncountersign(fs)}>{t('取消覆核', lang)}</button>
                  : <button onClick={() => onCountersign(fs)}>{t('覆核完成', lang)}</button>)}
                {fs.closed === '是'
                  ? <button onClick={() => updateFeeSetup(fs.id, { closed: '' })}>{t('取消已結案', lang)}</button>
                  : <button disabled={!canCloseFee(fs)} title={!canCloseFee(fs) ? t('需先完成收費覆核與支付審核才能結案', lang) : ''} onClick={() => updateFeeSetup(fs.id, { closed: '是' })}>{t('結案', lang)}</button>}
              </td>
            )}
          </tr>
        ))}
        {list.length === 0 && <tr><td colSpan={canEditPage ? 8 : 7} className="muted">{t('尚未建立費用設定', lang)}</td></tr>}
      </tbody>
    </table></div>
  );
}

// 審核/覆核狀態標籤：完成時可以點一下看核准人姓名跟時間，不然主列表
// 一堆人名擠在欄位裡太吵——平時只顯示「審核完成」這種簡短狀態字樣。
function ReviewTag({ done, doneLabel, notDoneLabel, approverName, approvedAt, lang }) {
  if (!done) return <span className="tag tag-grey">{notDoneLabel}</span>;
  function handleClick() {
    const when = approvedAt ? new Date(approvedAt).toLocaleString() : '—';
    window.alert(`${doneLabel}\n${t('核准人：', lang)}${approverName || '—'}\n${t('時間：', lang)}${when}`);
  }
  return (
    <button type="button" className="tag tag-green" style={{ border: 'none', cursor: 'pointer' }} onClick={handleClick}>
      {doneLabel}
    </button>
  );
}

// 查看某一位移工底下所有收費紀錄的明細（主列表只顯示彙總金額，個別
// 哪一天收了哪個項目多少錢要點進這裡看）；「編輯」開 ChargeRecordEditModal、
// 「新增」開 ChargeRecordAddModal，疊在這個視窗上面（雙層背景遮罩，純
// 視覺上的小瑕疵，不影響操作）。
function ChargeDetailModal({ worker, records, onClose, onEdit, onAdd, onRemove, lang }) {
  const sorted = [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: '100%' }}>
        <h3 style={{ marginTop: 0 }}>{worker?.name || '—'} － {t('收費紀錄', lang)}</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>{t('收費日期', lang)}</th><th>{t('收費項目', lang)}</th><th>{t('金額', lang)}</th><th>{t('收費對象', lang)}</th><th></th></tr></thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td>{r.date || '—'}</td>
                <td>{t(r.item, lang) || '—'}</td>
                <td>{formatMoney(r.amount, r.currency, lang)}</td>
                <td>{t(r.chargeTarget, lang) || '—'}</td>
                <td className="row-actions">
                  <button onClick={() => onEdit(r)}>{t('編輯', lang)}</button>
                  <button className="danger" onClick={() => onRemove(r.id)}>{t('刪除', lang)}</button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={5} className="muted">{t('此移工目前沒有收費紀錄', lang)}</td></tr>}
          </tbody>
        </table></div>
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button type="button" className="primary" onClick={onAdd}>+ {t('新增收費', lang)}</button>
          <button type="button" onClick={onClose}>{t('關閉', lang)}</button>
        </div>
      </div>
    </div>
  );
}

// 編輯既有的單筆收費紀錄——跟新增多筆的表單（下面 ChargeRecordAddModal）
// 分開：編輯一次只改一筆，沿用原本的單列表單欄位。
function ChargeRecordEditModal({ initial, feeSetups, workerOf, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const fs = feeSetups.find((f) => f.workerId === form.workerId);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('編輯收費紀錄', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('移工', lang)}（{t('費用計算', lang)}）
              <input value={`${workerOf(form.workerId)?.name || '—'}${fs ? `（${(fs.totalFee || 0).toLocaleString()}）` : ''}`} disabled />
            </label>
            <label>
              {t('收費日期', lang)}
              <input type="date" required value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>
              {t('收費項目', lang)}
              <input
                list="charge-item-options"
                value={form.item || ''}
                placeholder={t('選擇或自行輸入項目名稱', lang)}
                onChange={(e) => setForm({ ...form, item: e.target.value })}
              />
              <datalist id="charge-item-options">
                {CHARGE_ITEM_PRESETS.map((o) => <option key={o} value={o}>{t(o, lang)}</option>)}
              </datalist>
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
            <label>
              {t('收費對象', lang)}
              <select value={form.chargeTarget || ''} onChange={(e) => setForm({ ...form, chargeTarget: e.target.value })}>
                <option value="">{t('請選擇', lang)}</option>
                {CHARGE_TARGETS.map((o) => <option key={o} value={o}>{t(o, lang)}</option>)}
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

function emptyChargeRow() {
  return { date: '', item: '', amount: '', currency: DEFAULT_CURRENCY, chargeTarget: '', note: '' };
}

// 新增收費：同一位移工的收款常常分好幾筆（訂金/預付款/尾款，各自日期
// 跟金額不同），一次開一列填一筆太慢——改成跟履歷表的工作經歷編輯器
// 同一套模式，一次可以列好幾列、填好一起送出，各列分別存成獨立一筆
// laborAgency_chargeRecords 文件（見上面 handleSaveMultiple）。移工（費用
// 計算）選單選了之後自動帶入該筆設定的應繳費用當作參考，不是自動帶入
// 到某一列的金額——多筆金額各自不同，不適合自動帶入。
function ChargeRecordAddModal({ initial, workers, feeSetups, onCancel, onSave, lang }) {
  const [workerId, setWorkerId] = useState(initial.workerId || '');
  const [rows, setRows] = useState([emptyChargeRow()]);

  function workerOf(id) { return workers.find((w) => w.id === id); }
  const sortedFeeSetups = [...feeSetups].sort((a, b) => (workerOf(a.workerId)?.name || '').localeCompare(workerOf(b.workerId)?.name || ''));
  const selectedFeeSetup = feeSetups.find((f) => f.workerId === workerId);

  function updateRow(i, patch) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i) {
    setRows(rows.filter((_, idx) => idx !== i));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave(workerId, rows);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 680, maxWidth: '100%' }}>
        <h3>{t('新增收費紀錄', lang)}</h3>
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', marginBottom: 12 }}>
            {t('移工', lang)}（{t('費用計算', lang)}）
            <select required value={selectedFeeSetup?.id || ''} onChange={(e) => setWorkerId(feeSetups.find((f) => f.id === e.target.value)?.workerId || '')}>
              <option value="">{t('請選擇', lang)}</option>
              {sortedFeeSetups.map((f) => (
                <option key={f.id} value={f.id}>{workerOf(f.workerId)?.name || '—'}（{(f.totalFee || 0).toLocaleString()}）</option>
              ))}
            </select>
          </label>

          {rows.map((r, i) => (
            <div key={i} className="form-grid" style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #eee' }}>
              <label>
                {t('收費日期', lang)}
                <input type="date" value={r.date} onChange={(e) => updateRow(i, { date: e.target.value })} />
              </label>
              <label>
                {t('收費項目', lang)}
                <input
                  list="charge-item-options"
                  value={r.item}
                  placeholder={t('選擇或自行輸入項目名稱', lang)}
                  onChange={(e) => updateRow(i, { item: e.target.value })}
                />
                {/* datalist 的建議清單跟自由輸入共存：value 存固定的中文
                    canonical 值（訂金/預付款/尾款/其他費用），跟其他固定
                    類別欄位（例如收費對象）一致，不會因為使用者當下顯示
                    語言不同而存到不同文字；選單裡顯示的文字另外用 t()
                    翻譯成當下語言，瀏覽器選取建議項目時填入的是 value，
                    不是顯示文字。 */}
                <datalist id="charge-item-options">
                  {CHARGE_ITEM_PRESETS.map((o) => <option key={o} value={o}>{t(o, lang)}</option>)}
                </datalist>
              </label>
              <label>
                {t('金額', lang)}
                <input type="number" value={r.amount} onChange={(e) => updateRow(i, { amount: e.target.value })} />
              </label>
              <label>
                {t('幣別', lang)}
                <select value={r.currency || DEFAULT_CURRENCY} onChange={(e) => updateRow(i, { currency: e.target.value })}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{t(c, lang)}</option>)}
                </select>
              </label>
              <label>
                {t('收費對象', lang)}
                <select value={r.chargeTarget} onChange={(e) => updateRow(i, { chargeTarget: e.target.value })}>
                  <option value="">{t('請選擇', lang)}</option>
                  {CHARGE_TARGETS.map((o) => <option key={o} value={o}>{t(o, lang)}</option>)}
                </select>
              </label>
              <label>
                {t('備註', lang)}
                <input value={r.note} onChange={(e) => updateRow(i, { note: e.target.value })} />
              </label>
              {rows.length > 1 && <button type="button" onClick={() => removeRow(i)} style={{ alignSelf: 'end' }}>{t('移除', lang)}</button>}
            </div>
          ))}
          <button type="button" onClick={() => setRows([...rows, emptyChargeRow()])}>+ {t('新增一筆', lang)}</button>

          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
