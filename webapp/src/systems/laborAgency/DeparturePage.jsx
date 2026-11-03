import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';
import { employerLabel, workerEmployerIds } from './constants';

const UNSET_AGENCY = '__unset_agency__';
const UNMATCHED_EMPLOYER = '__unmatched__';

// 名單來源：辦理簽證標記「完成」(visaCompleted) 的移工，自動出現在這裡
// 安排出境行程；填好航班資訊後按「已完成」(departureCompleted)，會從
// 這份名單消失，接著自動出現在「入境通知」頁面。依仲介、雇主分類顯示。
export default function DeparturePage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'departure', role, overrides);
  const { rows: workers, loading, update } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');
  const [editing, setEditing] = useState(null);

  const pending = workers.filter((w) => w.visaCompleted && !w.departureCompleted && !w.departureListRemoved);
  const employerOf = (id) => employers.find((e) => e.id === id);
  const rows = pending.flatMap((w) => {
    const ids = workerEmployerIds(w);
    return ids.length ? ids.map((employerId) => ({ worker: w, employerId })) : [{ worker: w, employerId: null }];
  });
  const agencyKeys = [...new Set(rows.map((r) => (r.employerId ? (employerOf(r.employerId)?.agencyName || UNSET_AGENCY) : UNSET_AGENCY)))]
    .sort((a, b) => (a === UNSET_AGENCY ? 1 : b === UNSET_AGENCY ? -1 : a.localeCompare(b)));

  async function handleSave(worker, data) {
    await update(worker.id, data);
    setEditing(null);
  }
  async function handleComplete(w) {
    await update(w.id, { departureCompleted: true });
  }
  // 刪除：只從「出境辦理」這份名單移除，不影響移工本身的資料，也不影響
  // 其他頁面——用 departureListRemoved 這個頁面專屬的隱藏旗標。
  async function handleRemove(w) {
    await update(w.id, { departureListRemoved: true });
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('出境辦理', lang)}</h2>
          <div className="page-desc">{t('自動列出簽證已完成的移工，安排出境航班與交通；完成後進入下一關「入境通知」', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        rows.length === 0 ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>{t('目前沒有待安排出境的名單', lang)}</p></div>
        ) : agencyKeys.map((agencyKey) => {
          const group = rows.filter((r) => (r.employerId ? (employerOf(r.employerId)?.agencyName || UNSET_AGENCY) : UNSET_AGENCY) === agencyKey);
          return (
            <div key={agencyKey} style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 10 }}>{agencyKey === UNSET_AGENCY ? t('未填仲介名稱', lang) : agencyKey}<span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>（{group.length}）</span></h3>
              <div className="card" style={{ overflowX: 'auto' }}>
                <div className="table-wrap"><table>
                  <thead>
                    <tr>
                      <th>{t('姓名', lang)}</th><th>{t('雇主', lang)}</th><th>{t('航空公司', lang)}</th><th>{t('航班編號', lang)}</th>
                      <th>{t('出入境航廈', lang)}</th><th>{t('班機時間', lang)}</th><th>{t('車資費用', lang)}</th>
                      <th>{t('請款對象', lang)}</th><th>{t('是否列入客戶請款', lang)}</th>{canEditPage && <th></th>}
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
                        <td>{w.transportFee ? (+w.transportFee).toLocaleString() : '—'}</td>
                        <td>{w.billingParty || '—'}</td>
                        <td>{w.includeInBilling ? t('是', lang) : t('否', lang)}</td>
                        {canEditPage && (
                          <td className="row-actions">
                            <button onClick={() => setEditing(w)}>{t('編輯', lang)}</button>
                            <button className="primary" onClick={() => handleComplete(w)}>{t('已完成', lang)}</button>
                            <button className="danger" onClick={() => handleRemove(w)}>{t('刪除', lang)}</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            </div>
          );
        })
      )}
      {editing && <DepartureFormModal worker={editing} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function DepartureFormModal({ worker, onCancel, onSave, lang }) {
  const [form, setForm] = useState({
    flightAirline: worker.flightAirline || '',
    flightNumber: worker.flightNumber || '',
    flightTerminal: worker.flightTerminal || '',
    flightTime: worker.flightTime || '',
    transportFee: worker.transportFee || '',
    billingParty: worker.billingParty || '',
    includeInBilling: !!worker.includeInBilling,
  });

  function handleSubmit(e) {
    e.preventDefault();
    onSave(worker, { ...form, transportFee: Number(form.transportFee) || 0 });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{worker.name} － {t('出境安排', lang)}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>{t('航空公司', lang)}<input value={form.flightAirline} onChange={(e) => setForm({ ...form, flightAirline: e.target.value })} /></label>
            <label>{t('航班編號', lang)}<input value={form.flightNumber} onChange={(e) => setForm({ ...form, flightNumber: e.target.value })} /></label>
            <label>{t('出入境航廈', lang)}<input value={form.flightTerminal} onChange={(e) => setForm({ ...form, flightTerminal: e.target.value })} /></label>
            <label>{t('班機時間', lang)}<input type="datetime-local" value={form.flightTime} onChange={(e) => setForm({ ...form, flightTime: e.target.value })} /></label>
            <label>{t('車資費用', lang)}<input type="number" value={form.transportFee} onChange={(e) => setForm({ ...form, transportFee: e.target.value })} /></label>
            <label>{t('請款對象', lang)}<input value={form.billingParty} onChange={(e) => setForm({ ...form, billingParty: e.target.value })} /></label>
            <label>
              {t('是否列入客戶請款', lang)}
              <input type="checkbox" checked={form.includeInBilling} onChange={(e) => setForm({ ...form, includeInBilling: e.target.checked })} style={{ width: 'auto' }} />
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
