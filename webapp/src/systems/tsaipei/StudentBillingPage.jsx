import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { exportEntityCSV } from '../../lib/csv';

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// 跟 客戶請款計算/學生自付宿舍 同一套「當月天數」規則。
function monthRange(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start, end, daysInMonth: end.getDate() };
}

function dateOverlapDays(rangeStart, rangeEnd, entryStr, exitStr) {
  if (!entryStr) return 0;
  const entry = new Date(`${entryStr}T00:00:00`);
  if (Number.isNaN(entry.getTime())) return 0;
  const exit = exitStr ? new Date(`${exitStr}T00:00:00`) : rangeEnd;
  const s = entry < rangeStart ? rangeStart : entry;
  const e = exit > rangeEnd ? rangeEnd : exit;
  if (e < s) return 0;
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

function parseOtherFees(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// 「住宿中」的判斷跟 宿舍管理/住宿安排 同一套邏輯：已完成的不算、沒有入住
// 日的不算、退宿日已過的也不算。用這個算「這個月住過這間宿舍的人數」，水電
// 瓦斯/其他費用才能按人頭平分。
function residentOverlapDays(h, range) {
  if (h.completed || !h.checkIn) return 0;
  return dateOverlapDays(range.start, range.end, h.checkIn, h.checkOut);
}

// 學生請款計算：只列「學生自付」的住宿紀錄（跟 學生自付宿舍 同一份名單），
// 每人自付宿舍費沿用那頁的試算方式；水費/電費/瓦斯費/其他費用取自 宿舍管理
// 「填寫其他費用」當月整間宿舍的紀錄，依「這個月住過這間宿舍的人數」平分
// 到每個人身上，再跟自付宿舍費加總成這個學生這個月要付的總金額。
export default function StudentBillingPage() {
  useOutletContext();
  const { rows: housingRecords, loading: loadingHousing } = useCollection('tsaipei_housingRecords');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: dormitories } = useCollection('tsaipei_dormitories');
  const { rows: utilities } = useCollection('tsaipei_dormitoryUtilities');
  const [q, setQ] = useState('');
  const [month, setMonth] = useState(currentMonthStr());

  const range = monthRange(month);

  function dormIdByName(name) {
    return dormitories.find((d) => d.name === name)?.id || '';
  }

  function utilityFor(dormName) {
    const dormId = dormIdByName(dormName);
    if (!dormId) return null;
    return utilities.find((u) => u.dormitoryId === dormId && u.month === month) || null;
  }

  function residentCountOf(dormName) {
    return housingRecords.filter((h) => h.type === dormName && residentOverlapDays(h, range) > 0).length;
  }

  function billingFor(h) {
    const days = residentOverlapDays(h, range);
    const selfPayDormFee = h.monthlyRent ? Math.round((Number(h.monthlyRent) / range.daysInMonth) * days) : 0;
    const u = utilityFor(h.type);
    const residentCount = residentCountOf(h.type);
    const otherFeesTotal = parseOtherFees(u?.otherFees).reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
    const perHead = (amount) => (residentCount > 0 ? Math.round((Number(amount) || 0) / residentCount) : 0);
    const waterFee = perHead(u?.waterFee);
    const electricityFee = perHead(u?.electricityFee);
    const gasFee = perHead(u?.gasFee);
    const otherFees = perHead(otherFeesTotal);
    const total = selfPayDormFee + waterFee + electricityFee + gasFee + otherFees;
    return { days, selfPayDormFee, waterFee, electricityFee, gasFee, otherFees, total };
  }

  const query = q.trim().toLowerCase();
  const filtered = housingRecords.filter((h) => {
    if (h.payer !== '學生自付') return false;
    if (h.completed) return false;
    if (!query) return true;
    const text = `${studentFullLabel(students.find((s) => s.id === h.studentId))} ${h.type || ''}`.toLowerCase();
    return text.includes(query);
  });

  const groups = {};
  filtered.forEach((h) => {
    const key = h.type || '未指定宿舍';
    (groups[key] ||= []).push(h);
  });
  const groupKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  function handleDownload() {
    const rows = filtered.map((h) => {
      const b = billingFor(h);
      return {
        dorm: h.type || '',
        studentName: studentFullLabel(students.find((s) => s.id === h.studentId)),
        days: b.days,
        selfPayDormFee: b.selfPayDormFee,
        waterFee: b.waterFee,
        electricityFee: b.electricityFee,
        gasFee: b.gasFee,
        otherFees: b.otherFees,
        total: b.total,
      };
    });
    exportEntityCSV(rows, [
      { key: 'dorm', label: '宿舍名稱' }, { key: 'studentName', label: '學生' }, { key: 'days', label: '當月天數' },
      { key: 'selfPayDormFee', label: '自付宿舍費' }, { key: 'waterFee', label: '水費' }, { key: 'electricityFee', label: '電費' },
      { key: 'gasFee', label: '瓦斯費' }, { key: 'otherFees', label: '其他費用' }, { key: 'total', label: '合計' },
    ], `學生請款計算_${month}`);
  }

  const loading = loadingHousing;

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>學生請款計算</h2>
          <div className="page-desc">只列住宿費由學生自行負擔的學生；自付宿舍費依每月租金試算，水電瓦斯/其他費用取自宿舍管理當月填寫的紀錄，依該宿舍當月住過的人數平分</div>
        </div>
        <div className="row-actions">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button onClick={handleDownload}>下載此月份報表</button>
        </div>
      </div>
      <input placeholder="搜尋學生或宿舍名稱" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        groupKeys.length === 0 ? <p className="muted">{query ? '沒有符合搜尋條件的紀錄。' : '目前沒有付款方式為「學生自付」的住宿紀錄。'}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {groupKeys.map((key) => (
              <div className="card" key={key}>
                <h3 style={{ marginTop: 0 }}>{key} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[key].length} 位學生</span></h3>
                <div className="table-wrap"><table>
                  <thead><tr><th>學生</th><th>當月天數</th><th>自付宿舍費</th><th>水費</th><th>電費</th><th>瓦斯費</th><th>其他費用</th><th>合計</th></tr></thead>
                  <tbody>
                    {groups[key].map((h) => {
                      const b = billingFor(h);
                      return (
                        <tr key={h.id}>
                          <td style={{ fontWeight: 600 }}>{studentFullLabel(students.find((s) => s.id === h.studentId))}</td>
                          <td>{b.days}</td>
                          <td>{b.selfPayDormFee.toLocaleString()}</td>
                          <td>{b.waterFee.toLocaleString()}</td>
                          <td>{b.electricityFee.toLocaleString()}</td>
                          <td>{b.gasFee.toLocaleString()}</td>
                          <td>{b.otherFees.toLocaleString()}</td>
                          <td style={{ fontWeight: 600 }}>{b.total.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
