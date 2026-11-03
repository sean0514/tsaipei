import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';
import { employerLabel, workerEmployerIds } from './constants';

const UNSET_AGENCY = '__unset_agency__';
const UNMATCHED_EMPLOYER = '__unmatched__';

// 名單來源：文件追蹤標記「完成」(docsCompleted) 的移工，自動出現在這裡
// 辦簽證；填好辦理/領取日期後按「完成」(visaCompleted)，會從這份名單
// 消失，接著自動出現在「出境辦理」頁面。依仲介、雇主分類顯示。
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
  const agencyKeys = [...new Set(rows.map((r) => (r.employerId ? (employerOf(r.employerId)?.agencyName || UNSET_AGENCY) : UNSET_AGENCY)))]
    .sort((a, b) => (a === UNSET_AGENCY ? 1 : b === UNSET_AGENCY ? -1 : a.localeCompare(b)));

  async function handleField(w, key, value) {
    await update(w.id, { [key]: value });
  }
  async function handleComplete(w) {
    await update(w.id, { visaCompleted: true });
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('辦理簽證', lang)}</h2>
          <div className="page-desc">{t('自動列出文件已收齊完成的移工，填寫簽證辦理日期、領取日期；完成後進入下一關「出境辦理」', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        rows.length === 0 ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>{t('目前沒有待辦理簽證的名單', lang)}</p></div>
        ) : agencyKeys.map((agencyKey) => {
          const group = rows.filter((r) => (r.employerId ? (employerOf(r.employerId)?.agencyName || UNSET_AGENCY) : UNSET_AGENCY) === agencyKey);
          return (
            <div key={agencyKey} style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 10 }}>{agencyKey === UNSET_AGENCY ? t('未填仲介名稱', lang) : agencyKey}<span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>（{group.length}）</span></h3>
              <div className="card" style={{ overflowX: 'auto' }}>
                <div className="table-wrap"><table>
                  <thead><tr><th>{t('姓名', lang)}</th><th>{t('雇主', lang)}</th><th>{t('簽證辦理日期', lang)}</th><th>{t('簽證領取日期', lang)}</th>{canEditPage && <th></th>}</tr></thead>
                  <tbody>
                    {group.map(({ worker: w, employerId }) => (
                      <tr key={`${w.id}-${employerId || UNMATCHED_EMPLOYER}`}>
                        <td style={{ fontWeight: 600 }}>{w.name}</td>
                        <td>{employerId ? employerLabel(employers, employerId, lang) : t('尚未配對', lang)}</td>
                        <td>
                          {canEditPage ? (
                            <input type="date" value={w.visaProcessDate || ''} onChange={(e) => handleField(w, 'visaProcessDate', e.target.value)} />
                          ) : (w.visaProcessDate || '—')}
                        </td>
                        <td>
                          {canEditPage ? (
                            <input type="date" value={w.visaPickupDate || ''} onChange={(e) => handleField(w, 'visaPickupDate', e.target.value)} />
                          ) : (w.visaPickupDate || '—')}
                        </td>
                        {canEditPage && <td><button className="primary" onClick={() => handleComplete(w)}>{t('完成', lang)}</button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
