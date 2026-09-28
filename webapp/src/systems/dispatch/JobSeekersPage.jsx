import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, deleteDoc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

// 比照使用者提供的「招募人員資訊」Excel 欄位結構。
const JOB_SEEKER_STATUS = ['求職中', '在職', '離職'];

const FIELDS = [
  { key: 'recruiter', label: '招募專員' },
  { key: 'interviewer', label: '面試專員' },
  { key: 'onsiteSpecialist', label: '駐廠專員' },
  { key: 'recruitDept', label: '招募部門' },
  { key: 'interviewDept', label: '面試部門' },
  { key: 'onsiteDept', label: '駐廠部門' },
  { key: 'client', label: '廠商名稱' },
  { key: 'branch', label: '分店名稱' },
  { key: 'chineseName', label: '姓名', required: true },
  { key: 'idNumber', label: '身份證字號' },
  { key: 'startDate', label: '報到日期', type: 'date' },
  { key: 'insuranceEndDate', label: '退保日期', type: 'date' },
  { key: 'lastWorkDate', label: '最後工作日', type: 'date' },
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
  const filtered = sorted.filter((r) => !q || [r.chineseName, r.idNumber, r.client, r.branch].some((v) => v?.includes(q)));

  // 狀態為「在職」或「離職」時，同步到「在職/離職概況」（依求職者ID upsert，
  // 避免重複建立），比照面試概況報到自動帶入在職名單的模式。
  async function syncEmploymentStatus(jobSeekerId, data) {
    if (data.status !== '在職' && data.status !== '離職') return;
    const payload = {
      jobSeekerId, client: data.client || '', position: data.branch || '',
      startDate: data.startDate || '', endDate: data.status === '離職' ? (data.lastWorkDate || data.insuranceEndDate || '') : '',
      status: data.status,
    };
    const existing = await getDocs(query(collection(db, 'dispatch_employmentStatus'), where('jobSeekerId', '==', jobSeekerId)));
    if (existing.empty) {
      await addDoc(collection(db, 'dispatch_employmentStatus'), payload);
    } else {
      const batch = writeBatch(db);
      existing.docs.forEach((d) => batch.update(d.ref, payload));
      await batch.commit();
    }
  }

  async function handleSave(data) {
    try {
      let id = data.id;
      if (id) {
        const { id: _id, ...rest } = data;
        await update(id, rest);
      } else {
        const ref = await add({ status: JOB_SEEKER_STATUS[0], ...data, createdAt: serverTimestamp() });
        id = ref.id;
      }
      await syncEmploymentStatus(id, data);
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
          <div className="page-desc">管理求職者招募、面試與駐廠資訊{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({ status: JOB_SEEKER_STATUS[0] })}>+ 新增求職者</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」欄位需與「下載完整資料」的 CSV 欄位一致；上傳後會完全取代目前所有求職者資料，請先下載備份再匯入。狀態為「在職」或「離職」時會自動同步到「在職/離職概況」。</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <input placeholder="搜尋姓名/身分證號/廠商/分店" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead>
              <tr><th>姓名 / 身份證字號</th><th>廠商 / 分店</th><th>招募 / 面試 / 駐廠專員</th><th>報到日期</th><th>狀態</th>{canEditPage && <th></th>}</tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.chineseName}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{r.idNumber || '—'}</div>
                  </td>
                  <td>
                    {r.client || '—'}
                    <div className="muted" style={{ fontSize: 12 }}>{r.branch || ''}</div>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{[r.recruiter, r.interviewer, r.onsiteSpecialist].filter(Boolean).join(' / ') || '—'}</td>
                  <td>{r.startDate || '—'}</td>
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
