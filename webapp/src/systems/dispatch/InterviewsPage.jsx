import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { INTERVIEW_TAG } from '../../lib/tags';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import StatusSections from '../../components/StatusSections';
import SegmentedControl from '../../components/SegmentedControl';

const STATUSES = ['待安排', '已面試', '已錄取', '已訓練', '報到', '取消'];

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'jobSeekerId', label: '求職者ID' }, { key: 'company', label: '客戶公司' },
  { key: 'position', label: '應徵職務' }, { key: 'interviewDate', label: '面試日期' }, { key: 'status', label: '進度狀態' }, { key: 'notes', label: '備註' },
];

export default function InterviewsPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'interviews', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('dispatch_interviews');
  const { rows: jobSeekers } = useCollection('dispatch_jobSeekers');
  const { rows: clientFeeSetupRows } = useCollection('dispatch_clientFeeSetup');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('dispatch_interviews', CSV_FIELDS, { entityLabel: '面試概況', requiredKeys: ['jobSeekerId'], canEdit: canEditPage });

  function jobSeekerName(id) {
    const s = jobSeekers.find((x) => x.id === id);
    return s?.chineseName || '(未設定)';
  }

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows.filter((r) => !searchQuery || `${jobSeekerName(r.jobSeekerId)} ${r.company || ''} ${r.position || ''}`.toLowerCase().includes(searchQuery));

  // 進度狀態變成「報到」時自動建立在職紀錄（狀態：在職），先檢查該求職者
  // 是否已有這個客戶的在職紀錄，避免重複建立。
  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add(data);
    }
    if (data.status === '報到' && data.jobSeekerId) {
      const existing = await getDocs(query(
        collection(db, 'dispatch_employmentStatus'),
        where('jobSeekerId', '==', data.jobSeekerId),
        where('client', '==', data.company || '')
      ));
      if (existing.empty) {
        await addDoc(collection(db, 'dispatch_employmentStatus'), {
          jobSeekerId: data.jobSeekerId, client: data.company || '', position: data.position || '',
          startDate: new Date().toISOString().slice(0, 10), status: '在職', notes: '（系統依面試報到自動建立）',
        });
      }
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>面試概況</h2>
          <div className="page-desc">依進度狀態自動分類，追蹤求職者面試與報到進度{!canEditPage && '（唯讀）'}</div>
        </div>
        <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「求職者ID」欄位）；上傳後會完全取代目前所有面試概況資料，請先下載備份再匯入。狀態變成「報到」時會自動帶入「在職/離職概況」。</p>}
      <input placeholder="搜尋求職者姓名或客戶公司/職務" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        <StatusSections
          statuses={STATUSES}
          tagMap={INTERVIEW_TAG}
          rows={filteredRows}
          sortKey="interviewDate"
          colSpan={canEditPage ? 5 : 4}
          headerCells={<><th>求職者</th><th>客戶公司</th><th>應徵職務</th><th>面試日期</th>{canEditPage && <th></th>}</>}
          renderRow={(r) => (
            <tr key={r.id}>
              <td>{jobSeekerName(r.jobSeekerId)}</td>
              <td>{r.company || '—'}</td>
              <td>{r.position || '—'}</td>
              <td>{r.interviewDate || '—'}</td>
              {canEditPage && (
                <td className="row-actions">
                  <button onClick={() => setEditing(r)}>編輯</button>
                  <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                </td>
              )}
            </tr>
          )}
        />
      )}
      {editing && <InterviewFormModal initial={editing} jobSeekers={jobSeekers} clientFeeSetupRows={clientFeeSetupRows} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function InterviewFormModal({ initial, jobSeekers, clientFeeSetupRows, onCancel, onSave }) {
  const [form, setForm] = useState(initial);

  // 選擇求職者時，客戶公司同步帶入求職者資訊的廠商名稱（仍可手動改成不同客戶）。
  function handleJobSeekerChange(id) {
    const s = jobSeekers.find((x) => x.id === id);
    setForm({ ...form, jobSeekerId: id, company: s?.client || form.company });
  }

  // 客戶公司改下拉選單，選項從「客戶費用建檔」的客戶名稱抓取；目前表單裡
  // 填的值就算不在清單裡也要保留（例如求職者帶入的舊客戶名稱）。
  const clientOptions = [...new Set(clientFeeSetupRows.map((r) => r.client).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (form.company && !clientOptions.includes(form.company)) clientOptions.push(form.company);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯面試進度' : '新增面試進度'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              求職者
              <select required value={form.jobSeekerId || ''} onChange={(e) => handleJobSeekerChange(e.target.value)}>
                <option value="" disabled>請選擇</option>
                {jobSeekers.map((s) => <option key={s.id} value={s.id}>{s.chineseName}</option>)}
              </select>
            </label>
            <label>
              客戶公司
              <select value={form.company || ''} onChange={(e) => setForm({ ...form, company: e.target.value })}>
                <option value="">請選擇</option>
                {clientOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label>
              應徵職務
              <input value={form.position || ''} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </label>
            <label>
              面試日期
              <input type="date" value={form.interviewDate || ''} onChange={(e) => setForm({ ...form, interviewDate: e.target.value })} />
            </label>
          </div>
          <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-muted)' }}>進度狀態</div>
          <SegmentedControl name="interview-status" options={STATUSES} value={form.status || '待安排'} onChange={(v) => setForm({ ...form, status: v })} />
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
