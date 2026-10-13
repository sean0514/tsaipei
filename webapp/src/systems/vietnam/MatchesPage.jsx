import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { MATCH_TAG } from '../../lib/tags';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import Tag from '../../components/Tag';
import { t } from '../../lib/i18n';

const STATUSES = ['媒合中', '已媒合', '取消'];
const PROGRAMS = ['經濟部', '交通部'];
const NATIONALITIES = ['越南', '印尼', '泰國', '菲律賓', '台灣'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' }, { key: 'positionId', label: '職缺ID' },
  { key: 'venue', label: '實習場域' }, { key: 'status', label: '狀態' }, { key: 'matchDate', label: '媒合日期' },
  { key: 'program', label: '來台方案' }, { key: 'notes', label: '備註' }, { key: 'confirmedClosed', label: '結案' },
];

// 複製自 systems/tsaipei/MatchesPage.jsx，collection 字首改成 vietnam_，
// 介面文字包上 t(...)。
export default function MatchesPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'matches', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('vietnam_matches');
  const { rows: students } = useCollection('vietnam_students');
  const { rows: positions } = useCollection('vietnam_positions');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterNationality, setFilterNationality] = useState('');
  const [filterProgram, setFilterProgram] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_matches', CSV_FIELDS, { entityLabel: '媒合紀錄', requiredKeys: ['studentId', 'positionId'], canEdit: canEditPage });

  const studentById = (id) => students.find((x) => x.id === id);
  const studentName = (id) => { const s = studentById(id); return s?.chineseName || s?.originalName || '(未設定)'; };
  const studentNationality = (id) => studentById(id)?.nationality || '未設定';
  const positionLabel = (id) => {
    const p = positions.find((x) => x.id === id);
    return p ? `${p.projectCode} ${p.company}` : '(未設定)';
  };
  const companyOf = (id) => positions.find((x) => x.id === id)?.company || '';
  const companies = [...new Set(positions.map((p) => p.company).filter(Boolean))].sort();
  const allNationalityKeys = [...NATIONALITIES, ...new Set(rows.map((r) => studentNationality(r.studentId)).filter((n) => !NATIONALITIES.includes(n)))];

  const searchQuery = q.trim().toLowerCase();
  const sortedRows = [...rows]
    .filter((r) => !r.confirmedClosed)
    .filter((r) => !searchQuery || `${studentName(r.studentId)} ${positionLabel(r.positionId)}`.toLowerCase().includes(searchQuery))
    .filter((r) => !filterStatus || (r.status || '媒合中') === filterStatus)
    .filter((r) => !filterNationality || studentNationality(r.studentId) === filterNationality)
    .filter((r) => !filterProgram || r.program === filterProgram)
    .filter((r) => !filterCompany || companyOf(r.positionId) === filterCompany)
    .sort((a, b) => {
      const at = a.createdAt?.toMillis?.() ?? 0;
      const bt = b.createdAt?.toMillis?.() ?? 0;
      return bt - at;
    });

  const byNationality = {};
  sortedRows.forEach((r) => {
    const nat = studentNationality(r.studentId);
    (byNationality[nat] ||= []).push(r);
  });
  const nationalityKeys = [...NATIONALITIES, ...Object.keys(byNationality).filter((n) => !NATIONALITIES.includes(n))];

  async function handleSave(data) {
    const wasMatched = editing?.status === '已媒合';
    const payload = { ...data };
    if (payload.status === '已媒合' && !payload.matchDate) {
      payload.matchDate = new Date().toISOString().slice(0, 10);
    }
    let matchId = data.id;
    if (matchId) {
      const { id, ...rest } = payload;
      await update(id, rest);
    } else {
      const ref = await add({ ...payload, createdAt: serverTimestamp() });
      matchId = ref.id;
    }
    if (payload.status === '已媒合' && !wasMatched) {
      await addDoc(collection(db, 'vietnam_secondInterviews'), { matchId, status: '待安排' });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('媒合紀錄', lang)}</h2>
          <div className="page-desc">{t('依國籍分類，將學生配對至職缺並追蹤媒合狀態', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增媒合', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「學生ID」「職缺ID」欄位）；上傳後會完全取代目前所有媒合紀錄，請先下載備份再匯入。', lang)}</p>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'start', marginBottom: 16, flexWrap: 'wrap' }}>
        <input placeholder={t('搜尋學生或職缺', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">{t('全部狀態', lang)}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterNationality} onChange={(e) => setFilterNationality(e.target.value)}>
          <option value="">{t('全部國籍', lang)}</option>
          {allNationalityKeys.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={filterProgram} onChange={(e) => setFilterProgram(e.target.value)}>
          <option value="">{t('全部來台方案', lang)}</option>
          {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
          <option value="">{t('全部客戶', lang)}</option>
          {companies.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(filterStatus || filterNationality || filterProgram || filterCompany) && (
          <button type="button" onClick={() => { setFilterStatus(''); setFilterNationality(''); setFilterProgram(''); setFilterCompany(''); }}>{t('清除篩選', lang)}</button>
        )}
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {nationalityKeys.filter((nat) => byNationality[nat]?.length).map((nat) => (
            <div className="card" key={nat}>
              <h3 style={{ marginTop: 0 }}>{nat} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{t('共', lang)} {byNationality[nat].length} {t('筆', lang)}</span></h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t('學生', lang)}</th><th>{t('職缺', lang)}</th><th>{t('實習場域', lang)}</th><th>{t('狀態', lang)}</th><th>{t('媒合日期', lang)}</th><th>{t('來台方案', lang)}</th>{canEditPage && <th></th>}</tr></thead>
                  <tbody>
                    {byNationality[nat].map((r) => (
                      <tr key={r.id}>
                        <td>{studentName(r.studentId)}</td>
                        <td>{positionLabel(r.positionId)}</td>
                        <td>{r.venue || '—'}</td>
                        <td><Tag value={r.status} map={MATCH_TAG} /></td>
                        <td>{r.matchDate || '—'}</td>
                        <td>{r.program || '—'}</td>
                        {canEditPage && (
                          <td>
                            <div className="row-actions">
                              <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                              <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                              <button onClick={() => update(r.id, { confirmedClosed: true })}>{t('結案', lang)}</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {sortedRows.length === 0 && <p className="muted">{t('目前沒有符合條件的媒合紀錄。', lang)}</p>}
        </div>
      )}
      {editing && (
        <MatchFormModal initial={editing} students={students} positions={positions} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />
      )}
    </div>
  );
}

function parseLocationGroups(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function MatchFormModal({ initial, students, positions, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const position = positions.find((p) => p.id === form.positionId);
  const venues = position ? [...new Set(parseLocationGroups(position.locationGroups).map((g) => g.venue).filter(Boolean))] : [];
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯媒合紀錄', lang) : t('新增媒合紀錄', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('學生', lang)}
              <select required value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                <option value="" disabled>{t('請選擇', lang)}</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.chineseName || s.originalName}</option>)}
              </select>
            </label>
            <label>
              {t('職缺', lang)}
              <select value={form.positionId || ''} onChange={(e) => setForm({ ...form, positionId: e.target.value, venue: '' })}>
                <option value="">{t('（未設定）', lang)}</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.projectCode} {p.company}</option>)}
              </select>
            </label>
            <label>
              {t('實習場域', lang)}
              {venues.length ? (
                <select value={form.venue || ''} onChange={(e) => setForm({ ...form, venue: e.target.value })}>
                  <option value="">{t('請選擇實習場域', lang)}</option>
                  {venues.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input value={form.venue || ''} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder={position ? t('（此職缺未設定場域）', lang) : t('請先選擇職務', lang)} />
              )}
            </label>
            <label>
              {t('狀態', lang)}
              <select value={form.status || '媒合中'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>
              {t('媒合日期', lang)}
              <input type="date" value={form.matchDate || ''} onChange={(e) => setForm({ ...form, matchDate: e.target.value })} />
            </label>
            <label>
              {t('來台方案', lang)}
              <select value={form.program || ''} onChange={(e) => setForm({ ...form, program: e.target.value })}>
                <option value="">{t('請選擇', lang)}</option>
                {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label>
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
