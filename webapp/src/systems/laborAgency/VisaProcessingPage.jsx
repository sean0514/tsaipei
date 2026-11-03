import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';
import { employerLabel, workerEmployerIds } from './constants';

const UNSET_AGENCY = '__unset_agency__';
const UNMATCHED_EMPLOYER = '__unmatched__';

function today() {
  return new Date().toISOString().slice(0, 10);
}

// 簽證辦理/領取日期改成可點擊的流程步驟：還沒填就點一下，直接帶入今天
// 的日期；已經填過再點一下可以清空重填（例如填錯日期），不用另外開
// 日期輸入框一個個改，跟文件追蹤「必備文件進度」同一套互動方式。
function DateStep({ label, value, onChange, canEdit }) {
  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={() => onChange(value ? '' : today())}
      className={`tag ${value ? 'tag-green' : 'tag-grey'}`}
      style={{ cursor: canEdit ? 'pointer' : 'default', fontWeight: value ? 700 : 400 }}
    >
      {value ? '✓ ' : ''}{label}{value ? `（${value}）` : ''}
    </button>
  );
}

// 名單來源：文件追蹤標記「完成」(docsCompleted) 的移工，自動出現在這裡
// 辦簽證；填好辦理/領取日期後按「完成」(visaCompleted)，會從這份名單
// 消失，接著自動出現在「出境辦理」頁面。先依仲介分組，仲介底下再依
// 雇主分組（未配對的歸一組，排最後），跟移工管理的分組邏輯一致；同一
// 移工配對多個雇主就依雇主各自顯示一行。
export default function VisaProcessingPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'visaProcessing', role, overrides);
  const { rows: workers, loading, update } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');

  const pending = workers.filter((w) => w.docsCompleted && !w.visaCompleted);
  const employerOf = (id) => employers.find((e) => e.id === id);
  const rows = pending.flatMap((w) => {
    const ids = workerEmployerIds(w);
    return ids.length ? ids.map((employerId) => ({ worker: w, employerId })) : [{ worker: w, employerId: null }];
  });

  const sortedEmployerIds = [...new Set(rows.map((r) => r.employerId).filter(Boolean))]
    .sort((a, b) => {
      const ea = employerOf(a); const eb = employerOf(b);
      return (ea?.agencyName || '').localeCompare(eb?.agencyName || '') || employerLabel(employers, a, lang).localeCompare(employerLabel(employers, b, lang));
    });
  const employerGroupKeys = [...sortedEmployerIds, UNMATCHED_EMPLOYER];

  const agencyOrder = [];
  employerGroupKeys.forEach((employerId) => {
    const agencyKey = employerId === UNMATCHED_EMPLOYER ? UNSET_AGENCY : (employerOf(employerId)?.agencyName || UNSET_AGENCY);
    if (!agencyOrder.includes(agencyKey)) agencyOrder.push(agencyKey);
  });

  async function handleField(w, key, value) {
    await update(w.id, { [key]: value });
  }
  async function handleComplete(w) {
    await update(w.id, { visaCompleted: true });
  }

  function EmployerTable({ employerId }) {
    const group = rows.filter((r) => (r.employerId || UNMATCHED_EMPLOYER) === employerId);
    if (group.length === 0) return null;
    const sorted = [...group].sort((a, b) => (a.worker.name || '').localeCompare(b.worker.name || ''));
    return (
      <div key={employerId} style={{ marginBottom: 16 }}>
        <h4 style={{ marginBottom: 8 }}>
          {employerId === UNMATCHED_EMPLOYER ? t('尚未配對', lang) : employerLabel(employers, employerId, lang)}
          <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>（{group.length}）</span>
        </h4>
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>{t('姓名', lang)}</th><th>{t('越文姓名', lang)}</th><th>{t('性別', lang)}</th>
                <th>{t('省份', lang)}</th><th>{t('簽證進度', lang)}</th>{canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ worker: w }) => (
                <tr key={w.id}>
                  <td style={{ fontWeight: 600 }}>{w.name}</td>
                  <td>{w.vietnameseName || '—'}</td>
                  <td>{t(w.gender, lang) || '—'}</td>
                  <td>{w.province || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <DateStep label={t('簽證辦理', lang)} value={w.visaProcessDate} onChange={(v) => handleField(w, 'visaProcessDate', v)} canEdit={canEditPage} />
                      <DateStep label={t('簽證領取', lang)} value={w.visaPickupDate} onChange={(v) => handleField(w, 'visaPickupDate', v)} canEdit={canEditPage} />
                    </div>
                  </td>
                  {canEditPage && <td><button className="primary" onClick={() => handleComplete(w)}>{t('完成', lang)}</button></td>}
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('辦理簽證', lang)}</h2>
          <div className="page-desc">{t('自動列出文件已收齊完成的移工，點選簽證辦理/領取步驟即可帶入當天日期；完成後進入下一關「出境辦理」', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        rows.length === 0 ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>{t('目前沒有待辦理簽證的名單', lang)}</p></div>
        ) : agencyOrder.map((agencyKey) => {
          const employerIdsInAgency = employerGroupKeys.filter((employerId) => {
            const key = employerId === UNMATCHED_EMPLOYER ? UNSET_AGENCY : (employerOf(employerId)?.agencyName || UNSET_AGENCY);
            return key === agencyKey;
          });
          const count = rows.filter((r) => employerIdsInAgency.includes(r.employerId || UNMATCHED_EMPLOYER)).length;
          if (count === 0) return null;
          return (
            <div key={agencyKey} style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 10 }}>
                {agencyKey === UNSET_AGENCY ? t('未填仲介名稱', lang) : agencyKey}
                <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>（{count}）</span>
              </h3>
              {employerIdsInAgency.map((employerId) => <EmployerTable key={employerId} employerId={employerId} />)}
            </div>
          );
        })
      )}
    </div>
  );
}
