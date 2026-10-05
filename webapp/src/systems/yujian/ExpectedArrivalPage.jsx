import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canView } from '../../lib/permissions';
import { workerLabel } from './WorkersPage';

function daysBetween(dateStr, today) {
  return Math.abs((new Date(dateStr) - new Date(today)) / 86400000);
}

// 跟 ApplicationProgressPage 的 resolveWorkerId 同一套邏輯：案件自己選過
// 工人編號就直接用，沒選過（舊資料）才退回用媒合紀錄找對應工人。
function resolveWorkerId(r, matches) {
  return r.workerId || matches.find((x) => x.id === r.matchId)?.workerId;
}

// 這是原本沒有的新頁面（依使用者要求新增）：只要申辦進度追蹤裡填了入境時間、
// 或轉出/離境紀錄裡有「已離台」的日期，而且該日期落在今天前後一個月內，就
// 自動列入對應清單；超過一個月（不論過去還是未來）自動從清單消失，不需要
// 另外維護。
export default function ExpectedArrivalPage() {
  const { system, role, overrides } = useOutletContext();
  const canSee = canView(system, 'expectedArrival', role, overrides);
  const { rows: cases, loading } = useCollection('yujian_applicationProgress');
  const { rows: workers } = useCollection('yujian_workers');
  const { rows: matches } = useCollection('yujian_matches');

  const workerNameFor = (r) => workerLabel(workers.find((w) => w.id === resolveWorkerId(r, matches)));
  const today = new Date().toISOString().slice(0, 10);

  const arrivals = [];
  const departures = [];
  cases.forEach((r) => {
    if (r.confirmedClosed) return;
    if (r.entryDate && daysBetween(r.entryDate, today) <= 30) {
      arrivals.push({ r, date: r.entryDate });
    }
    (r.transferSteps || []).forEach((s) => {
      if (s.status === '已離台' && s.date && daysBetween(s.date, today) <= 30) {
        departures.push({ r, date: s.date });
      }
    });
  });
  arrivals.sort((a, b) => a.date.localeCompare(b.date));
  departures.sort((a, b) => a.date.localeCompare(b.date));

  function ListTable({ items }) {
    return (
      <div className="table-wrap">
        <table>
          <thead><tr><th>工人</th><th>雇主姓名</th><th>國籍</th><th>日期</th><th>進度狀態</th></tr></thead>
          <tbody>
            {items.map(({ r, date }, i) => (
              <tr key={`${r.id}-${i}`}>
                <td>{workerNameFor(r)}</td>
                <td>{r.employerName || '—'}</td>
                <td>{r.nationality || '—'}</td>
                <td>{date}</td>
                <td>{r.status || '—'}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="muted">目前沒有資料。</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>預計入台名單</h2>
          <div className="page-desc">申辦進度追蹤裡填有入境時間、或轉出/離境紀錄有「已離台」日期，且落在今天前後一個月內的案件，超過一個月自動從清單移除{!canSee && '（唯讀）'}</div>
        </div>
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>預計入台 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {arrivals.length} 筆</span></h3>
            <div className="card"><ListTable items={arrivals} /></div>
          </div>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>預計離台 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {departures.length} 筆</span></h3>
            <div className="card"><ListTable items={departures} /></div>
          </div>
        </div>
      )}
    </div>
  );
}
