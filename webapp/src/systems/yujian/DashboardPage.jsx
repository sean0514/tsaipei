import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';

export default function DashboardPage() {
  useOutletContext();
  const { rows: workers, loading } = useCollection('yujian_workers');
  const { rows: employers } = useCollection('yujian_employers');
  const { rows: matches } = useCollection('yujian_matches');

  const total = workers.length;
  const pendingWorkers = workers.filter((w) => w.status === '待媒合').length;
  const employerTotal = employers.length;
  const matchedEmployers = employers.filter((e) => e.status === '已媒合').length;
  const inService = workers.filter((w) => w.status === '在職中').length;

  return (
    <div className="content">
      <div className="page-header"><div><h2>儀表板</h2><div className="page-desc">外勞仲介整體狀況總覽</div></div></div>
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 24 }}>
          {[
            ['人員總數', total], ['待媒合人數', pendingWorkers], ['在職中人數', inService],
            ['雇主家庭總數', employerTotal], ['已媒合家庭數', matchedEmployers], ['媒合紀錄總數', matches.length],
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
          目前先建置儀表板、看護/家事人員資料、雇主家庭/需求單、媒合紀錄這幾個核心模組；其他功能（例如文件追蹤、住宿安排、會計相關）會依需求陸續加上去。
        </p>
      </div>
    </div>
  );
}
