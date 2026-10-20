import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { exportEntityCSV } from '../../lib/csv';
import { t } from '../../lib/i18n';

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

function studentCompanyLabel(studentId, { matches, admittedList, positions }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  if (!m) return '未指定客戶';
  const p = positions.find((pp) => pp.id === m.positionId);
  if (!p) return '未指定客戶';
  return [p.projectCode, p.company, m.venue].filter(Boolean).join(' ') || '未指定客戶';
}

const BASIC_DOC_ITEMS = [
  { key: 'applicationForm', label: '申請書' },
  { key: 'employmentCert', label: '在職證明' },
  { key: 'passportOriginal', label: '護照正本' },
  { key: 'passportCopy', label: '護照影本' },
  { key: 'visaOriginal', label: '簽證正本' },
  { key: 'visaCopy', label: '簽證影本' },
  { key: 'approvalLetterOriginal', label: '核准函正本' },
];

function isBasicDocsComplete(p) {
  return BASIC_DOC_ITEMS.every((d) => p?.[d.key]);
}
function basicDocsCount(p) {
  return BASIC_DOC_ITEMS.filter((d) => p?.[d.key]).length;
}

const CSV_FIELDS = [
  { key: 'studentName', label: '學生' }, { key: 'company', label: '客戶' },
  { key: 'firstEntryDate', label: '入台日期' }, { key: 'appointmentDate', label: '預約開戶日期' }, { key: 'bankBranch', label: '銀行+分行' },
  ...BASIC_DOC_ITEMS.map((d) => ({ key: d.key, label: d.label })),
  { key: 'basicDocsReceived', label: '基資表(全部收齊)' }, { key: 'bankAccountReceived', label: '銀行帳戶' }, { key: 'confirmedDone', label: '確認完成' },
];

// 複製自 systems/tsaipei/BankAccountProgressPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function BankAccountProgressPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'bankAccountProgress', role, overrides);
  const { rows: visaRecords, loading } = useCollection('vietnam_inTaiwanVisa');
  const { rows: progressRows, add: addProgress, update: updateProgress } = useCollection('vietnam_bankAccountProgress');
  const { rows: students } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: positions } = useCollection('vietnam_positions');
  const [q, setQ] = useState('');
  const [managingStudentId, setManagingStudentId] = useState(null);

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);

  const arrived = visaRecords.filter((v) => v.firstEntryDate);
  const progressByStudent = {};
  progressRows.forEach((p) => { progressByStudent[p.studentId] = p; });

  const searchQuery = q.trim().toLowerCase();
  const visible = arrived
    .filter((v) => !progressByStudent[v.studentId]?.confirmedDone)
    .filter((v) => !searchQuery || `${studentFullLabel(studentById(v.studentId))} ${studentCompanyLabel(v.studentId, ctx)}`.toLowerCase().includes(searchQuery));

  const notOpened = visible.filter((v) => !progressByStudent[v.studentId]?.bankAccountReceived);
  const opened = visible.filter((v) => progressByStudent[v.studentId]?.bankAccountReceived);

  async function toggleDoc(studentId, field, checked) {
    const existing = progressByStudent[studentId];
    if (existing) await updateProgress(existing.id, { [field]: checked });
    else await addProgress({ studentId, bankAccountReceived: false, [field]: checked });
  }

  async function toggleBankAccount(studentId, checked) {
    const existing = progressByStudent[studentId];
    if (existing) await updateProgress(existing.id, { bankAccountReceived: checked });
    else await addProgress({ studentId, bankAccountReceived: checked });
  }

  async function updateField(studentId, field, value) {
    const existing = progressByStudent[studentId];
    if (existing) await updateProgress(existing.id, { [field]: value });
    else await addProgress({ studentId, bankAccountReceived: false, [field]: value });
  }

  async function confirmDone(studentId) {
    const existing = progressByStudent[studentId];
    if (existing) await updateProgress(existing.id, { confirmedDone: true });
    else await addProgress({ studentId, bankAccountReceived: true, confirmedDone: true });
  }

  function handleDownload() {
    const data = arrived.map((v) => {
      const p = progressByStudent[v.studentId] || {};
      const row = {
        studentName: studentFullLabel(studentById(v.studentId)),
        company: studentCompanyLabel(v.studentId, ctx),
        firstEntryDate: v.firstEntryDate,
        appointmentDate: p.appointmentDate || '',
        bankBranch: p.bankBranch || '',
        basicDocsReceived: isBasicDocsComplete(p) ? '是' : '否',
        bankAccountReceived: p.bankAccountReceived ? '是' : '否',
        confirmedDone: p.confirmedDone ? '是' : '否',
      };
      BASIC_DOC_ITEMS.forEach((d) => { row[d.key] = p[d.key] ? '是' : '否'; });
      return row;
    });
    exportEntityCSV(data, CSV_FIELDS, '開戶進度追蹤');
  }

  function ProgressTable({ items, showConfirm }) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('學生', lang)}</th><th>{t('客戶', lang)}</th><th>{t('入台日期', lang)}</th><th>{t('預約開戶日期', lang)}</th><th>{t('銀行+分行', lang)}</th><th>{t('基資表', lang)}</th><th>{t('銀行帳戶', lang)}</th>
              {canEditPage && showConfirm && <th></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((v) => {
              const p = progressByStudent[v.studentId] || {};
              const complete = isBasicDocsComplete(p);
              return (
                <tr key={v.id}>
                  <td>{studentFullLabel(studentById(v.studentId))}</td>
                  <td>{studentCompanyLabel(v.studentId, ctx)}</td>
                  <td>{v.firstEntryDate}</td>
                  <td>
                    {canEditPage ? (
                      <input type="date" value={p.appointmentDate || ''} onChange={(e) => updateField(v.studentId, 'appointmentDate', e.target.value)} />
                    ) : (p.appointmentDate || '—')}
                  </td>
                  <td>
                    {canEditPage ? (
                      <input value={p.bankBranch || ''} onChange={(e) => updateField(v.studentId, 'bankBranch', e.target.value)} style={{ width: 140 }} />
                    ) : (p.bankBranch || '—')}
                  </td>
                  <td>
                    <span className={`tag ${complete ? 'tag-green' : 'tag-amber'}`} style={{ marginRight: 8 }}>
                      {complete ? t('已收齊', lang) : `${basicDocsCount(p)}/${BASIC_DOC_ITEMS.length}`}
                    </span>
                    {canEditPage && <button onClick={() => setManagingStudentId(v.studentId)}>{t('管理', lang)}</button>}
                  </td>
                  <td>
                    {canEditPage ? (
                      <input type="checkbox" checked={!!p.bankAccountReceived} onChange={(e) => toggleBankAccount(v.studentId, e.target.checked)} />
                    ) : (p.bankAccountReceived ? t('是', lang) : t('否', lang))}
                  </td>
                  {canEditPage && showConfirm && (
                    <td><button onClick={() => confirmDone(v.studentId)}>{t('確認完成', lang)}</button></td>
                  )}
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={canEditPage && showConfirm ? 8 : 7} className="muted">{t('沒有資料', lang)}</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  const managingVisa = managingStudentId ? arrived.find((v) => v.studentId === managingStudentId) : null;

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('開戶進度追蹤', lang)}</h2>
          <div className="page-desc">
            {t('在台簽證追蹤裡填了第一次入台時間的學生會自動列入此清單；基資表包含申請書、在職證明、護照正本、護照影本、簽證正本、簽證影本、核准函正本，全部收齊後自動標示為已收齊；已開戶的學生按「確認完成」後會從清單消失（下載完整資料仍會包含）', lang)}
            {!canEditPage && `（${t('唯讀', lang)}）`}
          </div>
        </div>
        <button onClick={handleDownload}>{t('下載完整資料', lang)}</button>
      </div>
      <input placeholder={t('搜尋學生或客戶', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        visible.length === 0 ? <p className="muted">{t('目前沒有需要追蹤的學生。', lang)}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="card">
              <h4 style={{ marginTop: 0 }}>{t('未開戶', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{notOpened.length} {t('位學生', lang)}</span></h4>
              <ProgressTable items={notOpened} showConfirm={false} />
            </div>
            <div className="card">
              <h4 style={{ marginTop: 0 }}>{t('已開戶', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{opened.length} {t('位學生', lang)}</span></h4>
              <ProgressTable items={opened} showConfirm />
            </div>
          </div>
        )
      )}
      {managingVisa && (
        <BasicDocsModal
          studentLabel={studentFullLabel(studentById(managingStudentId))}
          progress={progressByStudent[managingStudentId] || {}}
          canEditPage={canEditPage}
          onToggle={(field, checked) => toggleDoc(managingStudentId, field, checked)}
          onClose={() => setManagingStudentId(null)}
          lang={lang}
        />
      )}
    </div>
  );
}

function BasicDocsModal({ studentLabel, progress, canEditPage, onToggle, onClose, lang }) {
  const complete = isBasicDocsComplete(progress);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{studentLabel} · {t('基資表', lang)} {complete && <span className="tag tag-green">{t('已收齊', lang)}</span>}</h3>
        <div className="form-grid">
          {BASIC_DOC_ITEMS.map((d) => (
            <label key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                disabled={!canEditPage}
                checked={!!progress[d.key]}
                onChange={(e) => onToggle(d.key, e.target.checked)}
              />
              {t(d.label, lang)}
            </label>
          ))}
        </div>
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button onClick={onClose}>{t('關閉', lang)}</button>
        </div>
      </div>
    </div>
  );
}
