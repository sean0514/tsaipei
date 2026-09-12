import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import Tag from '../../components/Tag';
import { STUDENT_TAG, CARE_TAG } from '../../lib/tags';

function effectiveEntryDate(s) {
  return s.secondEntryDate || s.firstEntryDate || '';
}
function effectiveExitDate(s) {
  return s.secondExitDate || s.firstExitDate || '';
}
function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Ported from matchPositionLabel/studentPositionLabel in apps-script/Index.html.
function studentPositionLabel(studentId, { matches, admittedList, positions }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  if (!m) return '—';
  const p = positions.find((pp) => pp.id === m.positionId);
  if (!p) return m.positionId ? '(職缺已刪除)' : '尚未指定職缺';
  const parts = [];
  if (p.projectCode) parts.push(p.projectCode);
  parts.push(p.company);
  if (m.venue) parts.push(m.venue);
  return parts.filter(Boolean).join(' ');
}

export default function DashboardPage() {
  useOutletContext();
  const { rows: students, loading } = useCollection('tsaipei_students');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: housingRecords } = useCollection('tsaipei_housingRecords');
  const { rows: careRecords } = useCollection('tsaipei_inTaiwanCare');
  const { rows: internshipDocs } = useCollection('tsaipei_internshipDocs');

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = addDays(today, -30);
  const monthAhead = addDays(today, 30);

  const total = students.length;
  const active = students.filter((s) => s.status === '已入台實習').length;
  const matching = students.filter((s) => ['媒合中', '待面試', '已面試'].includes(s.status)).length;
  // 依「地點群組」逐一判斷是否開放中，跟原本 apps-script 版一致。
  const openPositions = positions.filter((p) => {
    try {
      const groups = p.locationGroups ? JSON.parse(p.locationGroups) : [];
      return Array.isArray(groups) && groups.some((g) => g.status === '開放中');
    } catch { return false; }
  }).length;
  const unarrangedHousing = housingRecords.filter((h) => !h.checkIn && !h.completed);

  // 固定一個月時間窗，不是「前 N 筆」：符合區間的全部顯示，見 HANDOFF.md。
  const recentEntries = students
    .filter((s) => { const d = effectiveEntryDate(s); return d && d >= monthAgo && d <= today; })
    .slice().sort((a, b) => effectiveEntryDate(b).localeCompare(effectiveEntryDate(a)));
  const upcomingExits = students
    .filter((s) => { const d = effectiveExitDate(s); return d && d >= today && d <= monthAhead; })
    .slice().sort((a, b) => effectiveExitDate(a).localeCompare(effectiveExitDate(b)));

  const needsCare = careRecords.filter((c) => c.status === '待關心' && !c.confirmedDeparture).slice(0, 6);

  const pendingDocsCount = {};
  internshipDocs.forEach((d) => {
    if (d.status !== '已核准' && d.status !== '不適用') {
      pendingDocsCount[d.studentId] = (pendingDocsCount[d.studentId] || 0) + 1;
    }
  });
  const pendingDocsList = Object.entries(pendingDocsCount)
    .map(([sid, count]) => ({ student: students.find((s) => s.id === sid), count }))
    .filter((x) => x.student)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const ctx = { matches, admittedList, positions };

  return (
    <div className="content">
      <div className="page-header"><div><h2>儀表板</h2><div className="page-desc">國際實習生整體狀況總覽</div></div></div>
      {loading ? <p className="muted">載入中…</p> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 24 }}>
            {[
              ['學生總數', total], ['已入台實習', active], ['媒合/面試處理中', matching],
              ['開放中職缺', openPositions], ['宿舍待安排學生', unarrangedHousing.length],
            ].map(([label, num]) => (
              <div className="card" key={label}>
                <div style={{ fontFamily: 'var(--heading-font)', fontSize: 28, fontWeight: 700 }}>{num}</div>
                <div className="muted">{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>近期入境學生 <span className="muted">（近一個月內）</span></h3>
              {recentEntries.length ? recentEntries.map((s) => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{studentFullLabel(s)}</div>
                    <div className="muted" style={{ fontSize: 12 }}>入境日：{effectiveEntryDate(s)}</div>
                  </div>
                  <Tag value={s.status} map={STUDENT_TAG} />
                </div>
              )) : <p className="muted">近一個月內沒有入境的學生。</p>}
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>近期實習到期學生 <span className="muted">（一個月內到期）</span></h3>
              {upcomingExits.length ? upcomingExits.map((s) => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{studentFullLabel(s)}</div>
                    <div className="muted" style={{ fontSize: 12 }}>離境日：{effectiveExitDate(s)}</div>
                  </div>
                  <Tag value={s.status} map={STUDENT_TAG} />
                </div>
              )) : <p className="muted">一個月內沒有即將到期的學生。</p>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>待關心學生</h3>
              {needsCare.length ? needsCare.map((c) => {
                const s = students.find((x) => x.id === c.studentId);
                return (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{studentFullLabel(s)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{c.careDate ? `上次關懷：${c.careDate}` : '尚未有關懷紀錄日期'}</div>
                    </div>
                    <Tag value={c.status} map={CARE_TAG} />
                  </div>
                );
              }) : <p className="muted">目前沒有標記為「待關心」的學生。</p>}
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>待補件學生 <span className="muted">（實習文件追蹤）</span></h3>
              {pendingDocsList.length ? pendingDocsList.map((x) => (
                <div key={x.student.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{studentFullLabel(x.student)}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{studentPositionLabel(x.student.id, ctx)}</div>
                  </div>
                  <span className="tag tag-amber">尚缺 {x.count} 項</span>
                </div>
              )) : <p className="muted">目前沒有待補件的學生。</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
