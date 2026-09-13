import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canView } from '../../lib/permissions';
import { exportEntityCSV } from '../../lib/csv';

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// Ported from studentCompanyName/matchPositionLabel in apps-script/Index.html.
function studentCompanyLabel(studentId, { matches, admittedList, positions }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  if (!m) return '未指定客戶';
  const p = positions.find((pp) => pp.id === m.positionId);
  if (!p) return '未指定客戶';
  return [p.projectCode, p.company, m.venue].filter(Boolean).join(' ') || '未指定客戶';
}

function daysBetween(dateStr, today) {
  return Math.abs((new Date(dateStr) - new Date(today)) / 86400000);
}

// 這是原本 Apps Script 版沒有的新頁面（依使用者要求新增）：只要在台簽證追蹤
// 裡填了入境或離境時間（第一次或第二次皆可），而且該時間落在今天前後一個月
// 內，就自動列入對應清單；超過一個月（不論是過去還是未來）就自動從清單消失，
// 不需要另外維護。
export default function ExpectedArrivalPage() {
  const { system, role, overrides } = useOutletContext();
  const canSee = canView(system, 'inTaiwanTracking', role, overrides);
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { rows: visaRecords, loading } = useCollection('tsaipei_inTaiwanVisa');
  const [reportMonth, setReportMonth] = useState(currentMonthStr());

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);
  const today = new Date().toISOString().slice(0, 10);

  const arrivals = [];
  const departures = [];
  visaRecords.forEach((v) => {
    if (v.firstEntryDate && daysBetween(v.firstEntryDate, today) <= 30) arrivals.push({ v, date: v.firstEntryDate, label: '第一次入境' });
    if (v.secondEntryDate && daysBetween(v.secondEntryDate, today) <= 30) arrivals.push({ v, date: v.secondEntryDate, label: '第二次入境' });
    if (v.firstExitDate && daysBetween(v.firstExitDate, today) <= 30) departures.push({ v, date: v.firstExitDate, label: '第一次離境' });
    if (v.secondExitDate && daysBetween(v.secondExitDate, today) <= 30) departures.push({ v, date: v.secondExitDate, label: '第二次離境' });
  });
  arrivals.sort((a, b) => a.date.localeCompare(b.date));
  departures.sort((a, b) => a.date.localeCompare(b.date));

  function handleDownload() {
    const monthArrivals = [];
    const monthDepartures = [];
    visaRecords.forEach((v) => {
      if (v.firstEntryDate?.startsWith(reportMonth)) monthArrivals.push({ v, date: v.firstEntryDate, label: '第一次入境' });
      if (v.secondEntryDate?.startsWith(reportMonth)) monthArrivals.push({ v, date: v.secondEntryDate, label: '第二次入境' });
      if (v.firstExitDate?.startsWith(reportMonth)) monthDepartures.push({ v, date: v.firstExitDate, label: '第一次離境' });
      if (v.secondExitDate?.startsWith(reportMonth)) monthDepartures.push({ v, date: v.secondExitDate, label: '第二次離境' });
    });
    const combined = [...monthArrivals.map((x) => ({ ...x, type: '入台' })), ...monthDepartures.map((x) => ({ ...x, type: '離台' }))]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(({ v, date, label, type }) => ({
        studentName: studentFullLabel(studentById(v.studentId)),
        company: studentCompanyLabel(v.studentId, ctx),
        type,
        date,
        item: label,
      }));
    exportEntityCSV(
      combined,
      [
        { key: 'studentName', label: '學生' },
        { key: 'company', label: '客戶' },
        { key: 'type', label: '入台/離台' },
        { key: 'date', label: '日期' },
        { key: 'item', label: '項目' },
      ],
      `預計入台離台_${reportMonth}`
    );
  }

  function ListTable({ items }) {
    return (
      <div className="table-wrap">
        <table>
          <thead><tr><th>學生</th><th>客戶</th><th>日期</th><th>項目</th></tr></thead>
          <tbody>
            {items.map(({ v, date, label }, i) => (
              <tr key={`${v.id}-${label}-${i}`}>
                <td>{studentFullLabel(studentById(v.studentId))}</td>
                <td>{studentCompanyLabel(v.studentId, ctx)}</td>
                <td>{date}</td>
                <td>{label}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={4} className="muted">目前沒有資料。</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>預計入台/離台</h2>
          <div className="page-desc">在台簽證追蹤裡填有入境或離境時間（第一次／第二次皆可）且落在今天前後一個月內的學生，超過一個月自動從清單移除{!canSee && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
          <button onClick={handleDownload}>下載此月份報表</button>
        </div>
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>入台 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {arrivals.length} 筆</span></h3>
            <div className="card"><ListTable items={arrivals} /></div>
          </div>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>離台 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {departures.length} 筆</span></h3>
            <div className="card"><ListTable items={departures} /></div>
          </div>
        </div>
      )}
    </div>
  );
}
