import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import Tag from '../../components/Tag';
import { STUDENT_TAG } from '../../lib/tags';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

// Core fields shown here; the full schema (apps-script/Code.gs SHEET_FIELDS.Students)
// has ~29 fields (language-proof docs, visa dates, etc.) — add them to FIELDS
// below following the same {key,label} pattern as more of this module is ported.
const FIELDS = [
  { key: 'chineseName', label: '中文姓名', required: true },
  { key: 'originalName', label: '原始姓名' },
  { key: 'school', label: '就讀學校' },
  { key: 'nationality', label: '國籍' },
  { key: 'gender', label: '性別' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: '電話' },
  { key: 'startDate', label: '實習開始日', type: 'date' },
  { key: 'endDate', label: '實習結束日', type: 'date' },
  { key: 'status', label: '狀態' },
  { key: 'notes', label: '備註' },
];
const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS];

// 入境/離境日期跟文件齊全度原本都是學生資料表格上的欄位；這個 port 把入境/離境
// 日期存在「在台簽證追蹤」（同 DashboardPage 的 effectiveEntryDate/effectiveExitDate
// 邏輯），文件齊全度則直接數「實習文件追蹤」裡該學生已核准/不適用的筆數，
// 跟原本 docChecklist() 用學生資料上一組獨立的證明欄位不是同一套資料來源，
// 但顯示效果一致。
function effectiveEntryDate(v) { return v?.secondEntryDate || v?.firstEntryDate || ''; }
function effectiveExitDate(v) { return v?.secondExitDate || v?.firstExitDate || ''; }

export default function StudentsPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'students', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_students', { order: ['chineseName', 'asc'] });
  const { rows: visaRecords } = useCollection('tsaipei_inTaiwanVisa');
  const { rows: internshipDocs } = useCollection('tsaipei_internshipDocs');
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {...} = editing
  const [q, setQ] = useState('');

  const filtered = rows.filter((r) => !q || [r.chineseName, r.originalName, r.school, r.nationality].some((v) => v?.includes(q)));
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_students', CSV_FIELDS, { entityLabel: '學生資料', canEdit: canEditPage });

  // 新增學生存檔後自動在「媒合紀錄」建立一筆「媒合中」的空白紀錄（職缺待補），
  // 沿用原本 Apps Script 版的行為。
  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      const ref = await add(data);
      await addDoc(collection(db, 'tsaipei_matches'), { studentId: ref.id, positionId: '', status: '媒合中' });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>學生資料</h2>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>新增學生</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <input placeholder="搜尋姓名/學校/國籍" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead>
              <tr>
                <th>姓名 / 國籍</th><th>學校</th><th>電話</th><th>入境 / 離境</th><th>文件</th><th>狀態</th>
                {canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const visa = visaRecords.find((v) => v.studentId === r.id);
                const docs = internshipDocs.filter((d) => d.studentId === r.id);
                const done = docs.filter((d) => d.status === '已核准' || d.status === '不適用').length;
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.chineseName}{r.originalName ? `（${r.originalName}）` : ''}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{r.nationality || '—'}</div>
                    </td>
                    <td>{r.school || '—'}</td>
                    <td>{r.phone || '—'}</td>
                    <td>{effectiveEntryDate(visa) || '—'} ~ {effectiveExitDate(visa) || '—'}</td>
                    <td>{docs.length > 0 && <span className={`tag ${done === docs.length ? 'tag-green' : 'tag-amber'}`}>{done}/{docs.length}</span>}</td>
                    <td><Tag value={r.status} map={STUDENT_TAG} /></td>
                    {canEditPage && (
                      <td className="row-actions">
                        <button onClick={() => setEditing(r)}>編輯</button>
                        <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={7} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {editing && (
        <StudentFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />
      )}
    </div>
  );
}

function StudentFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯學生' : '新增學生'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  type={f.type || 'text'}
                  required={f.required}
                  value={form[f.key] || ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
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
