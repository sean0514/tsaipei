import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canView } from '../../lib/permissions';
import {
  BONUS_ROLE_KEYS, computeInternalBonusForMonth, computeClientBillingForMonth, studentProjectClientPair, currentMonthStr,
} from '../../lib/bonus';

function BarRow({ label, count, max }) {
  const pct = max ? Math.round((count / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span>{label}</span><span style={{ fontWeight: 600 }}>{count}</span>
      </div>
      <div style={{ background: 'var(--border)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
        <div style={{ background: 'var(--accent)', width: `${pct}%`, height: '100%' }} />
      </div>
    </div>
  );
}

export default function ManagerReportPage() {
  const { system, role, overrides } = useOutletContext();
  const canSeeFinance = canView(system, 'bonus', role, overrides);
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: inTaiwanVisaRecords } = useCollection('tsaipei_inTaiwanVisa');
  const { rows: internalFeeSetupRecords } = useCollection('tsaipei_internalFeeSetup');
  const { rows: clientFeeSetupRecords } = useCollection('tsaipei_clientFeeSetup');
  const { rows: housingRecords } = useCollection('tsaipei_housingRecords');
  const { rows: internshipDocs } = useCollection('tsaipei_internshipDocs');
  const [month, setMonth] = useState(currentMonthStr());

  const ctx = { students, matches, positions, admittedList, inTaiwanVisaRecords, internalFeeSetupRecords, clientFeeSetupRecords };

  const statusCounts = {};
  students.forEach((s) => { const k = s.status || '未設定'; statusCounts[k] = (statusCounts[k] || 0) + 1; });
  const statusRows = Object.entries(statusCounts).map(([label, count]) => ({ label, count }));
  const maxStatus = Math.max(1, ...statusRows.map((r) => r.count));

  const nationalityCounts = {};
  students.forEach((s) => { const k = s.nationality || '未設定'; nationalityCounts[k] = (nationalityCounts[k] || 0) + 1; });
  const nationalityRows = Object.entries(nationalityCounts).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
  const maxNationality = Math.max(1, ...nationalityRows.map((r) => r.count));

  const clientCounts = {};
  students.forEach((s) => {
    const pair = studentProjectClientPair(s.id, ctx);
    if (!pair?.client) return;
    clientCounts[pair.client] = (clientCounts[pair.client] || 0) + 1;
  });
  const topClients = Object.entries(clientCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => ({ label, count }));
  const maxClient = Math.max(1, ...topClients.map((r) => r.count));

  const today = new Date().toISOString().slice(0, 10);
  const unarranged = housingRecords.filter((h) => !h.checkIn && !h.completed).length;
  const active = housingRecords.filter((h) => h.checkIn && (!h.checkOut || h.checkOut >= today) && !h.completed).length;
  const departed = housingRecords.filter((h) => h.checkOut && h.checkOut < today && !h.completed).length;
  const maxHousing = Math.max(1, unarranged, active, departed);

  const docStudentIds = [...new Set(internshipDocs.map((d) => d.studentId))];
  let docsComplete = 0, docsPending = 0;
  docStudentIds.forEach((sid) => {
    const items = internshipDocs.filter((d) => d.studentId === sid);
    const done = items.every((d) => d.status === '已核准' || d.status === '不適用');
    if (done) docsComplete++; else docsPending++;
  });

  let bonusTotal = 0, billingTotal = 0;
  if (canSeeFinance) {
    computeInternalBonusForMonth(month, ctx).forEach((r) => BONUS_ROLE_KEYS.forEach((k) => { bonusTotal += r.amounts[k] || 0; }));
    computeClientBillingForMonth(month, ctx).forEach((r) => { billingTotal += r.total || 0; });
  }

  return (
    <div className="content">
      <div className="page-header"><h2>主管報表</h2></div>
      {canSeeFinance && (
        <>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ marginBottom: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div className="card"><div style={{ fontSize: 24, fontWeight: 700 }}>{bonusTotal.toLocaleString()}</div><div className="muted">本月內部獎金試算</div></div>
            <div className="card"><div style={{ fontSize: 24, fontWeight: 700 }}>{billingTotal.toLocaleString()}</div><div className="muted">本月客戶請款試算</div></div>
            <div className="card"><div style={{ fontSize: 24, fontWeight: 700 }}>{docsComplete}</div><div className="muted">文件已齊全學生</div></div>
            <div className="card"><div style={{ fontSize: 24, fontWeight: 700 }}>{docsPending}</div><div className="muted">文件待補件學生</div></div>
          </div>
        </>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>學生狀態分佈</h3>
          {statusRows.length ? statusRows.map((r) => <BarRow key={r.label} {...r} max={maxStatus} />) : <p className="muted">尚無學生資料</p>}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>住宿狀態分佈</h3>
          <BarRow label="未安排" count={unarranged} max={maxHousing} />
          <BarRow label="住宿中" count={active} max={maxHousing} />
          <BarRow label="已離宿" count={departed} max={maxHousing} />
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>國籍分佈</h3>
          {nationalityRows.length ? nationalityRows.map((r) => <BarRow key={r.label} {...r} max={maxNationality} />) : <p className="muted">尚無學生資料</p>}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>學生人數前 8 大客戶</h3>
          {topClients.length ? topClients.map((r) => <BarRow key={r.label} {...r} max={maxClient} />) : <p className="muted">尚無媒合資料</p>}
        </div>
      </div>
    </div>
  );
}
