import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { STAGES, STAGE_KEYS, JOBS, GENDERS, stageIndex, passportStatus, employerLabel } from './constants';

const FIELDS = [
  { key: 'name', label: '姓名（越南文姓名可直接輸入）', required: true },
  { key: 'gender', label: '性別', options: GENDERS },
  { key: 'province', label: '家鄉省份' },
  { key: 'job', label: '工種', options: JOBS },
  { key: 'employerId', label: '配對雇主' },
  { key: 'stage', label: '目前階段', options: STAGE_KEYS },
  { key: 'passportExpiry', label: '護照效期', type: 'date' },
  { key: 'note', label: '備註', type: 'textarea' },
];
const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

export default function WorkersPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'workers', role, overrides);
  const { rows: workers, loading, add, update, remove } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');
  const [view, setView] = useState('board');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('laborAgency_workers', CSV_FIELDS, { entityLabel: '移工資料', requiredKeys: ['name'], canEdit: canEditPage });

  const searchQuery = q.trim().toLowerCase();
  const filtered = workers
    .filter((w) => !searchQuery || `${w.name || ''} ${w.province || ''} ${employerLabel(employers, w.employerId)} ${w.stage || ''}`.toLowerCase().includes(searchQuery))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  async function handleSave(data) {
    const prevStage = editing?.stage || '';
    const payload = { ...data, stage: data.stage || STAGE_KEYS[0] };
    // 階段沒變就保留原本的 updatedAt（代表還停留在同一關），階段改變才
    // 重新蓋成現在時間，讓「停留超過 30 天」的判斷準確。
    payload.updatedAt = (editing?.id && prevStage === payload.stage) ? (editing.updatedAt || Date.now()) : Date.now();
    if (data.id) {
      const { id, ...rest } = payload;
      await update(id, rest);
    } else {
      await add(payload);
    }
    setEditing(null);
  }

  async function handleMoveStage(id, stage) {
    await update(id, { stage, updatedAt: Date.now() });
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>移工管理</h2>
          <div className="page-desc">越南移工案件進度管理，「案件看板」依階段分欄、「移工名冊」可搜尋編輯{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增移工</button>}
          <ImportExportButtons rows={workers} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      <div className="row-actions" style={{ marginBottom: 16 }}>
        <button className={view === 'board' ? 'primary' : ''} onClick={() => setView('board')}>案件看板</button>
        <button className={view === 'roster' ? 'primary' : ''} onClick={() => setView('roster')}>移工名冊</button>
        {view === 'roster' && <input placeholder="搜尋姓名、省份、雇主、階段" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />}
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        view === 'board' ? (
          <BoardView workers={filtered} employers={employers} canEditPage={canEditPage} onMoveStage={handleMoveStage} onEdit={setEditing} />
        ) : (
          <RosterView workers={filtered} employers={employers} onEdit={setEditing} />
        )
      )}
      {editing && (
        <WorkerFormModal initial={editing} employers={employers} onCancel={() => setEditing(null)} onSave={handleSave} onRemove={editing.id ? () => { remove(editing.id); setEditing(null); } : null} />
      )}
    </div>
  );
}

function BoardView({ workers, employers, canEditPage, onMoveStage, onEdit }) {
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
      {STAGES.map((s, i) => {
        const items = workers.filter((w) => stageIndex(w.stage) === i);
        return (
          <div key={s.key} className="card" style={{ minWidth: 220, flex: '0 0 220px' }} title={s.tip}>
            <h4 style={{ marginTop: 0, display: 'flex', justifyContent: 'space-between' }}>
              <span>{s.key}</span><span className="muted" style={{ fontWeight: 400 }}>{items.length}</span>
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((w) => {
                const ps = passportStatus(w);
                return (
                  <div key={w.id} className="card" style={{ padding: 10, cursor: 'pointer' }} onClick={() => onEdit(w)}>
                    <div style={{ fontWeight: 600 }}>{w.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{w.job || ''} · {employerLabel(employers, w.employerId)}</div>
                    <div style={{ marginTop: 6 }}><span className={`tag ${ps.cls}`}>{ps.label}</span></div>
                    {canEditPage && (
                      <select
                        value={w.stage}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onMoveStage(w.id, e.target.value)}
                        style={{ marginTop: 8, width: '100%' }}
                      >
                        {STAGE_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
              {items.length === 0 && <p className="muted" style={{ fontSize: 12, margin: 0 }}>沒有案件</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RosterView({ workers, employers, onEdit }) {
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <div className="table-wrap"><table>
        <thead><tr><th>姓名</th><th>性別</th><th>省份</th><th>工種</th><th>雇主</th><th>階段</th><th>護照效期</th><th>證件狀態</th></tr></thead>
        <tbody>
          {workers.map((w) => {
            const ps = passportStatus(w);
            return (
              <tr key={w.id} style={{ cursor: 'pointer' }} onClick={() => onEdit(w)}>
                <td style={{ fontWeight: 600 }}>{w.name}</td>
                <td>{w.gender || '—'}</td>
                <td>{w.province || '—'}</td>
                <td>{w.job || '—'}</td>
                <td>{employerLabel(employers, w.employerId)}</td>
                <td>{w.stage}</td>
                <td>{w.passportExpiry || '—'}</td>
                <td><span className={`tag ${ps.cls}`}>{ps.label}</span></td>
              </tr>
            );
          })}
          {workers.length === 0 && <tr><td colSpan={8} className="muted">{workers.length ? '沒有符合的移工' : '尚未建立移工資料'}</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}

function WorkerFormModal({ initial, employers, onCancel, onSave, onRemove }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯移工' : '新增移工'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.filter((f) => f.type !== 'textarea' && f.key !== 'employerId').map((f) => (
              <label key={f.key}>
                {f.label}
                {f.options ? (
                  <select required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    <option value="">請選擇</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
            <label>
              配對雇主
              <select value={form.employerId || ''} onChange={(e) => setForm({ ...form, employerId: e.target.value })}>
                <option value="">尚未配對</option>
                {employers.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </label>
          </div>
          <label>
            備註
            <textarea rows={3} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ marginBottom: 16 }} />
          </label>
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
            {onRemove && <button type="button" className="danger" onClick={onRemove}>刪除</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
