import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { STAGE_KEYS, stageIndex, daysToExpiry } from './constants';

export default function DashboardPage() {
  useOutletContext();
  const { rows: workers, loading } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');

  const active = workers.filter((w) => stageIndex(w.stage) < 7).length;
  const placed = workers.filter((w) => stageIndex(w.stage) === 7).length;
  const gap = employers.reduce((n, e) => n + Math.max(0, (+e.demand || 0) - workers.filter((w) => w.employerId === e.id).length), 0);
  const expiring = workers.filter((w) => { const d = daysToExpiry(w.passportExpiry); return d !== null && d <= 180; }).length;

  return (
    <div className="content">
      <div className="page-header">
        <div><h2>儀表板</h2><div className="page-desc">越南外勞仲介引進案件整體狀況總覽</div></div>
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
          {[
            ['辦理中案件', active], ['在職追蹤中', placed], ['雇主缺工名額', gap], ['證件須處理', expiring],
          ].map(([label, num]) => (
            <div className="card" key={label}>
              <div style={{ fontFamily: 'var(--heading-font)', fontSize: 28, fontWeight: 700 }}>{num}</div>
              <div className="muted">{label}</div>
            </div>
          ))}
        </div>
      )}
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          案件進度共 {STAGE_KEYS.length} 個階段：{STAGE_KEYS.join(' → ')}。詳細名單請到「移工管理」查看看板或名冊，雇主缺工狀況在「雇主需求單」，護照效期/停滯案件在「效期提醒」。
        </p>
      </div>
    </div>
  );
}
