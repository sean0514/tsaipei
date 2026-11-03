import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';
import { employerLabel, workerEmployerIds } from './constants';

const UNSET_AGENCY = '__unset_agency__';
const UNMATCHED_EMPLOYER = '__unmatched__';

// 名單來源：出境辦理標記「已完成」(departureCompleted) 的移工，航班已經
// 確認，自動帶入這裡通知接機／入境相關人員；單純顯示航班資訊，不再有
// 下一關，所以沒有「完成」按鈕。依仲介、雇主分類顯示。
export default function ArrivalNoticePage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'arrivalNotice', role, overrides);
  const { rows: workers, loading, remove } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');

  const confirmed = workers.filter((w) => w.departureCompleted);
  const employerOf = (id) => employers.find((e) => e.id === id);
  const rows = confirmed.flatMap((w) => {
    const ids = workerEmployerIds(w);
    return ids.length ? ids.map((employerId) => ({ worker: w, employerId })) : [{ worker: w, employerId: null }];
  });
  const agencyKeys = [...new Set(rows.map((r) => (r.employerId ? (employerOf(r.employerId)?.agencyName || UNSET_AGENCY) : UNSET_AGENCY)))]
    .sort((a, b) => (a === UNSET_AGENCY ? 1 : b === UNSET_AGENCY ? -1 : a.localeCompare(b)));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('入境通知', lang)}</h2>
          <div className="page-desc">{t('自動列出出境辦理已完成、航班已確認的移工，供接機與入境相關人員查看', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        rows.length === 0 ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>{t('目前沒有已確認航班的名單', lang)}</p></div>
        ) : agencyKeys.map((agencyKey) => {
          const group = rows.filter((r) => (r.employerId ? (employerOf(r.employerId)?.agencyName || UNSET_AGENCY) : UNSET_AGENCY) === agencyKey);
          return (
            <div key={agencyKey} style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 10 }}>{agencyKey === UNSET_AGENCY ? t('未填仲介名稱', lang) : agencyKey}<span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>（{group.length}）</span></h3>
              <div className="card" style={{ overflowX: 'auto' }}>
                <div className="table-wrap"><table>
                  <thead>
                    <tr>
                      <th>{t('姓名', lang)}</th><th>{t('雇主', lang)}</th><th>{t('航空公司', lang)}</th>
                      <th>{t('航班編號', lang)}</th><th>{t('出入境航廈', lang)}</th><th>{t('班機時間', lang)}</th>{canEditPage && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {group.map(({ worker: w, employerId }) => (
                      <tr key={`${w.id}-${employerId || UNMATCHED_EMPLOYER}`}>
                        <td style={{ fontWeight: 600 }}>{w.name}</td>
                        <td>{employerId ? employerLabel(employers, employerId, lang) : t('尚未配對', lang)}</td>
                        <td>{w.flightAirline || '—'}</td>
                        <td>{w.flightNumber || '—'}</td>
                        <td>{w.flightTerminal || '—'}</td>
                        <td>{w.flightTime || '—'}</td>
                        {canEditPage && <td><button className="danger" onClick={() => remove(w.id)}>{t('刪除', lang)}</button></td>}
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
