import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';
import { DOCS_CHECKLIST, SOUTH_VIETNAM_EXTRA_NOTE, requiredDocsDone, employerLabel, workerEmployerIds, isHired } from './constants';

const REQUIRED_COUNT = DOCS_CHECKLIST.filter((d) => d.required).length;
const UNSET_AGENCY = '__unset_agency__';
const UNMATCHED_EMPLOYER = '__unmatched__';

// 名單來源：審核結果「通過錄取」且文件還沒收齊完成（docsCompleted）的
// 移工，才需要在這裡追蹤文件；標記完成後會從這份名單消失，接著自動
// 出現在「辦理簽證」頁面。依仲介、雇主分類顯示（同一人配對多個雇主就
// 依雇主各自顯示一行），跟移工管理的分組邏輯一致。
export default function DocsChecklistPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'docsChecklist', role, overrides);
  const { rows: workers, loading, update } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');
  const [editing, setEditing] = useState(null);

  const hired = workers.filter((w) => isHired(w) && !w.docsCompleted);
  const employerOf = (id) => employers.find((e) => e.id === id);
  const rows = hired.flatMap((w) => {
    const ids = workerEmployerIds(w);
    return ids.length ? ids.map((employerId) => ({ worker: w, employerId })) : [{ worker: w, employerId: null }];
  });
  const agencyKeys = [...new Set(rows.map((r) => (r.employerId ? (employerOf(r.employerId)?.agencyName || UNSET_AGENCY) : UNSET_AGENCY)))]
    .sort((a, b) => (a === UNSET_AGENCY ? 1 : b === UNSET_AGENCY ? -1 : a.localeCompare(b)));

  async function handleComplete(w) {
    await update(w.id, { docsCompleted: true });
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
                  <thead><tr><th>{t('姓名', lang)}</th><th>{t('雇主', lang)}</th><th>{t('階段', lang)}</th><th>{t('必備文件進度', lang)}</th>{canEditPage && <th></th>}</tr></thead>
                  <tbody>
                    {group.map(({ worker: w, employerId }) => {
                      const done = requiredDocsDone(w);
                      return (
                        <tr key={`${w.id}-${employerId || UNMATCHED_EMPLOYER}`}>
                          <td style={{ fontWeight: 600 }}>{w.name}</td>
                          <td>{employerId ? employerLabel(employers, employerId, lang) : t('尚未配對', lang)}</td>
                          <td>{t(w.stage, lang) || '—'}</td>
                          <td>
                            <span className={`tag ${done === REQUIRED_COUNT ? 'tag-green' : done === 0 ? 'tag-grey' : 'tag-amber'}`}>
                              {done} / {REQUIRED_COUNT}
                            </span>
                          </td>
                          {canEditPage && (
                            <td className="row-actions">
                              <button onClick={() => setEditing(w)}>{t('編輯文件', lang)}</button>
                              <button className="primary" onClick={() => handleComplete(w)}>{t('完成', lang)}</button>
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
          onSave={async (docsChecked) => { await update(editing.id, { docsChecked }); setEditing(null); }}
          lang={lang}
        />
      )}
    </div>
  );
}

function DocsFormModal({ worker, onCancel, onSave, lang }) {
  const [checked, setChecked] = useState(worker.docsChecked || {});
  const requiredItems = DOCS_CHECKLIST.filter((d) => d.required);
  const optionalItems = DOCS_CHECKLIST.filter((d) => !d.required);

  function toggle(key) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function ItemList({ items }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((d) => (
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
        <h4 style={{ marginTop: 0 }}>{t('必備文件', lang)}</h4>
        <ItemList items={requiredItems} />
        <h4>{t('依個案提供', lang)}</h4>
        <ItemList items={optionalItems} />
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button type="button" className="primary" onClick={() => onSave(checked)}>{t('儲存', lang)}</button>
          <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
        </div>
      </div>
    </div>
  );
}
