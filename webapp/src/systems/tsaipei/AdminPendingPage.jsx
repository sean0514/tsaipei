import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';

const STATUSES = ['未開始', '待處理', '進行中', '已完成'];
const STATUS_TAG_CLASS = { 未開始: 'tag-grey', 待處理: 'tag-amber', 進行中: 'tag-blue', 已完成: 'tag-green' };
const STATUS_DOT_COLOR = { 未開始: '#9ca3af', 待處理: '#f59e0b', 進行中: '#3b82f6', 已完成: '#22c55e' };

// 自由新增的代辦事項清單（不綁定任何既有資料），行政人員自己輸入事項、
// 日期、狀態、備註，勾選「完成」直接把狀態設為已完成；版面比照使用者
// 提供的截圖風格（粉色系卡片、貼紙感標題、狀態色標）。
export default function AdminPendingPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'adminPending', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_adminTodos', { order: ['startDate', 'asc'] });
  const [editing, setEditing] = useState(null);

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ status: '未開始', ...data });
    }
    setEditing(null);
  }

  function toggleDone(r) {
    update(r.id, { status: r.status === '已完成' ? '待處理' : '已完成' });
  }

  return (
    <div className="content">
      <div
        className="card"
        style={{
          marginBottom: 16,
          background: 'linear-gradient(135deg, #FFF8F0 0%, #FDEEF5 100%)',
          border: '1px solid #F6D9E6',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        }}
      >
        <div style={{ background: '#fff', borderRadius: 12, padding: '10px 16px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', fontSize: 13, fontWeight: 600, color: '#B8698A' }}>
          🎀 一起把待辦事項完成吧！
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#7A4A5E' }}>📋 代辦事項清單</div>
          <div style={{ fontSize: 13, color: '#B8698A', marginTop: 4 }}>一件一件完成，會越來越好的！♥</div>
        </div>
        <div style={{ fontSize: 13, color: '#B8698A', textAlign: 'right' }}>
          <div style={{ fontSize: 22 }}>🐱📚🌷✨</div>
          <div>加油！</div>
        </div>
      </div>

      <div className="page-header">
        <div>
          <h2>行政未完成事項</h2>
          <div className="page-desc">自由新增/編輯代辦事項，勾選「完成」或直接切換狀態{!canEditPage && '（唯讀）'}</div>
        </div>
        {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增事項</button>}
      </div>

      {loading ? <p className="muted">載入中…</p> : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>完成</th><th>事項</th><th>開始日期</th><th>截止日期</th><th>狀態</th><th>備註</th>
                  {canEditPage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input type="checkbox" checked={r.status === '已完成'} disabled={!canEditPage} onChange={() => toggleDone(r)} />
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.title || '—'}</div>
                      {r.subtitle && <div className="muted" style={{ fontSize: 12 }}>{r.subtitle}</div>}
                    </td>
                    <td>{r.startDate || '—'}</td>
                    <td>{r.endDate || '—'}</td>
                    <td><span className={`tag ${STATUS_TAG_CLASS[r.status] || 'tag-grey'}`}>{r.status || '未開始'}</span></td>
                    <td>{r.notes || '—'}</td>
                    {canEditPage && (
                      <td className="row-actions">
                        <button onClick={() => setEditing(r)}>編輯</button>
                        <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                      </td>
                    )}
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={canEditPage ? 7 : 6} className="muted">目前沒有代辦事項。</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 14, alignItems: 'center' }}>
            {STATUSES.map((s) => (
              <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_DOT_COLOR[s], display: 'inline-block' }} />
                {s}
              </span>
            ))}
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>慢慢做，都會完成的！♥</span>
          </div>
        </div>
      )}

      {editing && <TodoFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function TodoFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯事項' : '新增事項'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label style={{ gridColumn: 'span 2' }}>
              事項
              <input required value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              說明（顯示在事項下方的小字，選填）
              <input value={form.subtitle || ''} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
            </label>
            <label>
              開始日期
              <input type="date" value={form.startDate || ''} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </label>
            <label>
              截止日期
              <input type="date" value={form.endDate || ''} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </label>
            <label>
              狀態
              <select value={form.status || '未開始'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              備註
              <input value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
          </div>
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
