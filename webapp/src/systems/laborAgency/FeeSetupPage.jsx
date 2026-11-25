import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';
import { canSeeDocNumber, matchStatusOf, withMatchStatus, MATCH_STATUSES, CURRENCIES, DEFAULT_CURRENCY, canCloseFee } from './constants';

const CHARGE_TARGETS = ['工人', '招募'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'workerId', label: '移工ID' }, { key: 'workerName', label: '姓名' },
  { key: 'employerId', label: '雇主ID' }, { key: 'totalFee', label: '應繳費用' }, { key: 'taiwanAgencyFee', label: '台仲收費' },
  { key: 'recruiterBonus', label: '招募者獎金' }, { key: 'currency', label: '幣別' }, { key: 'chargeTarget', label: '收費對象' },
];

// 費用計算：每位移工一筆費用設定——應繳費用是整筆總金額，台仲收費是其中
// 元凱（台灣仲介）自己抽的部分，招募者獎金是要付給招募人員的獎金（直接
// 在這裡填固定金額，不是另外設一個費率表），收費對象記錄這筆錢是要向
// 工人本人收、還是向招募人員/仲介收。這裡只是「設定」，實際收到/付出的
// 錢另外記在「收費紀錄」「支付紀錄」。
export default function FeeSetupPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'feeSetup', role, overrides);
  const showDocNumber = canSeeDocNumber(role);
  const { rows, loading, add, update, remove } = useCollection('laborAgency_feeSetup');
  const { rows: workers, update: updateWorker } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  // 移工ID欄位如果填了一個查不到對應移工的 ID（打錯、複製到舊的 ID、
  // 移工後來被刪除…），畫面上的姓名/護照號碼/雇主就會全部顯示「—」，
  // 看起來像「這筆資料是空的」——這裡連同雇主ID一併擋掉，不要讓這種
  // 查無對應資料的列匯入進來。
  const { handleExport, handleImport } = useCsvOverwrite('laborAgency_feeSetup', CSV_FIELDS, {
    entityLabel: '費用計算',
    requiredKeys: ['workerId'],
    validateRow: (row) => workers.some((w) => w.id === row.workerId) && (!row.employerId || employers.some((e) => e.id === row.employerId)),
    canEdit: canEditPage,
  });

  function workerOf(workerId) { return workers.find((w) => w.id === workerId); }
  function employerOf(employerId) { return employers.find((e) => e.id === employerId); }

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows
    .filter((r) => !searchQuery || (workerOf(r.workerId)?.name || '').toLowerCase().includes(searchQuery))
    .sort((a, b) => (workerOf(a.workerId)?.name || '').localeCompare(workerOf(b.workerId)?.name || ''));
  // 結案：比照「收費紀錄」(ChargeRecordsPage.jsx) 跟「雇主需求單」
  // (tsaipei/PositionsPage.jsx) 已結案職缺的做法，closed 欄位（'是'/''），
  // 結案後從主列表收起、移到下方「已結案」收合區塊，資料還在，可以
  // 「取消已結案」移回來，不是刪除——收費紀錄頁面的結案按鈕改的也是
  // 同一個 closed 欄位，兩邊互通，不會各自存一份。
  const openRows = filteredRows.filter((r) => r.closed !== '是');
  const closedRows = filteredRows.filter((r) => r.closed === '是');

  // 新增/編輯費用設定時，順便把那一筆配對（移工×雇主）的狀態改成
  // 「錄取」（會先建費用設定，代表這筆案件已經確定成立，不用再回
  // 「移工管理」手動改一次狀態）——文件追蹤名單就是自動列出狀態＝
  // 「錄取」的配對，這樣費用設定存檔後會自動帶入文件追蹤名單。已經是
  // 「錄取」就不用再寫一次；只有配對了雇主（employerId 有值）才處理，
  // 「尚未配對」沒有這個概念。
  async function ensureHiredForFee(workerId, employerId) {
    if (!employerId) return;
    const worker = workerOf(workerId);
    if (!worker || matchStatusOf(worker, employerId) === MATCH_STATUSES[1]) return;
    await updateWorker(workerId, { matchStatuses: withMatchStatus(worker, employerId, MATCH_STATUSES[1]) });
  }

  async function handleSave(data) {
    const payload = {
      ...data,
      totalFee: Number(data.totalFee) || 0,
      taiwanAgencyFee: Number(data.taiwanAgencyFee) || 0,
      recruiterBonus: Number(data.recruiterBonus) || 0,
      // 幣別下拉選單「看起來」預設選到新台幣，但如果使用者完全沒碰過
      // 這個欄位，form.currency 本身還是 undefined（同一類問題見
      // EmployersPage.jsx 的「需求人數」欄位），這裡明確補上預設值，
      // 不要讓存檔結果跟畫面顯示的不一樣。
      currency: data.currency || DEFAULT_CURRENCY,
    };
    if (data.id) {
      const { id, ...rest } = payload;
      await update(id, rest);
    } else {
      await add(payload);
    }
    await ensureHiredForFee(payload.workerId, payload.employerId);
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('費用計算', lang)}</h2>
          <div className="page-desc">{t('每位移工一筆費用設定：應繳費用為總金額，台仲收費為其中元凱自己抽的部分，招募者獎金直接填固定金額，收費對象記錄向工人本人或向招募人員收取', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
          <div className="page-desc">{t('儲存後，若已選擇雇主，會自動將該配對狀態設為「錄取」，列入文件追蹤名單', lang)}</div>
        </div>
        <div className="row-actions">
          <input placeholder={t('搜尋姓名', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增費用設定', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <>
          <div className="card" style={{ overflowX: 'auto' }}>
            <FeeSetupTable
              list={openRows}
              workerOf={workerOf}
              employerOf={employerOf}
              showDocNumber={showDocNumber}
              canEditPage={canEditPage}
              setEditing={setEditing}
              remove={remove}
              update={update}
              lang={lang}
            />
          </div>
          <div style={{ margin: '12px 0' }}>
            <label className="row-actions" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} style={{ width: 'auto' }} />
              {t('顯示已結案名單', lang)}（{closedRows.length}）
            </label>
          </div>
          {showClosed && (
            <div className="card" style={{ overflowX: 'auto' }}>
              <FeeSetupTable
                list={closedRows}
                workerOf={workerOf}
                employerOf={employerOf}
                showDocNumber={showDocNumber}
                canEditPage={canEditPage}
                setEditing={setEditing}
                remove={remove}
                update={update}
                lang={lang}
              />
            </div>
          )}
        </>
      )}
      {editing && (
        <FeeSetupFormModal initial={editing} workers={workers} employers={employers} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />
      )}
    </div>
  );
}

// 獨立宣告在元件外面——寫在 FeeSetupPage 裡面的話，每次父元件重新
// render 都會產生新的函式參照，React 會當成不同的元件型別整個重新
// 掛載（這個頁面其他地方也有同樣的教訓，見 VisaProcessingPage.jsx
// 的註解）。
function FeeSetupTable({ list, workerOf, employerOf, showDocNumber, canEditPage, setEditing, remove, update, lang }) {
  return (
    <div className="table-wrap"><table>
      <thead>
        <tr>
          <th>{t('姓名', lang)}</th>{showDocNumber && <th>{t('核准文號', lang)}</th>}<th>{t('護照號碼', lang)}</th><th>{t('雇主', lang)}</th><th>{t('應繳費用', lang)}</th>
          <th>{t('台仲收費', lang)}</th><th>{t('招募者獎金', lang)}</th><th>{t('幣別', lang)}</th><th>{t('收費對象', lang)}</th>
          <th>{t('收費審核', lang)}</th><th>{t('收費覆核', lang)}</th><th>{t('支付審核', lang)}</th>{canEditPage && <th></th>}
        </tr>
      </thead>
      <tbody>
        {list.map((r) => (
          <tr key={r.id}>
            <td style={{ fontWeight: 600 }}>{workerOf(r.workerId)?.name || '—'}</td>
            {showDocNumber && <td>{employerOf(r.employerId)?.docNumber || '—'}</td>}
            <td>{workerOf(r.workerId)?.passportNo || '—'}</td>
            <td>{employerOf(r.employerId)?.name || '—'}</td>
            <td>{(r.totalFee || 0).toLocaleString()}</td>
            <td>{(r.taiwanAgencyFee || 0).toLocaleString()}</td>
            <td>{(r.recruiterBonus || 0).toLocaleString()}</td>
            <td>{t(r.currency || DEFAULT_CURRENCY, lang)}</td>
            <td>{t(r.chargeTarget, lang) || '—'}</td>
            <td>
              <span className={`tag ${r.chargeReviewed === '是' ? 'tag-green' : 'tag-grey'}`}>
                {r.chargeReviewed === '是' ? t('審核完成', lang) : t('未審核', lang)}
              </span>
            </td>
            <td>
              <span className={`tag ${r.chargeCountersigned === '是' ? 'tag-green' : 'tag-grey'}`}>
                {r.chargeCountersigned === '是' ? t('覆核完成', lang) : t('未覆核', lang)}
              </span>
            </td>
            <td>
              <span className={`tag ${r.paymentReviewed === '是' ? 'tag-green' : 'tag-grey'}`}>
                {r.paymentReviewed === '是' ? t('審核完成', lang) : t('未審核', lang)}
              </span>
            </td>
            {canEditPage && (
              <td className="row-actions">
                <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                {r.closed === '是'
                  ? <button onClick={() => update(r.id, { closed: '' })}>{t('取消已結案', lang)}</button>
                  : <button disabled={!canCloseFee(r)} title={!canCloseFee(r) ? t('需先完成收費覆核與支付審核才能結案', lang) : ''} onClick={() => update(r.id, { closed: '是' })}>{t('結案', lang)}</button>}
                <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
              </td>
            )}
          </tr>
        ))}
        {list.length === 0 && <tr><td colSpan={(showDocNumber ? 12 : 11) + (canEditPage ? 1 : 0)} className="muted">{t('尚未建立費用設定', lang)}</td></tr>}
      </tbody>
    </table></div>
  );
}

function FeeSetupFormModal({ initial, workers, employers, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const sortedWorkers = [...workers].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  function handleWorkerChange(workerId) {
    const worker = workers.find((w) => w.id === workerId);
    setForm({ ...form, workerId, employerId: worker?.employerId || form.employerId });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯費用設定', lang) : t('新增費用設定', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('移工', lang)}
              <select required value={form.workerId || ''} onChange={(e) => handleWorkerChange(e.target.value)}>
                <option value="">{t('請選擇', lang)}</option>
                {sortedWorkers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label>
              {t('雇主', lang)}
              <select value={form.employerId || ''} onChange={(e) => setForm({ ...form, employerId: e.target.value })}>
                <option value="">{t('尚未配對', lang)}</option>
                {employers.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </label>
            <label>
              {t('應繳費用', lang)}
              <input type="number" value={form.totalFee || ''} onChange={(e) => setForm({ ...form, totalFee: e.target.value })} />
            </label>
            <label>
              {t('台仲收費', lang)}
              <input type="number" value={form.taiwanAgencyFee || ''} onChange={(e) => setForm({ ...form, taiwanAgencyFee: e.target.value })} />
            </label>
            <label>
              {t('招募者獎金', lang)}
              <input type="number" value={form.recruiterBonus || ''} onChange={(e) => setForm({ ...form, recruiterBonus: e.target.value })} />
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
          <div className="row-actions">
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
