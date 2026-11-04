import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';
import { downloadXlsx } from '../../lib/xlsxExport';
import { employerLabel, workerEmployerIds, getPairFlag, withPairFlag } from './constants';

const UNSET_AGENCY = '__unset_agency__';
const UNMATCHED_EMPLOYER = '__unmatched__';

function today() {
  return new Date().toISOString().slice(0, 10);
}

// 名單來源：某一筆配對在出境辦理標記「已完成」(departureCompletedMap)
// 的，航班已經確認，自動帶入這裡通知接機／入境相關人員；單純顯示航班
// 資訊，不再有下一關，所以沒有「完成」按鈕。刪除只影響那一筆配對。
// 依仲介、雇主分類顯示。欄位內容跟下載的 Excel 比照使用者提供的紙本
// 「入境通知單」格式：編號/姓名/雇主/出生年月/國籍/性別/護照號碼/
// 護照發照日期/護照有效日期/核准文號/婚姻狀況/台灣電話號碼，其中護照
// 號碼/發照日期/核准文號/台灣電話號碼這幾個欄位是入境通知才需要、履歷
// 表沒有的額外資訊，用「編輯」另外補填。國籍目前系統只處理越南移工，
// 固定顯示「越南」，不開欄位。
export default function ArrivalNoticePage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'arrivalNotice', role, overrides);
  const { rows: workers, loading, update } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');
  const [editing, setEditing] = useState(null);
  // 紙本通知單上「TO/FROM/DATE」這幾個每次發文都可能不同的文件資訊，
  // 不是移工資料，存在頁面上讓使用者下載前自行填寫即可，不用另開一個
  // 集合保存。
  const [docInfo, setDocInfo] = useState({ to: '', from: '', date: today() });

  const employerOf = (id) => employers.find((e) => e.id === id);
  const rows = workers
    .flatMap((w) => {
      const ids = workerEmployerIds(w);
      return ids.length ? ids.map((employerId) => ({ worker: w, employerId })) : [{ worker: w, employerId: null }];
    })
    .filter((r) => getPairFlag(r.worker, 'departureCompletedMap', r.employerId)
      && !getPairFlag(r.worker, 'arrivalListRemovedMap', r.employerId));
  const agencyKeys = [...new Set(rows.map((r) => (r.employerId ? (employerOf(r.employerId)?.agencyName || UNSET_AGENCY) : UNSET_AGENCY)))]
    .sort((a, b) => (a === UNSET_AGENCY ? 1 : b === UNSET_AGENCY ? -1 : a.localeCompare(b)));

  // 刪除：只從「入境通知」這份名單移除那一筆配對，不影響移工本身的
  // 資料，也不影響其他頁面——用 arrivalListRemovedMap 這個頁面專屬、
  // 依配對獨立的隱藏旗標。
  async function handleRemove(w, employerId) {
    await update(w.id, { arrivalListRemovedMap: withPairFlag(w, 'arrivalListRemovedMap', employerId, true) });
  }

  // 返回：取消「出境辦理」對那一筆配對標記的已完成，讓它從這份名單消失、
  // 重新出現在「出境辦理」頁面——只影響那一筆配對，不影響移工本身資料。
  async function handleBack(w, employerId) {
    await update(w.id, { departureCompletedMap: withPairFlag(w, 'departureCompletedMap', employerId, false) });
  }

  async function handleSaveNotice(worker, data) {
    await update(worker.id, data);
    setEditing(null);
  }

  // 下載入境通知單：比照使用者提供的紙本格式，表頭 TO/FROM/DATE + 入境
  // 日期/機場及班機/抵達時間，底下接編號/姓名/雇主…的名冊表格。同一組
  // （仲介）底下的移工通常是同一班飛機，班機資訊取第一筆有填的那筆。
  async function handleDownload(agencyKey, group) {
    const flightRow = group.find(({ worker: w }) => w.flightTime)?.worker || {};
    const [arrivalDate, arrivalTimeRaw] = (flightRow.flightTime || '').split('T');
    const title = agencyKey === UNSET_AGENCY ? t('未填仲介名稱', lang) : agencyKey;
    await downloadXlsx(`入境通知單_${title}.xlsx`, (workbook) => {
      const sheet = workbook.addWorksheet('入境通知單');
      sheet.addRow(['入境通知單']);
      sheet.mergeCells('A1:N1');
      sheet.getCell('A1').alignment = { horizontal: 'center' };
      sheet.getCell('A1').font = { bold: true, size: 14 };
      sheet.addRow([`TO：${docInfo.to}`]);
      sheet.addRow([`FROM：${docInfo.from}`, '', '', '', '', '', '', '', '', '入境日期', arrivalDate || '']);
      sheet.addRow([`DATE：${docInfo.date}`, '', '', '', '', '', '', '', '', '機場及班機', `${flightRow.flightAirline || ''} ${flightRow.flightNumber || ''}`.trim()]);
      sheet.addRow(['', '', '', '', '', '', '', '', '', '抵達時間', arrivalTimeRaw || '']);
      sheet.addRow([
        '編號', '工人照片', '姓名', '雇主', '出生年月', '國籍', '性別', '護照號碼',
        '護照發照日期', '護照有效日期', '核准文號', '婚姻狀況', '台灣電話號碼',
      ]).font = { bold: true };
      group.forEach(({ worker: w, employerId }, i) => {
        sheet.addRow([
          i + 1, '', w.name || '', employerId ? employerLabel(employers, employerId, lang) : t('尚未配對', lang),
          w.birthDate || '', '越南', t(w.gender, lang) || '', w.passportNo || '',
          w.passportIssueDate || '', w.passportExpiry || '', w.approvalDocNumber || '',
          t(w.maritalStatus, lang) || '', w.taiwanPhone || '',
        ]);
      });
      sheet.columns.forEach((col) => { col.width = 14; });
    });
  }

  function AgencyTable({ group }) {
    return (
      <div className="card" style={{ overflowX: 'auto' }}>
        <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>{t('姓名', lang)}</th><th>{t('雇主', lang)}</th><th>{t('出生年月', lang)}</th><th>{t('性別', lang)}</th>
                <th>{t('護照號碼', lang)}</th><th>{t('護照發照日期', lang)}</th><th>{t('護照有效日期', lang)}</th>
                <th>{t('核准文號', lang)}</th><th>{t('婚姻狀況', lang)}</th><th>{t('台灣電話號碼', lang)}</th>
                <th>{t('航空公司', lang)}</th><th>{t('航班編號', lang)}</th><th>{t('班機時間', lang)}</th>{canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {group.map(({ worker: w, employerId: rowEmployerId }) => (
                <tr key={`${w.id}-${rowEmployerId || UNMATCHED_EMPLOYER}`}>
                  <td style={{ fontWeight: 600 }}>{w.name}</td>
                  <td>{rowEmployerId ? employerLabel(employers, rowEmployerId, lang) : t('尚未配對', lang)}</td>
                  <td>{w.birthDate || '—'}</td>
                  <td>{t(w.gender, lang) || '—'}</td>
                  <td>{w.passportNo || '—'}</td>
                  <td>{w.passportIssueDate || '—'}</td>
                  <td>{w.passportExpiry || '—'}</td>
                  <td>{w.approvalDocNumber || '—'}</td>
                  <td>{t(w.maritalStatus, lang) || '—'}</td>
                  <td>{w.taiwanPhone || '—'}</td>
                  <td>{w.flightAirline || '—'}</td>
                  <td>{w.flightNumber || '—'}</td>
                  <td>{w.flightTime || '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(w)}>{t('編輯', lang)}</button>
                      <button onClick={() => handleBack(w, rowEmployerId)}>{t('返回', lang)}</button>
                      <button className="danger" onClick={() => handleRemove(w, rowEmployerId)}>{t('刪除', lang)}</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table></div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('入境通知', lang)}</h2>
          <div className="page-desc">{t('自動列出出境辦理已完成、航班已確認的移工，供接機與入境相關人員查看；內容/下載比照紙本入境通知單格式', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <label>{t('TO', lang)}<input value={docInfo.to} onChange={(e) => setDocInfo({ ...docInfo, to: e.target.value })} /></label>
          <label>{t('FROM', lang)}<input value={docInfo.from} onChange={(e) => setDocInfo({ ...docInfo, from: e.target.value })} /></label>
          <label>{t('DATE', lang)}<input type="date" value={docInfo.date} onChange={(e) => setDocInfo({ ...docInfo, date: e.target.value })} /></label>
        </div>
        <p className="muted" style={{ margin: '8px 0 0' }}>{t('下載入境通知單時會帶入這三項資訊；入境日期/機場及班機/抵達時間自動取該組移工的班機資訊。', lang)}</p>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        rows.length === 0 ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>{t('目前沒有已確認航班的名單', lang)}</p></div>
        ) : agencyKeys.map((agencyKey) => {
          const group = rows.filter((r) => (r.employerId ? (employerOf(r.employerId)?.agencyName || UNSET_AGENCY) : UNSET_AGENCY) === agencyKey);
          return (
            <div key={agencyKey} style={{ marginBottom: 24 }}>
              <div className="row-actions" style={{ marginBottom: 10 }}>
                <h3 style={{ margin: 0, flex: 1 }}>
                  {agencyKey === UNSET_AGENCY ? t('未填仲介名稱', lang) : agencyKey}
                  <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>（{group.length}）</span>
                </h3>
                <button onClick={() => handleDownload(agencyKey, group)}>{t('下載入境通知單', lang)}</button>
              </div>
              <AgencyTable group={group} />
            </div>
          );
        })
      )}
      {editing && (
        <ArrivalInfoModal
          worker={editing}
          onCancel={() => setEditing(null)}
          onSave={handleSaveNotice}
          lang={lang}
        />
      )}
    </div>
  );
}

// 編輯入境通知額外欄位：護照號碼/護照發照日期/核准文號/台灣電話號碼，
// 這幾個是履歷表沒有、入境通知單才需要的欄位，直接存回移工資料
// （laborAgency_workers），跟移工管理/移工名冊共用同一份文件。
function ArrivalInfoModal({ worker, onCancel, onSave, lang }) {
  const [form, setForm] = useState({
    passportNo: worker.passportNo || '',
    passportIssueDate: worker.passportIssueDate || '',
    approvalDocNumber: worker.approvalDocNumber || '',
    taiwanPhone: worker.taiwanPhone || '',
  });

  function handleSubmit(e) {
    e.preventDefault();
    onSave(worker, form);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{worker.name} － {t('入境通知欄位', lang)}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>{t('護照號碼', lang)}<input value={form.passportNo} onChange={(e) => setForm({ ...form, passportNo: e.target.value })} /></label>
            <label>{t('護照發照日期', lang)}<input type="date" value={form.passportIssueDate} onChange={(e) => setForm({ ...form, passportIssueDate: e.target.value })} /></label>
            <label>{t('核准文號', lang)}<input value={form.approvalDocNumber} onChange={(e) => setForm({ ...form, approvalDocNumber: e.target.value })} /></label>
            <label>{t('台灣電話號碼', lang)}<input value={form.taiwanPhone} onChange={(e) => setForm({ ...form, taiwanPhone: e.target.value })} /></label>
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
