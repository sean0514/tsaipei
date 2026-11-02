import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { DOCS_CHECKLIST, SOUTH_VIETNAM_EXTRA_NOTE, requiredDocsDone, employerLabel } from './constants';

const REQUIRED_COUNT = DOCS_CHECKLIST.filter((d) => d.required).length;

export default function DocsChecklistPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'docsChecklist', role, overrides);
  const { rows: workers, loading, update } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');
  const [editing, setEditing] = useState(null);

  const sorted = [...workers].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>文件追蹤</h2>
          <div className="page-desc">挑到工人後需要收集的文件清單，必備（✅）與依個案提供（⭕）分開追蹤{!canEditPage && '（唯讀）'}</div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0 }}>{SOUTH_VIETNAM_EXTRA_NOTE}</p>
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="table-wrap"><table>
            <thead><tr><th>姓名</th><th>雇主</th><th>階段</th><th>必備文件進度</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {sorted.map((w) => {
                const done = requiredDocsDone(w);
                return (
                  <tr key={w.id}>
                    <td style={{ fontWeight: 600 }}>{w.name}</td>
                    <td>{employerLabel(employers, w.employerId)}</td>
                    <td>{w.stage || '—'}</td>
                    <td>
                      <span className={`tag ${done === REQUIRED_COUNT ? 'tag-green' : done === 0 ? 'tag-grey' : 'tag-amber'}`}>
                        {done} / {REQUIRED_COUNT}
                      </span>
                    </td>
                    {canEditPage && <td><button onClick={() => setEditing(w)}>編輯文件</button></td>}
                  </tr>
                );
              })}
              {sorted.length === 0 && <tr><td colSpan={canEditPage ? 5 : 4} className="muted">尚未建立移工資料</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}
      {editing && (
        <DocsFormModal
          worker={editing}
          onCancel={() => setEditing(null)}
          onSave={async (docsChecked) => { await update(editing.id, { docsChecked }); setEditing(null); }}
        />
      )}
    </div>
  );
}

function DocsFormModal({ worker, onCancel, onSave }) {
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
              <div>{d.label}</div>
              <div className="muted" style={{ fontSize: 12 }}>{d.note}</div>
            </span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{worker.name} － 文件清單</h3>
        <h4 style={{ marginTop: 0 }}>必備文件</h4>
        <ItemList items={requiredItems} />
        <h4>依個案提供</h4>
        <ItemList items={optionalItems} />
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button type="button" className="primary" onClick={() => onSave(checked)}>儲存</button>
          <button type="button" onClick={onCancel}>取消</button>
        </div>
      </div>
    </div>
  );
}
