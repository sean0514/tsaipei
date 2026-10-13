import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import Tag from '../../components/Tag';
import { STUDENT_TAG, CARE_TAG } from '../../lib/tags';
import { t } from '../../lib/i18n';

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

// 複製自 systems/tsaipei/DashboardPage.jsx，collection 字首改成 vietnam_，
// 介面文字包上 t(...)，依側邊欄語言切換顯示中文/越南文（見 lib/i18n.js）。
export default function DashboardPage() {
  const { lang } = useOutletContext();
  const { rows: students, loading } = useCollection('vietnam_students');
  const { rows: positions } = useCollection('vietnam_positions');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: applicationProgress } = useCollection('vietnam_applicationProgress');
  const { rows: housingRecords } = useCollection('vietnam_housingRecords');
  const { rows: careRecords } = useCollection('vietnam_inTaiwanCare');
  const { rows: internshipDocs } = useCollection('vietnam_internshipDocs');

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = addDays(today, -30);
  const monthAhead = addDays(today, 30);

  const total = students.length;
  const active = applicationProgress.filter((r) => r.arrivalDate && r.arrivalDate <= today).length;
  const matching = matches.filter((m) => m.status === '媒合中').length;
  const matched = matches.filter((m) => m.status === '已媒合').length;
  const openPositions = positions.filter((p) => {
    try {
      const groups = p.locationGroups ? JSON.parse(p.locationGroups) : [];
      return Array.isArray(groups) && groups.some((g) => g.status === '開放中');
    } catch { return false; }
  }).length;
  const unarrangedHousing = housingRecords.filter((h) => !h.checkIn && !h.completed);

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
      <div className="page-header"><div><h2>{t('儀表板', lang)}</h2><div className="page-desc">{t('國際實習生整體狀況總覽', lang)}</div></div></div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 24 }}>
            {[
              ['學生總數', total], ['已入台實習', active], ['媒合中', matching], ['已媒合', matched],
              ['開放中職缺', openPositions], ['宿舍待安排學生', unarrangedHousing.length],
            ].map(([label, num]) => (
              <div className="card" key={label}>
                <div style={{ fontFamily: 'var(--heading-font)', fontSize: 28, fontWeight: 700 }}>{num}</div>
                <div className="muted">{t(label, lang)}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>{t('近期入境學生', lang)} <span className="muted">（{t('近一個月內', lang)}）</span></h3>
              {recentEntries.length ? recentEntries.map((s) => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{studentFullLabel(s)}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{t('入境日', lang)}：{effectiveEntryDate(s)}</div>
                  </div>
                  <Tag value={s.status} map={STUDENT_TAG} />
                </div>
              )) : <p className="muted">{t('近一個月內沒有入境的學生。', lang)}</p>}
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>{t('近期實習到期學生', lang)} <span className="muted">（{t('一個月內到期', lang)}）</span></h3>
              {upcomingExits.length ? upcomingExits.map((s) => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{studentFullLabel(s)}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{t('離境日', lang)}：{effectiveExitDate(s)}</div>
                  </div>
                  <Tag value={s.status} map={STUDENT_TAG} />
                </div>
              )) : <p className="muted">{t('一個月內沒有即將到期的學生。', lang)}</p>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>{t('待關心學生', lang)}</h3>
              {needsCare.length ? needsCare.map((c) => {
                const s = students.find((x) => x.id === c.studentId);
                return (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{studentFullLabel(s)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{c.careDate ? `${t('上次關懷', lang)}：${c.careDate}` : t('尚未有關懷紀錄日期', lang)}</div>
                    </div>
                    <Tag value={c.status} map={CARE_TAG} />
                  </div>
                );
              }) : <p className="muted">{t('目前沒有標記為「待關心」的學生。', lang)}</p>}
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>{t('待補件學生', lang)} <span className="muted">（{t('實習文件追蹤', lang)}）</span></h3>
              {pendingDocsList.length ? pendingDocsList.map((x) => (
                <div key={x.student.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{studentFullLabel(x.student)}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{studentPositionLabel(x.student.id, ctx)}</div>
                  </div>
                  <span className="tag tag-amber">{t('尚缺', lang)} {x.count} {t('項', lang)}</span>
                </div>
              )) : <p className="muted">{t('目前沒有待補件的學生。', lang)}</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
