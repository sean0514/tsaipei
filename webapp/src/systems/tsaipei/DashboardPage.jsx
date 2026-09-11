import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';

function effectiveEntryDate(s) {
  return s.secondEntryDate || s.firstEntryDate || '';
}
function effectiveExitDate(s) {
  return s.secondExitDate || s.firstExitDate || '';
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  useOutletContext();
  const { rows: students, loading } = useCollection('tsaipei_students');

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = addDays(today, -30);
  const monthAhead = addDays(today, 30);

  // 固定一個月時間窗，不是「前 6 筆」：符合區間的全部顯示，見 HANDOFF.md 第 217 節。
  const recentEntries = students.filter((s) => {
    const d = effectiveEntryDate(s);
    return d && d >= monthAgo && d <= today;
  });
  const upcomingExits = students.filter((s) => {
    const d = effectiveExitDate(s);
    return d && d >= today && d <= monthAhead;
  });

  return (
    <div className="content">
      <div className="page-header"><h2>儀表板</h2></div>
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>近期入境學生（近 1 個月內）</h3>
            <table>
              <thead><tr><th>姓名</th><th>入境日</th></tr></thead>
              <tbody>
                {recentEntries.map((s) => <tr key={s.id}><td>{s.chineseName}</td><td>{effectiveEntryDate(s)}</td></tr>)}
                {recentEntries.length === 0 && <tr><td colSpan={2} className="muted">沒有資料</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>近期實習到期學生（未來 1 個月內）</h3>
            <table>
              <thead><tr><th>姓名</th><th>離境日</th></tr></thead>
              <tbody>
                {upcomingExits.map((s) => <tr key={s.id}><td>{s.chineseName}</td><td>{effectiveExitDate(s)}</td></tr>)}
                {upcomingExits.length === 0 && <tr><td colSpan={2} className="muted">沒有資料</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>學生總數</h3>
            <p style={{ fontSize: 32, margin: 0 }}>{students.length}</p>
          </div>
        </div>
      )}
    </div>
  );
}
