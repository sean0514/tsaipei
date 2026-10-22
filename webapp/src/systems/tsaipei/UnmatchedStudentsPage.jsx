import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { exportEntityCSV } from '../../lib/csv';

function studentFullLabel(s) {
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

function studentDepartments(s) {
  return [s.department1, s.department2].filter(Boolean).join(' / ');
}

// 舊資料（Excel 遷移進來的、CSV 匯入覆蓋的）沒有 createdAt，顯示「—」，
// 不是程式漏存。
function formatCreatedAt(s) {
  const d = s.createdAt?.toDate?.();
  if (!d) return '—';
  return d.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

// 期望產業別存成 JSON 字串陣列(跟 StudentsPage.jsx 同一套存法)，舊資料如果
// 不是合法 JSON 就當作單一文字欄位處理，不會整欄消失。
function parseList(json) {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return arr;
  } catch { /* 不是 JSON，當作舊版單一文字欄位處理 */ }
  return [json];
}

// 學生尚未安排：純彙整頁面，不用手動維護——只列出在「媒合紀錄」裡有一筆
// 狀態=媒合中的學生(學生建檔存檔時系統會自動建立這筆佔位紀錄)，且這個學生
// 名下「所有」媒合紀錄都還沒填實際職缺(positionId)；學生如果申請過不只一個
// 職缺，其中一筆已經填了職缺(代表已經進到二面/錄取等後續階段)，即使另一筆
// 還掛著媒合中的佔位紀錄，也不算尚未安排，否則同一個學生會同時出現在這裡
// 又出現在二面進度。業務在媒合紀錄頁面把狀態改成已媒合、或改成取消，這個
// 學生就會自動從這個清單消失，不用在這裡手動維護。已結案的學生不計入
// （跟其他分頁同一套 confirmedClosed 慣例）。
export default function UnmatchedStudentsPage() {
  useOutletContext();
  const { rows: students, loading } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const [q, setQ] = useState('');

  // 這個學生目前在「媒合紀錄」裡狀態=媒合中的那一筆(通常是系統自動建立的
  // 佔位紀錄)，把實習場域/媒合日期/來台方案/備註這些媒合中的資訊一起帶出來
  // 顯示，而不是只看學生資料本身——業務在媒合紀錄頁面填的進度，這裡要同步
  // 看得到，不用兩邊分別維護。
  function matchingRecordOf(studentId) {
    return matches.find((m) => m.studentId === studentId && (m.status || '媒合中') === '媒合中') || null;
  }

  function hasAdvancedMatch(studentId) {
    return matches.some((m) => m.studentId === studentId && m.positionId);
  }

  const unmatched = students.filter((s) => !s.confirmedClosed && matchingRecordOf(s.id) && !hasAdvancedMatch(s.id));

  const searchQuery = q.trim().toLowerCase();
  const filtered = unmatched
    .filter((s) => !searchQuery || `${studentFullLabel(s)} ${s.school || ''} ${studentDepartments(s)} ${s.nationality || ''} ${s.sourceSupplier || ''}`.toLowerCase().includes(searchQuery))
    .sort((a, b) => studentFullLabel(a).localeCompare(studentFullLabel(b)));

  // 用國籍分類顯示，方便業務一眼看出哪個國籍還有多少學生沒安排。
  const groups = {};
  filtered.forEach((s) => {
    const key = s.nationality || '未填國籍';
    (groups[key] ||= []).push(s);
  });
  const groupKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  function handleDownload() {
    const rows = filtered.map((s) => {
      const m = matchingRecordOf(s.id);
      return {
        name: studentFullLabel(s), gender: s.gender || '', nationality: s.nationality || '', sourceSupplier: s.sourceSupplier || '',
        school: s.school || '', department: studentDepartments(s), desiredIndustries: parseList(s.desiredIndustries).join('、'),
        status: s.status || '', startDate: s.startDate || '', phone: s.phone || '',
        venue: m?.venue || '', matchDate: m?.matchDate || '', program: m?.program || '', matchNotes: m?.notes || '', createdAt: formatCreatedAt(s),
      };
    });
    exportEntityCSV(rows, [
      { key: 'name', label: '學生姓名' }, { key: 'gender', label: '性別' }, { key: 'nationality', label: '國籍' }, { key: 'sourceSupplier', label: '學生來源(國外供應商)' },
      { key: 'school', label: '就讀學校' }, { key: 'department', label: '科系' }, { key: 'desiredIndustries', label: '期望產業別' },
      { key: 'status', label: '狀態' }, { key: 'startDate', label: '實習開始日' }, { key: 'phone', label: '電話' },
      { key: 'venue', label: '實習場域(媒合中)' }, { key: 'matchDate', label: '媒合日期' }, { key: 'program', label: '來台方案' }, { key: 'matchNotes', label: '媒合備註' },
      { key: 'createdAt', label: '建立日期' },
    ], '學生尚未安排');
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>學生尚未安排</h2>
          <div className="page-desc">自動列出目前在「媒合紀錄」裡狀態是「媒合中」、且名下所有媒合紀錄都還沒填實際職缺的學生，依國籍分類顯示；實習場域/媒合日期/來台方案/媒合備註直接連動該學生「媒合中」那筆紀錄，業務在媒合紀錄頁面填的進度這裡會同步看到，不用兩邊分別維護；一旦媒合中狀態改掉或填上職缺，就會自動從這裡消失</div>
        </div>
        <div className="row-actions">
          <button onClick={handleDownload}>下載名單</button>
        </div>
      </div>
      <input placeholder="搜尋學生、學校、科系、國籍或國外供應商" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        groupKeys.length === 0 ? (
          <p className="muted">{searchQuery ? '沒有符合搜尋條件的學生。' : '目前所有學生都已經安排媒合了。'}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <p className="muted" style={{ margin: 0 }}>共 {filtered.length} 位學生尚未安排，依國籍分類如下</p>
            {groupKeys.map((key) => (
              <div className="card" key={key}>
                <h3 style={{ marginTop: 0 }}>{key} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{groups[key].length} 位學生</span></h3>
                <div className="table-wrap"><table>
                  <thead><tr><th>學生姓名</th><th>性別</th><th>國外供應商</th><th>就讀學校</th><th>科系</th><th>期望產業別</th><th>狀態</th><th>實習開始日</th><th>電話</th><th>實習場域(媒合中)</th><th>媒合日期</th><th>來台方案</th><th>媒合備註</th><th>建立日期</th></tr></thead>
                  <tbody>
                    {groups[key].map((s) => {
                      const m = matchingRecordOf(s.id);
                      return (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 600 }}>{studentFullLabel(s)}</td>
                          <td>{s.gender || '—'}</td>
                          <td>{s.sourceSupplier || '—'}</td>
                          <td>{s.school || '—'}</td>
                          <td>{studentDepartments(s) || '—'}</td>
                          <td>{parseList(s.desiredIndustries).join('、') || '—'}</td>
                          <td>{s.status || '—'}</td>
                          <td>{s.startDate || '—'}</td>
                          <td>{s.phone || '—'}</td>
                          <td>{m?.venue || '—'}</td>
                          <td>{m?.matchDate || '—'}</td>
                          <td>{m?.program || '—'}</td>
                          <td>{m?.notes || '—'}</td>
                          <td>{formatCreatedAt(s)}</td>
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
