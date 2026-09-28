import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import Tag from '../../components/Tag';
import { INTERVIEW_TAG } from '../../lib/tags';

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  useOutletContext();
  const { rows: jobSeekers, loading } = useCollection('dispatch_jobSeekers');
  const { rows: interviews } = useCollection('dispatch_interviews');
  const { rows: employmentStatusRecords } = useCollection('dispatch_employmentStatus');

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = addDays(today, -30);

  const total = jobSeekers.length;
  const inInterview = interviews.filter((i) => i.status === '待安排' || i.status === '已面試').length;
  const admitted = interviews.filter((i) => i.status === '已錄取' || i.status === '已訓練').length;
  const activeCount = employmentStatusRecords.filter((r) => r.status !== '離職').length;
  const recentDeparted = employmentStatusRecords.filter((r) => r.status === '離職' && r.endDate && r.endDate >= monthAgo && r.endDate <= today).length;

  function jobSeekerName(id) {
    const s = jobSeekers.find((x) => x.id === id);
    return s?.chineseName || '(已刪除)';
  }

  const upcomingInterviews = interviews
    .filter((i) => (i.status === '待安排' || i.status === '已面試') && i.interviewDate && i.interviewDate >= today)
    .slice().sort((a, b) => a.interviewDate.localeCompare(b.interviewDate)).slice(0, 6);

  const recentJobSeekers = [...jobSeekers]
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    .slice(0, 6);

  return (
    <div className="content">
      <div className="page-header"><div><h2>儀表板</h2><div className="page-desc">派遣公司業務整體狀況總覽</div></div></div>
      {loading ? <p className="muted">載入中…</p> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 24 }}>
            {[
              ['求職者總數', total], ['面試中', inInterview], ['已錄取/已訓練', admitted],
              ['在職人數', activeCount], ['近一個月離職', recentDeparted],
            ].map(([label, num]) => (
              <div className="card" key={label}>
                <div style={{ fontFamily: 'var(--heading-font)', fontSize: 28, fontWeight: 700 }}>{num}</div>
                <div className="muted">{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>近期新增求職者</h3>
              {recentJobSeekers.length ? recentJobSeekers.map((s) => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.chineseName}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{s.desiredPosition || '—'}</div>
                  </div>
                </div>
              )) : <p className="muted">目前沒有求職者資料。</p>}
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>近期面試安排</h3>
              {upcomingInterviews.length ? upcomingInterviews.map((i) => (
                <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{jobSeekerName(i.jobSeekerId)}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{i.company || '—'} · {i.interviewDate}</div>
                  </div>
                  <Tag value={i.status} map={INTERVIEW_TAG} />
                </div>
              )) : <p className="muted">目前沒有即將到來的面試安排。</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
