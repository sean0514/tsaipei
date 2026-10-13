import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';

const STATUSES = ['未開始', '待處理', '進行中', '已完成'];
const STATUS_TAG_CLASS = { 未開始: 'tag-grey', 待處理: 'tag-amber', 進行中: 'tag-blue', 已完成: 'tag-green' };
const STATUS_DOT_COLOR = { 未開始: '#9ca3af', 待處理: '#f59e0b', 進行中: '#3b82f6', 已完成: '#22c55e' };

// 複製自 systems/tsaipei/AdminPendingPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function AdminPendingPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'adminPending', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('vietnam_adminTodos', { order: ['startDate', 'asc'] });
  const [editing, setEditing] = useState(null);

  async function handleSave(data) {
    try {
      if (data.id) {
        const { id, ...rest } = data;
        await update(id, rest);
      } else {
        await add({ status: '未開始', ...data });
      }
      setEditing(null);
    } catch (err) {
      alert(`儲存失敗：${err?.message || '請稍後再試'}`);
    }
  }

  async function toggleDone(r) {
    try {
      await update(r.id, { status: r.status === '已完成' ? '待處理' : '已完成' });
    } catch (err) {
      alert(`更新失敗：${err?.message || '請稍後再試'}`);
    }
  }

  async function handleRemove(id) {
    try {
      await remove(id);
    } catch (err) {
      alert(`刪除失敗：${err?.message || '請稍後再試'}`);
    }
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
          🎀 {t('一起把待辦事項完成吧！', lang)}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#7A4A5E' }}>📋 {t('代辦事項清單', lang)}</div>
          <div style={{ fontSize: 13, color: '#B8698A', marginTop: 4 }}>{t('一件一件完成，會越來越好的！♥', lang)}</div>
        </div>
        <div style={{ fontSize: 13, color: '#B8698A', textAlign: 'right' }}>
          <div style={{ fontSize: 22 }}>🐱📚🌷✨</div>
          <div>{t('加油！', lang)}</div>
        </div>
      </div>

      <div className="page-header">
        <div>
          <h2>{t('行政未完成事項', lang)}</h2>
          <div className="page-desc">{t('自由新增/編輯代辦事項，勾選「完成」或直接切換狀態', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增事項', lang)}</button>}
      </div>

      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('完成', lang)}</th><th>{t('事項', lang)}</th><th>{t('開始日期', lang)}</th><th>{t('截止日期', lang)}</th><th>{t('狀態', lang)}</th><th>{t('備註', lang)}</th>
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
                        <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                        <button className="danger" onClick={() => handleRemove(r.id)}>{t('刪除', lang)}</button>
                      </td>
                    )}
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={canEditPage ? 7 : 6} className="muted">{t('目前沒有代辦事項。', lang)}</td></tr>}
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
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>{t('慢慢做，都會完成的！♥', lang)}</span>
          </div>
        </div>
      )}

      {editing && <TodoFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function TodoFormModal({ initial, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯事項', lang) : t('新增事項', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label style={{ gridColumn: 'span 2' }}>
              {t('事項', lang)}
              <input required value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              {t('說明（顯示在事項下方的小字，選填）', lang)}
              <input value={form.subtitle || ''} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
            </label>
            <label>
              {t('開始日期', lang)}
              <input type="date" value={form.startDate || ''} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </label>
            <label>
              {t('截止日期', lang)}
              <input type="date" value={form.endDate || ''} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </label>
            <label>
              {t('狀態', lang)}
              <select value={form.status || '未開始'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              {t('備註', lang)}
              <input value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
