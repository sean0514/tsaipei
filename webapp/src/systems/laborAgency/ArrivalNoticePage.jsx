import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';
import { downloadXlsx } from '../../lib/xlsxExport';
import { employerLabel, workerEmployerIds, getPairFlag, withPairFlag } from './constants';

const UNSET_AGENCY = '__unset_agency__';
const UNMATCHED_EMPLOYER = '__unmatched__';

// 入境通知單可選擇帶入的證件照片類型——欄位名稱對應移工資料上的
// photoUrl 欄位（見 ResumeInternalFields.jsx 的「文件上傳」區塊），下載
// 時勾選哪幾種就把哪幾種嵌進 Excel。
const IMAGE_TYPES = [
  { key: 'passport', label: '護照', field: 'passportPhotoUrl' },
  { key: 'line', label: 'LINE', field: 'lineQrPhotoUrl' },
  { key: 'healthCard', label: '健保卡', field: 'healthCardPhotoUrl' },
  { key: 'residencePermit', label: '居留證', field: 'residencePermitPhotoUrl' },
  { key: 'phoneCard', label: '電話卡', field: 'phoneCardPhotoUrl' },
];

// 把圖片網址轉成 exceljs addImage 需要的 base64+副檔名；exceljs 只支援
// jpeg/png/gif，遇到其他格式或抓取失敗就回傳 null，呼叫端直接跳過那張圖，
// 不中斷整個下載。
async function fetchImageForExcel(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    let extension = null;
    if (blob.type.includes('jpeg') || blob.type.includes('jpg')) extension = 'jpeg';
    else if (blob.type.includes('png')) extension = 'png';
    else if (blob.type.includes('gif')) extension = 'gif';
    if (!extension) return null;
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { base64, extension };
  } catch {
    return null;
  }
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
  // 下載入境通知單時每位移工各自要不要連同帶入證件照片、帶哪幾種——
  // key 是「移工id-雇主id」，每個人獨立勾選，不是整組共用一份；預設都
  // 不選，要選才會嵌圖，避免檔案不必要地變大。
  const [imageSelections, setImageSelections] = useState({});

  function selectionKey(workerId, employerId) {
    return `${workerId}-${employerId || UNMATCHED_EMPLOYER}`;
  }
  function toggleImageSelection(workerId, employerId, typeKey, checked) {
    const key = selectionKey(workerId, employerId);
    setImageSelections((prev) => ({ ...prev, [key]: { ...prev[key], [typeKey]: checked } }));
  }

  const employerOf = (id) => employers.find((e) => e.id === id);
  const allPairs = workers
    .flatMap((w) => {
      const ids = workerEmployerIds(w);
      return ids.length ? ids.map((employerId) => ({ worker: w, employerId })) : [{ worker: w, employerId: null }];
    })
    .filter((r) => getPairFlag(r.worker, 'departureCompletedMap', r.employerId)
      && !getPairFlag(r.worker, 'arrivalListRemovedMap', r.employerId));
  const rows = allPairs.filter((r) => !getPairFlag(r.worker, 'arrivalClosedMap', r.employerId));
  const closedRows = allPairs.filter((r) => getPairFlag(r.worker, 'arrivalClosedMap', r.employerId));
  const agencyKeyOf = (r) => (r.employerId ? (employerOf(r.employerId)?.agencyName || UNSET_AGENCY) : UNSET_AGENCY);
  const sortAgencyKeys = (list) => [...new Set(list.map(agencyKeyOf))]
    .sort((a, b) => (a === UNSET_AGENCY ? 1 : b === UNSET_AGENCY ? -1 : a.localeCompare(b)));
  const agencyKeys = sortAgencyKeys(rows);
  const closedAgencyKeys = sortAgencyKeys(closedRows);

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

  // 結案：入境通知是整個流程的最後一關，結案把那一筆配對移到下面的
  // 「已結案」列表，跟雇主需求單的結案/重新開啟同一套設計——只是換一個
  // 旗標位置，不影響移工本身資料，也可以用「重新開啟」改回來。
  async function handleClose(w, employerId) {
    await update(w.id, { arrivalClosedMap: withPairFlag(w, 'arrivalClosedMap', employerId, true) });
  }
  async function handleReopen(w, employerId) {
    await update(w.id, { arrivalClosedMap: withPairFlag(w, 'arrivalClosedMap', employerId, false) });
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
    await downloadXlsx(`入境通知單_${title}.xlsx`, async (workbook) => {
      const sheet = workbook.addWorksheet('入境通知單');
      sheet.addRow(['入境通知單']);
      sheet.mergeCells('A1:N1');
      sheet.getCell('A1').alignment = { horizontal: 'center' };
      sheet.getCell('A1').font = { bold: true, size: 14 };
      sheet.addRow(['TO：']);
      sheet.addRow(['FROM：', '', '', '', '', '', '', '', '', '入境日期', arrivalDate || '']);
      sheet.addRow(['DATE：', '', '', '', '', '', '', '', '', '機場及班機', `${flightRow.flightAirline || ''} ${flightRow.flightNumber || ''}`.trim()]);
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

      // 選擇帶入的證件照片另開一個分頁，每位移工一個區塊，標題列顯示
      // 姓名，底下橫向排開那個人自己勾選的幾種照片（每個人各自獨立選，
      // 不是整組共用一份），不跟主表格擠在一起。
      const anySelected = group.some(({ worker: w, employerId }) => {
        const sel = imageSelections[selectionKey(w.id, employerId)] || {};
        return IMAGE_TYPES.some((it) => sel[it.key]);
      });
      if (!anySelected) return;
      const photoSheet = workbook.addWorksheet(t('附件照片', lang));
      let row = 1;
      for (const { worker: w, employerId } of group) {
        const sel = imageSelections[selectionKey(w.id, employerId)] || {};
        const selectedTypes = IMAGE_TYPES.filter((it) => sel[it.key]);
        if (!selectedTypes.length) continue;
        photoSheet.getCell(`A${row}`).value = w.name;
        photoSheet.getCell(`A${row}`).font = { bold: true };
        row += 1;
        for (let col = 0; col < selectedTypes.length; col += 1) {
          const type = selectedTypes[col];
          const img = await fetchImageForExcel(w[type.field]);
          const colIndex = col * 3;
          photoSheet.getCell(row, colIndex + 1).value = t(type.label, lang);
          if (img) {
            const imageId = workbook.addImage({ base64: img.base64, extension: img.extension });
            photoSheet.addImage(imageId, { tl: { col: colIndex, row }, ext: { width: 150, height: 150 } });
          }
        }
        row += 9;
      }
      photoSheet.columns.forEach((col) => { col.width = 20; });
    });
  }

  function AgencyTable({ group, closed }) {
    return (
      <div className="card" style={{ overflowX: 'auto' }}>
        <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>{t('姓名', lang)}</th><th>{t('雇主', lang)}</th><th>{t('性別', lang)}</th>
                <th>{t('護照號碼', lang)}</th><th>{t('航空公司', lang)}</th><th>{t('航班編號', lang)}</th>
                <th>{t('出入境航廈', lang)}</th><th>{t('班機時間', lang)}</th><th>{t('車資費用', lang)}</th>
                <th>{t('請款對象', lang)}</th>
                {!closed && canEditPage && <th>{t('下載時選擇帶入的證件照片', lang)}</th>}
                {canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {group.map(({ worker: w, employerId: rowEmployerId }) => (
                <tr key={`${w.id}-${rowEmployerId || UNMATCHED_EMPLOYER}`}>
                  <td style={{ fontWeight: 600 }}>{w.name}</td>
                  <td>{rowEmployerId ? employerLabel(employers, rowEmployerId, lang) : t('尚未配對', lang)}</td>
                  <td>{t(w.gender, lang) || '—'}</td>
                  <td>{w.passportNo || '—'}</td>
                  <td>{w.flightAirline || '—'}</td>
                  <td>{w.flightNumber || '—'}</td>
                  <td>{w.flightTerminal || '—'}</td>
                  <td>{w.flightTime || '—'}</td>
                  <td>{w.transportFee ? (+w.transportFee).toLocaleString() : '—'}</td>
                  <td>{w.billingParty || '—'}</td>
                  {!closed && canEditPage && (
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {IMAGE_TYPES.map((it) => (
                          <label key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 3, fontWeight: 400, fontSize: 13 }}>
                            <input
                              type="checkbox"
                              checked={!!(imageSelections[selectionKey(w.id, rowEmployerId)] || {})[it.key]}
                              onChange={(e) => toggleImageSelection(w.id, rowEmployerId, it.key, e.target.checked)}
                              style={{ width: 'auto' }}
                            />
                            {t(it.label, lang)}
                          </label>
                        ))}
                      </div>
                    </td>
                  )}
                  {canEditPage && (
                    <td className="row-actions">
                      {closed ? (
                        <button onClick={() => handleReopen(w, rowEmployerId)}>{t('重新開啟', lang)}</button>
                      ) : (
                        <>
                          <button onClick={() => setEditing(w)}>{t('編輯', lang)}</button>
                          <button onClick={() => handleBack(w, rowEmployerId)}>{t('返回', lang)}</button>
                          <button className="primary" onClick={() => handleClose(w, rowEmployerId)}>{t('結案', lang)}</button>
                          <button className="danger" onClick={() => handleRemove(w, rowEmployerId)}>{t('刪除', lang)}</button>
                        </>
                      )}
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
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        rows.length === 0 ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>{t('目前沒有已確認航班的名單', lang)}</p></div>
        ) : agencyKeys.map((agencyKey) => {
          const group = rows.filter((r) => agencyKeyOf(r) === agencyKey);
          return (
            <div key={agencyKey} style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 10 }}>
                {agencyKey === UNSET_AGENCY ? t('未填仲介名稱', lang) : agencyKey}
                <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>（{group.length}）</span>
              </h3>
              <div className="row-actions" style={{ marginBottom: 10 }}>
                <button onClick={() => handleDownload(agencyKey, group)}>{t('下載入境通知單', lang)}</button>
              </div>
              <AgencyTable group={group} />
            </div>
          );
        })
      )}
      {closedRows.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ marginBottom: 10 }}>{t('已結案', lang)}<span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>（{closedRows.length}）</span></h3>
          {closedAgencyKeys.map((agencyKey) => {
            const group = closedRows.filter((r) => agencyKeyOf(r) === agencyKey);
            return (
              <div key={agencyKey} style={{ marginBottom: 24 }}>
                <h4 style={{ marginBottom: 10 }}>
                  {agencyKey === UNSET_AGENCY ? t('未填仲介名稱', lang) : agencyKey}
                  <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>（{group.length}）</span>
                </h4>
                <AgencyTable group={group} closed />
              </div>
            );
          })}
        </div>
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
