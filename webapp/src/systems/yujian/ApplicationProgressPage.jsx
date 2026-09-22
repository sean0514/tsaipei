import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

// 外勞仲介的聘僱申辦流程，對應境外實習生系統的申辦進度追蹤（學生錄取→…→入台），
// 這裡改成「確認錄取→…→移交雇主」，之後如果需要更細的階段（例如分開申請招募
// 許可／聘僱許可），再依實際流程調整這個陣列即可。
export const STAGES = [
  '確認錄取', '體檢安排', '申請聘僱許可', '護照/簽證辦理', '訂購機票', '入境', '職前講習', '移交雇主',
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, { key: 'workerId', label: '人員ID' }, { key: 'currentStage', label: '目前進度' }, { key: 'notes', label: '備註' }];

function workerLabel(w) {
  if (!w) return '(已刪除)';
  if (w.chineseName && w.originalName) return `${w.chineseName}（${w.originalName}）`;
  return w.chineseName || w.originalName || '(未命名)';
}

function employerLabelForWorker(workerId, { matches, admittedList, employers }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.workerId === workerId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.workerId === workerId);
  if (!m) return '未指定雇主';
  const e = employers.find((ee) => ee.id === m.employerId);
  return e?.employerName || '未指定雇主';
}

function ProgressPipeline({ stage }) {
  const idx = STAGES.indexOf(stage);
  return (
    <div className="pipeline">
      {STAGES.map((step, i) => (
        <span key={step} className={`pip-step${idx >= 0 && i <= idx ? ' done' : ''}`}>{step}</span>
      ))}
    </div>
  );
}

export default function ApplicationProgressPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'applicationProgress', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('yujian_applicationProgress');
  const { rows: workers } = useCollection('yujian_workers');
  const { rows: matches } = useCollection('yujian_matches');
  const { rows: admittedList } = useCollection('yujian_admittedList');
  const { rows: employers } = useCollection('yujian_employers');
  const { handleExport, handleImport } = useCsvOverwrite('yujian_applicationProgress', CSV_FIELDS, { entityLabel: '申辦進度追蹤', requiredKeys: ['workerId'], canEdit: canEditPage });
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);

  const ctx = { matches, admittedList, employers };
  const workerById = (id) => workers.find((w) => w.id === id);
  const searchQuery = q.trim().toLowerCase();

  const filteredRows = rows.filter((r) => !searchQuery || `${workerLabel(workerById(r.workerId))} ${employerLabelForWorker(r.workerId, ctx)}`.toLowerCase().includes(searchQuery));
  const arrived = filteredRows.filter((r) => r.currentStage === '移交雇主');
  const notArrived = filteredRows.filter((r) => r.currentStage !== '移交雇主');

  function groupByEmployer(items) {
    const byEmployer = {};
    items.forEach((r) => {
      const employer = employerLabelForWorker(r.workerId, ctx);
      (byEmployer[employer] ||= []).push(r);
    });
    return Object.keys(byEmployer).sort((a, b) => a.localeCompare(b)).map((employer) => ({
      employer,
      items: byEmployer[employer].slice().sort((a, b) => workerLabel(workerById(a.workerId)).localeCompare(workerLabel(workerById(b.workerId)))),
    }));
  }

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add(data);
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>申辦進度追蹤</h2>
          <div className="page-desc">依雇主分類，追蹤每位人員從錄取到移交雇主的整體申辦流程{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({ currentStage: STAGES[0] })}>+ 新增進度紀錄</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「人員ID」欄位）；上傳後會完全取代目前所有進度紀錄，請先下載備份再匯入。</p>}
      <input placeholder="搜尋人員或雇主" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        filteredRows.length === 0 ? <p className="muted">尚無進度紀錄。人員「確認錄取」後會自動建立，也可以點選「新增進度紀錄」手動加入。</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <ArrivalSection title="辦理中" groups={groupByEmployer(notArrived)} canEditPage={canEditPage} ctx={ctx} workerById={workerById} onEdit={setEditing} onRemove={remove} />
            <ArrivalSection title="已移交雇主" groups={groupByEmployer(arrived)} canEditPage={canEditPage} ctx={ctx} workerById={workerById} onEdit={setEditing} onRemove={remove} />
          </div>
        )
      )}
      {editing && <ProgressFormModal initial={editing} workers={workers} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function ArrivalSection({ title, groups, canEditPage, ctx, workerById, onEdit, onRemove }) {
  const total = groups.reduce((sum, g) => sum + g.items.length, 0);
  return (
    <div>
      <h3 style={{ margin: '0 0 12px' }}>{title} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {total} 位人員</span></h3>
      {groups.length === 0 ? <p className="muted">目前沒有符合的人員。</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groups.map(({ employer, items }) => (
            <div className="card" key={employer}>
              <h4 style={{ marginTop: 0 }}>{employer} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{items.length} 位人員</span></h4>
              {items.map((r) => (
                <div key={r.id} className="progress-row">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{workerLabel(workerById(r.workerId))}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{employerLabelForWorker(r.workerId, ctx)}</div>
                    </div>
                    {canEditPage && (
                      <div className="row-actions">
                        <button onClick={() => onEdit(r)}>編輯</button>
                        <button className="danger" onClick={() => onRemove(r.id)}>刪除</button>
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <ProgressPipeline stage={r.currentStage} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressFormModal({ initial, workers, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯進度紀錄' : '新增進度紀錄'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <label>
            人員
            <select required disabled={!!initial.id} value={form.workerId || ''} onChange={(e) => setForm({ ...form, workerId: e.target.value })} style={{ marginBottom: 16 }}>
              <option value="" disabled>請選擇人員</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{workerLabel(w)}</option>)}
            </select>
          </label>
          <label>
            目前進度
            <select value={form.currentStage || STAGES[0]} onChange={(e) => setForm({ ...form, currentStage: e.target.value })} style={{ marginBottom: 16 }}>
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>
            備註
            <textarea rows={3} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ marginBottom: 16 }} />
          </label>
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
