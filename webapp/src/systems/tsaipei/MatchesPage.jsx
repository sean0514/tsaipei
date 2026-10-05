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

const STATUSES = ['媒合中', '已媒合', '取消'];
const PROGRAMS = ['經濟部', '交通部'];
const NATIONALITIES = ['越南', '印尼', '泰國', '菲律賓', '台灣'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' }, { key: 'positionId', label: '職缺ID' },
  { key: 'venue', label: '實習場域' }, { key: 'status', label: '狀態' }, { key: 'matchDate', label: '媒合日期' },
  { key: 'program', label: '來台方案' }, { key: 'notes', label: '備註' }, { key: 'confirmedClosed', label: '結案' },
];

export default function MatchesPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'matches', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_matches');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: positions } = useCollection('tsaipei_positions');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  // 開會時常需要只看某個狀態/國籍/方案/客戶的媒合紀錄，加上篩選下拉選單
  // 讓畫面可以直接縮小範圍秀出，不用一直捲動找資料。
  const [filterStatus, setFilterStatus] = useState('');
  const [filterNationality, setFilterNationality] = useState('');
  const [filterProgram, setFilterProgram] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_matches', CSV_FIELDS, { entityLabel: '媒合紀錄', requiredKeys: ['studentId', 'positionId'], canEdit: canEditPage });

  const studentById = (id) => students.find((x) => x.id === id);
  const studentName = (id) => { const s = studentById(id); return s?.chineseName || s?.originalName || '(未設定)'; };
  const studentNationality = (id) => studentById(id)?.nationality || '未設定';
  const positionLabel = (id) => {
    const p = positions.find((x) => x.id === id);
    return p ? `${p.projectCode} ${p.company}` : '(未設定)';
  };
  const companyOf = (id) => positions.find((x) => x.id === id)?.company || '';
  const companies = [...new Set(positions.map((p) => p.company).filter(Boolean))].sort();
  // 篩選下拉選單的國籍選項要固定（不受目前篩選結果影響），不能用依篩選後
  // 資料算出來的 nationalityKeys，不然選了篩選條件後選單本身會跟著變動。
  const allNationalityKeys = [...NATIONALITIES, ...new Set(rows.map((r) => studentNationality(r.studentId)).filter((n) => !NATIONALITIES.includes(n)))];

  // 依建立時間排序，新的媒合紀錄（含新增學生時系統自動建立的那筆）浮在最上面；
  // 沒有 createdAt 的既有資料維持原本順序排在後面。搜尋依學生姓名／職缺（原本
  // matchesSearchQuery 的過濾邏輯）。
  const searchQuery = q.trim().toLowerCase();
  // 按過「結案」的紀錄從清單消失（資料還在，下載完整資料時仍會包含）；
  // 篩選條件（狀態/國籍/來台方案/客戶）都留空代表不篩選，直接顯示全部。
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

  // 依國籍分類，跟原本依狀態分類的邏輯改成同一套 group-by 寫法。
  const byNationality = {};
  sortedRows.forEach((r) => {
    const nat = studentNationality(r.studentId);
    (byNationality[nat] ||= []).push(r);
  });
  const nationalityKeys = [...NATIONALITIES, ...Object.keys(byNationality).filter((n) => !NATIONALITIES.includes(n))];

  // 媒合紀錄狀態改成「已媒合」時：媒合日期若空則帶入今天，並自動建立一筆
  // 二面進度（待安排），如同原本 Apps Script 版的自動連動邏輯。
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
      await addDoc(collection(db, 'tsaipei_secondInterviews'), { matchId, status: '待安排' });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>媒合紀錄</h2>
          <div className="page-desc">依國籍分類，將學生配對至職缺並追蹤媒合狀態{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增媒合</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「學生ID」「職缺ID」欄位）；上傳後會完全取代目前所有媒合紀錄，請先下載備份再匯入。</p>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'start', marginBottom: 16, flexWrap: 'wrap' }}>
        <input placeholder="搜尋學生或職缺" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">全部狀態</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterNationality} onChange={(e) => setFilterNationality(e.target.value)}>
          <option value="">全部國籍</option>
          {allNationalityKeys.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={filterProgram} onChange={(e) => setFilterProgram(e.target.value)}>
          <option value="">全部來台方案</option>
          {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
          <option value="">全部客戶</option>
          {companies.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(filterStatus || filterNationality || filterProgram || filterCompany) && (
          <button type="button" onClick={() => { setFilterStatus(''); setFilterNationality(''); setFilterProgram(''); setFilterCompany(''); }}>清除篩選</button>
        )}
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {nationalityKeys.filter((nat) => byNationality[nat]?.length).map((nat) => (
            <div className="card" key={nat}>
              <h3 style={{ marginTop: 0 }}>{nat} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {byNationality[nat].length} 筆</span></h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>學生</th><th>職缺</th><th>實習場域</th><th>狀態</th><th>媒合日期</th><th>來台方案</th>{canEditPage && <th></th>}</tr></thead>
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
                              <button onClick={() => setEditing(r)}>編輯</button>
                              <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                              <button onClick={() => update(r.id, { confirmedClosed: true })}>結案</button>
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
          {sortedRows.length === 0 && <p className="muted">目前沒有符合條件的媒合紀錄。</p>}
        </div>
      )}
      {editing && (
        <MatchFormModal initial={editing} students={students} positions={positions} onCancel={() => setEditing(null)} onSave={handleSave} />
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

function MatchFormModal({ initial, students, positions, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const position = positions.find((p) => p.id === form.positionId);
  const venues = position ? [...new Set(parseLocationGroups(position.locationGroups).map((g) => g.venue).filter(Boolean))] : [];
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯媒合紀錄' : '新增媒合紀錄'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              學生
              <select required value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                <option value="" disabled>請選擇</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.chineseName || s.originalName}</option>)}
              </select>
            </label>
            <label>
              職缺
              <select required value={form.positionId || ''} onChange={(e) => setForm({ ...form, positionId: e.target.value, venue: '' })}>
                <option value="" disabled>請選擇</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.projectCode} {p.company}</option>)}
              </select>
            </label>
            <label>
              實習場域
              {venues.length ? (
                <select value={form.venue || ''} onChange={(e) => setForm({ ...form, venue: e.target.value })}>
                  <option value="">請選擇實習場域</option>
                  {venues.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input value={form.venue || ''} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder={position ? '（此職缺未設定場域）' : '請先選擇職務'} />
              )}
            </label>
            <label>
              狀態
              <select value={form.status || '媒合中'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>
              媒合日期
              <input type="date" value={form.matchDate || ''} onChange={(e) => setForm({ ...form, matchDate: e.target.value })} />
            </label>
            <label>
              來台方案
              <select value={form.program || ''} onChange={(e) => setForm({ ...form, program: e.target.value })}>
                <option value="">請選擇</option>
                {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label>
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
