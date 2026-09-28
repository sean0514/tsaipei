import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canView } from '../../lib/permissions';
import { computeInternalBonusForMonth, computeClientBillingForMonth, currentMonthStr } from '../../lib/dispatchBilling';

const INTERVIEW_STATUS_ORDER = ['待安排', '已面試', '已錄取', '已訓練', '報到', '取消'];

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
  const { rows: jobSeekers } = useCollection('dispatch_jobSeekers');
  const { rows: interviews } = useCollection('dispatch_interviews');
  const { rows: employmentStatusRecords } = useCollection('dispatch_employmentStatus');
  const { rows: internalFeeSetupRecords } = useCollection('dispatch_internalFeeSetup');
  const { rows: clientFeeSetupRecords } = useCollection('dispatch_clientFeeSetup');
  const [month, setMonth] = useState(currentMonthStr());

  const statusCounts = {};
  interviews.forEach((i) => { const k = i.status || '未設定'; statusCounts[k] = (statusCounts[k] || 0) + 1; });
  const orderedStatusKeys = [
    ...INTERVIEW_STATUS_ORDER.filter((k) => statusCounts[k]),
    ...Object.keys(statusCounts).filter((k) => !INTERVIEW_STATUS_ORDER.includes(k)),
  ];
  const statusRows = orderedStatusKeys.map((label) => ({ label, count: statusCounts[label] }));
  const maxStatus = Math.max(1, ...statusRows.map((r) => r.count));

  const activeCount = employmentStatusRecords.filter((r) => r.status !== '離職').length;
  const departedCount = employmentStatusRecords.filter((r) => r.status === '離職').length;
  const maxEmployment = Math.max(1, activeCount, departedCount);

  const clientCounts = {};
  employmentStatusRecords.filter((r) => r.status !== '離職').forEach((r) => {
    if (!r.client) return;
    clientCounts[r.client] = (clientCounts[r.client] || 0) + 1;
  });
  const topClients = Object.entries(clientCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => ({ label, count }));
  const maxClient = Math.max(1, ...topClients.map((r) => r.count));

  let bonusTotal = 0, billingTotal = 0;
  if (canSeeFinance) {
    const ctx = { employmentStatusRecords, internalFeeSetupRecords, clientFeeSetupRecords };
    computeInternalBonusForMonth(month, ctx).forEach((r) => { bonusTotal += r.amount || 0; });
    computeClientBillingForMonth(month, ctx).forEach((r) => { billingTotal += r.amount || 0; });
  }

  return (
    <div className="content">
      <div className="page-header"><div><h2>主管報表</h2><div className="page-desc">跨模組彙整的整體營運數據總覽</div></div></div>
      {canSeeFinance && (
        <>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ marginBottom: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div className="card"><div style={{ fontSize: 24, fontWeight: 700 }}>{bonusTotal.toLocaleString()}</div><div className="muted">本月內部獎金試算</div></div>
            <div className="card"><div style={{ fontSize: 24, fontWeight: 700 }}>{billingTotal.toLocaleString()}</div><div className="muted">本月客戶請款試算</div></div>
            <div className="card"><div style={{ fontSize: 24, fontWeight: 700 }}>{jobSeekers.length}</div><div className="muted">求職者總數</div></div>
            <div className="card"><div style={{ fontSize: 24, fontWeight: 700 }}>{activeCount}</div><div className="muted">在職人數</div></div>
          </div>
        </>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>面試狀態分佈</h3>
          {statusRows.length ? statusRows.map((r) => <BarRow key={r.label} {...r} max={maxStatus} />) : <p className="muted">尚無面試資料</p>}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>在職/離職分佈</h3>
          <BarRow label="在職" count={activeCount} max={maxEmployment} />
          <BarRow label="離職" count={departedCount} max={maxEmployment} />
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>在職人數前 8 大客戶</h3>
          {topClients.length ? topClients.map((r) => <BarRow key={r.label} {...r} max={maxClient} />) : <p className="muted">尚無在職資料</p>}
        </div>
      </div>
    </div>
  );
}
