import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { stageIndex, daysToExpiry, passportStatus, employerLabel } from './constants';

const DAY = 86400000;

export default function ExpiryAlertsPage() {
  useOutletContext();
  const { rows: workers, loading } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');

  const now = Date.now();
  const alerts = workers
    .filter((w) => { const d = daysToExpiry(w.passportExpiry); return d !== null && d <= 180; })
    .sort((a, b) => daysToExpiry(a.passportExpiry) - daysToExpiry(b.passportExpiry));
  const stuck = workers
    .filter((w) => stageIndex(w.stage) < 7 && w.updatedAt && (now - w.updatedAt) > 30 * DAY)
    .sort((a, b) => a.updatedAt - b.updatedAt);

  function Row({ w, right }) {
    return (
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>{w.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>{w.stage} · {employerLabel(employers, w.employerId)}</div>
        </div>
        <div>{right}</div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="page-header">
        <div><h2>效期提醒</h2><div className="page-desc">護照效期不足 180 天、或同一階段停留超過 30 天的案件</div></div>
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 6px' }}>護照效期 180 天內 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {alerts.length} 位</span></h3>
            <p className="muted" style={{ marginTop: 0 }}>辦理簽證時，護照通常須有 6 個月以上效期，尚未入境者剩餘不足 180 天會標示為紅色。</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.length === 0 ? <p className="muted">目前沒有即將到期的護照</p> : alerts.map((w) => {
                const ps = passportStatus(w);
                return <Row key={w.id} w={w} right={<span className={`tag ${ps.cls}`}>{ps.label}</span>} />;
              })}
            </div>
          </div>
          <div>
            <h3 style={{ margin: '0 0 6px' }}>同一階段停留超過 30 天 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {stuck.length} 位</span></h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stuck.length === 0 ? <p className="muted">沒有卡關的案件</p> : stuck.map((w) => (
                <Row key={w.id} w={w} right={<span className="tag tag-amber">已停留 {Math.floor((now - w.updatedAt) / DAY)} 天</span>} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
