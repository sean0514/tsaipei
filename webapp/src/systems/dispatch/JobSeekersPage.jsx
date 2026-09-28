import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, deleteDoc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const JOB_SEEKER_STATUS = ['求職中', '已媒合', '停止聯繫'];

const FIELDS = [
  { key: 'chineseName', label: '姓名', required: true },
  { key: 'gender', label: '性別', options: ['', '男', '女'] },
  { key: 'birthDate', label: '出生日期', type: 'date' },
  { key: 'idNumber', label: '身分證號' },
  { key: 'phone', label: '電話' },
  { key: 'email', label: 'Email' },
  { key: 'address', label: '地址' },
  { key: 'desiredPosition', label: '希望職缺' },
  { key: 'sourceChannel', label: '來源管道' },
  { key: 'status', label: '狀態' },
  { key: 'notes', label: '備註' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

export default function JobSeekersPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'jobSeekers', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('dispatch_jobSeekers');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('dispatch_jobSeekers', CSV_FIELDS, { entityLabel: '求職者資訊', canEdit: canEditPage });

  const sorted = [...rows].sort((a, b) => {
    const at = a.createdAt?.toMillis?.() ?? 0;
    const bt = b.createdAt?.toMillis?.() ?? 0;
    if (at !== bt) return bt - at;
    return (a.chineseName || '').localeCompare(b.chineseName || '');
  });
  const filtered = sorted.filter((r) => !q || [r.chineseName, r.phone, r.desiredPosition].some((v) => v?.includes(q)));

  // 新增求職者存檔後自動在「面試概況」建立一筆「待安排」的空白紀錄，比照
  // tsaipei StudentsPage 新增學生自動建立媒合紀錄的模式。
  async function handleSave(data) {
    try {
      if (data.id) {
        const { id, ...rest } = data;
        await update(id, rest);
      } else {
        const ref = await add({ status: JOB_SEEKER_STATUS[0], ...data, createdAt: serverTimestamp() });
        await addDoc(collection(db, 'dispatch_interviews'), {
          jobSeekerId: ref.id, company: '', position: '', status: '待安排', notes: '（系統依求職者建檔自動建立）', createdAt: serverTimestamp(),
        });
      }
      setEditing(null);
    } catch (err) {
      alert(`存檔失敗：${err.message || err}`);
    }
  }

  async function handleDelete(jobSeekerId) {
    if (!window.confirm('確定要刪除這位求職者嗎？相關的面試概況與在職/離職紀錄也會一併刪除。')) return;
    try {
      const [interviewsSnap, employmentSnap] = await Promise.all([
        getDocs(query(collection(db, 'dispatch_interviews'), where('jobSeekerId', '==', jobSeekerId))),
        getDocs(query(collection(db, 'dispatch_employmentStatus'), where('jobSeekerId', '==', jobSeekerId))),
      ]);
      const refs = [...interviewsSnap.docs.map((d) => d.ref), ...employmentSnap.docs.map((d) => d.ref)];
      for (let i = 0; i < refs.length; i += 450) {
        const batch = writeBatch(db);
        refs.slice(i, i + 450).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
      await remove(jobSeekerId);
    } catch (err) {
      alert(`刪除失敗：${err.message || err}`);
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>求職者資訊</h2>
          <div className="page-desc">管理求職者基本資料與狀態{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({ status: JOB_SEEKER_STATUS[0] })}>+ 新增求職者</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」欄位需與「下載完整資料」的 CSV 欄位一致；上傳後會完全取代目前所有求職者資料，請先下載備份再匯入。</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <input placeholder="搜尋姓名/電話/希望職缺" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead>
              <tr><th>姓名 / 性別</th><th>電話 / Email</th><th>希望職缺</th><th>來源管道</th><th>狀態</th>{canEditPage && <th></th>}</tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.chineseName}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{r.gender || '—'}</div>
                  </td>
                  <td>
                    {r.phone || '—'}
                    <div className="muted" style={{ fontSize: 12 }}>{r.email || ''}</div>
                  </td>
                  <td>{r.desiredPosition || '—'}</td>
                  <td>{r.sourceChannel || '—'}</td>
                  <td><span className="tag tag-blue">{r.status || '—'}</span></td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => handleDelete(r.id)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      {editing && <JobSeekerFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function JobSeekerFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯求職者' : '新增求職者'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                {f.key === 'status' ? (
                  <select value={form.status || JOB_SEEKER_STATUS[0]} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {JOB_SEEKER_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : f.options ? (
                  <select value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    {f.options.map((o) => <option key={o} value={o}>{o || '請選擇'}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
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
