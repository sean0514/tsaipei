import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';
import { DOCS_CHECKLIST, SOUTH_VIETNAM_EXTRA_NOTE, requiredDocsDone, employerLabel, workerEmployerIds, isHired, getPairFlag, withPairFlag } from './constants';

const REQUIRED_COUNT = DOCS_CHECKLIST.filter((d) => d.required).length;
const UNSET_AGENCY = '__unset_agency__';
const UNMATCHED_EMPLOYER = '__unmatched__';

// 名單來源：某一筆配對（移工×雇主）的「目前階段」＝「錄取」且那一筆
// 配對還沒標記完成（docsCompletedMap）的，才需要在這裡追蹤文件——完成
// 跟刪除都是各自配對獨立的旗標，不是整個移工共用，所以同一個移工若
// 配對多個雇主，按下某一筆的「完成」只會讓那一筆消失、進入「辦理
// 簽證」，不會連動其他配對。依仲介、雇主分類顯示。
export default function DocsChecklistPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'docsChecklist', role, overrides);
  const { rows: workers, loading, update } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');
  const [editing, setEditing] = useState(null);

  const employerOf = (id) => employers.find((e) => e.id === id);
  const rows = workers
    .flatMap((w) => {
      const ids = workerEmployerIds(w);
      return ids.length ? ids.map((employerId) => ({ worker: w, employerId })) : [{ worker: w, employerId: null }];
    })
    .filter((r) => isHired(r.worker, r.employerId)
      && !getPairFlag(r.worker, 'docsCompletedMap', r.employerId)
      && !getPairFlag(r.worker, 'docsListRemovedMap', r.employerId));
  const agencyKeys = [...new Set(rows.map((r) => (r.employerId ? (employerOf(r.employerId)?.agencyName || UNSET_AGENCY) : UNSET_AGENCY)))]
    .sort((a, b) => (a === UNSET_AGENCY ? 1 : b === UNSET_AGENCY ? -1 : a.localeCompare(b)));

  async function handleComplete(w, employerId) {
    await update(w.id, { docsCompletedMap: withPairFlag(w, 'docsCompletedMap', employerId, true) });
  }

  // 刪除：只從「文件追蹤」這份名單移除那一筆配對，不影響移工本身的
  // 資料，也不影響其他頁面（移工管理、辦理簽證…）——用
  // docsListRemovedMap 這個頁面專屬、依配對獨立的隱藏旗標，不呼叫
  // remove() 刪除整筆移工資料。
  async function handleRemove(w, employerId) {
    await update(w.id, { docsListRemovedMap: withPairFlag(w, 'docsListRemovedMap', employerId, true) });
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('文件追蹤', lang)}</h2>
          <div className="page-desc">{t('自動列出審核結果為「通過錄取」的移工，需要收集的文件清單，必備（✅）與依個案提供（⭕）分開追蹤；文件收齊後按「完成」會進入下一關「辦理簽證」', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0 }}>{t(SOUTH_VIETNAM_EXTRA_NOTE, lang)}</p>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        rows.length === 0 ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>{t('目前沒有待收件的名單', lang)}</p></div>
        ) : agencyKeys.map((agencyKey) => {
          const group = rows.filter((r) => (r.employerId ? (employerOf(r.employerId)?.agencyName || UNSET_AGENCY) : UNSET_AGENCY) === agencyKey);
          return (
            <div key={agencyKey} style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 10 }}>{agencyKey === UNSET_AGENCY ? t('未填仲介名稱', lang) : agencyKey}<span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>（{group.length}）</span></h3>
              <div className="card" style={{ overflowX: 'auto' }}>
                <div className="table-wrap"><table>
                  <thead><tr><th>{t('姓名', lang)}</th><th>{t('雇主', lang)}</th><th>{t('護照有效日期', lang)}</th><th>{t('必備文件進度', lang)}</th>{canEditPage && <th></th>}</tr></thead>
                  <tbody>
                    {group.map(({ worker: w, employerId }) => {
                      const done = requiredDocsDone(w);
                      return (
                        <tr key={`${w.id}-${employerId || UNMATCHED_EMPLOYER}`}>
                          <td style={{ fontWeight: 600 }}>{w.name}</td>
                          <td>{employerId ? employerLabel(employers, employerId, lang) : t('尚未配對', lang)}</td>
                          <td>{w.passportExpiry || '—'}</td>
                          <td>
                            <span className={`tag ${done === REQUIRED_COUNT ? 'tag-green' : done === 0 ? 'tag-grey' : 'tag-amber'}`}>
                              {done} / {REQUIRED_COUNT}
                            </span>
                          </td>
                          {canEditPage && (
                            <td className="row-actions">
                              <button onClick={() => setEditing(w)}>{t('編輯文件', lang)}</button>
                              <button className="primary" onClick={() => handleComplete(w, employerId)}>{t('完成', lang)}</button>
                              <button className="danger" onClick={() => handleRemove(w, employerId)}>{t('刪除', lang)}</button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              </div>
            </div>
          );
        })
      )}
      {editing && (
        <DocsFormModal
          worker={editing}
          onCancel={() => setEditing(null)}
          onSave={async (data) => { await update(editing.id, data); setEditing(null); }}
          lang={lang}
        />
      )}
    </div>
  );
}

function DocsFormModal({ worker, onCancel, onSave, lang }) {
  const [checked, setChecked] = useState(worker.docsChecked || {});
  const [passportExpiry, setPassportExpiry] = useState(worker.passportExpiry || '');
  const requiredItems = DOCS_CHECKLIST.filter((d) => d.required);
  const optionalItems = DOCS_CHECKLIST.filter((d) => !d.required);

  function toggle(key) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // 全部繳交：必備文件一次全部打勾，不用一項一項點——文件全部收到的
  // 情況很常見，一個按鈕就能完成，不用再逐項確認。
  function markAllSubmitted() {
    setChecked((prev) => {
      const next = { ...prev };
      requiredItems.forEach((d) => { next[d.key] = true; });
      return next;
    });
  }

  // 必備文件進度改成一排可點擊的流程步驟：點哪一項就直接打勾/取消那
  // 一項，比原本逐行的核取方塊清單更一目了然地看出整體收件進度。
  function RequiredSteps() {
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {requiredItems.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => toggle(d.key)}
            title={t(d.note, lang)}
            className={`tag ${checked[d.key] ? 'tag-green' : 'tag-grey'}`}
            style={{ cursor: 'pointer', fontWeight: checked[d.key] ? 700 : 400 }}
          >
            {checked[d.key] ? '✓ ' : ''}{t(d.label, lang)}
          </button>
        ))}
      </div>
    );
  }

  function OptionalItemList() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {optionalItems.map((d) => (
          <label key={d.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontWeight: 400 }}>
            <input type="checkbox" checked={!!checked[d.key]} onChange={() => toggle(d.key)} style={{ marginTop: 3 }} />
            <span>
              <div>{t(d.label, lang)}</div>
              <div className="muted" style={{ fontSize: 12 }}>{t(d.note, lang)}</div>
            </span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{worker.name} － {t('文件清單', lang)}</h3>
        <div className="row-actions" style={{ marginBottom: 10 }}>
          <h4 style={{ margin: 0, flex: 1 }}>{t('必備文件', lang)}</h4>
          <button type="button" onClick={markAllSubmitted}>{t('全部繳交', lang)}</button>
        </div>
        <RequiredSteps />
        {/* 「護照」這項必備文件額外要確認有效日期，不是只打勾——跟
            WorkersPage.jsx 編輯移工表單共用同一個 passportExpiry 欄位，
            這裡填過那邊也會同步看到。 */}
        <label style={{ display: 'block', marginTop: 10 }}>
          {t('護照有效日期', lang)}
          <input type="date" value={passportExpiry} onChange={(e) => setPassportExpiry(e.target.value)} style={{ marginLeft: 8, width: 'auto' }} />
        </label>
        <h4>{t('依個案提供', lang)}</h4>
        <OptionalItemList />
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button type="button" className="primary" onClick={() => onSave({ docsChecked: checked, passportExpiry })}>{t('儲存', lang)}</button>
          <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
        </div>
      </div>
    </div>
  );
}
