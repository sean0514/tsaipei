import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';
import { DOCS_CHECKLIST, SOUTH_VIETNAM_EXTRA_NOTE, requiredDocsDone, employerLabel } from './constants';

const REQUIRED_COUNT = DOCS_CHECKLIST.filter((d) => d.required).length;

export default function DocsChecklistPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'docsChecklist', role, overrides);
  const { rows: workers, loading, update } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');
  const [editing, setEditing] = useState(null);

  const sorted = [...workers].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('文件追蹤', lang)}</h2>
          <div className="page-desc">{t('挑到工人後需要收集的文件清單，必備（✅）與依個案提供（⭕）分開追蹤', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0 }}>{t(SOUTH_VIETNAM_EXTRA_NOTE, lang)}</p>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="table-wrap"><table>
            <thead><tr><th>{t('姓名', lang)}</th><th>{t('雇主', lang)}</th><th>{t('階段', lang)}</th><th>{t('必備文件進度', lang)}</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {sorted.map((w) => {
                const done = requiredDocsDone(w);
                return (
                  <tr key={w.id}>
                    <td style={{ fontWeight: 600 }}>{w.name}</td>
                    <td>{employerLabel(employers, w.employerId, lang)}</td>
                    <td>{t(w.stage, lang) || '—'}</td>
                    <td>
                      <span className={`tag ${done === REQUIRED_COUNT ? 'tag-green' : done === 0 ? 'tag-grey' : 'tag-amber'}`}>
                        {done} / {REQUIRED_COUNT}
                      </span>
                    </td>
                    {canEditPage && <td><button onClick={() => setEditing(w)}>{t('編輯文件', lang)}</button></td>}
                  </tr>
                );
              })}
              {sorted.length === 0 && <tr><td colSpan={canEditPage ? 5 : 4} className="muted">{t('尚未建立移工資料', lang)}</td></tr>}
            </tbody>
          </table></div>
        </div>
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
