import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { SECOND_INTERVIEW_TAG } from '../../lib/tags';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import StatusSections from '../../components/StatusSections';
import SegmentedControl from '../../components/SegmentedControl';
import { t } from '../../lib/i18n';

const STATUSES = ['待安排', '已安排', '通過', '未通過'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'matchId', label: '媒合ID' }, { key: 'date', label: '二面日期' },
  { key: 'method', label: '面試方式' }, { key: 'status', label: '進度狀態' }, { key: 'notes', label: '備註' },
  { key: 'confirmedClosed', label: '結案' },
];

// 複製自 systems/tsaipei/SecondInterviewsPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。StatusSections/SegmentedControl 是跨系統
// 共用元件，內部文字維持中文，尚未納入雙語切換範圍。
export default function SecondInterviewsPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'secondInterview', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('vietnam_secondInterviews');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: students } = useCollection('vietnam_students');
  const { rows: positions } = useCollection('vietnam_positions');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_secondInterviews', CSV_FIELDS, { entityLabel: '二面進度', requiredKeys: ['matchId'], canEdit: canEditPage });

  function matchLabel(matchId) {
    const m = matches.find((x) => x.id === matchId);
    if (!m) return '(未設定)';
    const st = students.find((x) => x.id === m.studentId);
    const s = st?.chineseName || st?.originalName || '?';
    const p = positions.find((x) => x.id === m.positionId);
    return `${s} · ${p ? `${p.projectCode} ${p.company}` : '?'}`;
  }

  const searchQuery = q.trim().toLowerCase();
  const filteredRows = rows
    .filter((r) => !r.confirmedClosed)
    .filter((r) => !searchQuery || matchLabel(r.matchId).toLowerCase().includes(searchQuery));

  async function handleSave(data) {
    let id = data.id;
    if (id) {
      const { id: _id, ...rest } = data;
      await update(id, rest);
    } else {
      const ref = await add(data);
      id = ref.id;
    }
    if (data.status === '通過') {
      const existing = await getDocs(query(collection(db, 'vietnam_admittedList'), where('matchId', '==', data.matchId)));
      if (existing.empty) {
        await addDoc(collection(db, 'vietnam_admittedList'), { matchId: data.matchId, status: '通過二面', notes: '（系統依二面進度通過自動建立）' });
      }
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('二面進度', lang)}</h2>
          <div className="page-desc">{t('依進度狀態自動分類，追蹤已媒合學生的第二輪面試進度', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「媒合紀錄ID」欄位）；上傳後會完全取代目前所有二面進度資料，請先下載備份再匯入。', lang)}</p>}
      <input placeholder={t('搜尋學生姓名或公司/職務', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <StatusSections
          statuses={STATUSES}
          tagMap={SECOND_INTERVIEW_TAG}
          rows={filteredRows}
          sortKey="date"
          colSpan={canEditPage ? 4 : 3}
          headerCells={<><th>{t('媒合', lang)}</th><th>{t('二面日期', lang)}</th><th>{t('面試方式', lang)}</th>{canEditPage && <th></th>}</>}
          renderRow={(r) => (
            <tr key={r.id}>
              <td>{matchLabel(r.matchId)}</td>
              <td>{r.date || '—'}</td>
              <td>{r.method || '—'}</td>
              {canEditPage && (
                <td className="row-actions">
                  <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                  <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                  <button onClick={() => update(r.id, { confirmedClosed: true })}>{t('結案', lang)}</button>
                </td>
              )}
            </tr>
          )}
        />
      )}
      {editing && <SecondInterviewFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function SecondInterviewFormModal({ initial, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('編輯二面進度', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              {t('二面日期', lang)}
              <input type="date" value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>
              {t('面試方式', lang)}
              <input value={form.method || ''} onChange={(e) => setForm({ ...form, method: e.target.value })} />
            </label>
          </div>
          <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-muted)' }}>{t('進度狀態', lang)}</div>
          <SegmentedControl name="second-status" options={STATUSES} value={form.status || '待安排'} onChange={(v) => setForm({ ...form, status: v })} />
          <label>
            {t('備註', lang)}
            <textarea rows={3} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ marginBottom: 16 }} />
          </label>
          <div className="row-actions">
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
