import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canView } from '../../lib/permissions';
import {
  PROJECT_CLIENT_BONUS_ROLE_KEYS, computeInternalBonusForMonth, computeClientBillingForMonth, computeDormManagerBonusForMonth, studentProjectClientPair, currentMonthStr,
} from '../../lib/bonus';
import { t } from '../../lib/i18n';

const STUDENT_STATUS_ORDER = ['媒合中', '待面試', '已面試', '送審中', '補件中', '企業用印', '收到函文', '辦理簽證中', '已入台實習', '已完成', '取消'];

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

// 複製自 systems/tsaipei/ManagerReportPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。lib/bonus.js 的計算函式是跨系統共用的純
// 邏輯(只吃傳入的 ctx 資料，不含寫死的 collection 名稱)，不用額外複製。
export default function ManagerReportPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canSeeBonus = canView(system, 'bonus', role, overrides);
  const canSeeBilling = canView(system, 'clientBilling', role, overrides);
  const canSeeFinance = canSeeBonus || canSeeBilling;
  const { rows: students } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: positions } = useCollection('vietnam_positions');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: inTaiwanVisaRecords } = useCollection('vietnam_inTaiwanVisa');
  const { rows: internalFeeSetupRecords } = useCollection('vietnam_internalFeeSetup');
  const { rows: clientFeeSetupRecords } = useCollection('vietnam_clientFeeSetup');
  const { rows: housingRecords } = useCollection('vietnam_housingRecords');
  const { rows: internshipDocs } = useCollection('vietnam_internshipDocs');
  const { rows: dormitories } = useCollection('vietnam_dormitories');
  const [month, setMonth] = useState(currentMonthStr());

  const ctx = { students, matches, positions, admittedList, inTaiwanVisaRecords, internalFeeSetupRecords, clientFeeSetupRecords, dormitories, housingRecords };

  const statusCounts = {};
  students.forEach((s) => { const k = s.status || '未設定'; statusCounts[k] = (statusCounts[k] || 0) + 1; });
  const orderedStatusKeys = [
    ...STUDENT_STATUS_ORDER.filter((k) => statusCounts[k]),
    ...Object.keys(statusCounts).filter((k) => !STUDENT_STATUS_ORDER.includes(k)),
  ];
  const statusRows = orderedStatusKeys.map((label) => ({ label, count: statusCounts[label] }));
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
  if (canSeeBonus) {
    computeInternalBonusForMonth(month, ctx).forEach((r) => PROJECT_CLIENT_BONUS_ROLE_KEYS.forEach((k) => { bonusTotal += r.amounts[k] || 0; }));
    computeDormManagerBonusForMonth(month, ctx).forEach((d) => { bonusTotal += d.manager1Amount + d.manager2Amount; });
  }
  if (canSeeBilling) computeClientBillingForMonth(month, ctx).forEach((r) => { billingTotal += r.total || 0; });

  return (
    <div className="content">
      <div className="page-header"><div><h2>{t('主管報表', lang)}</h2><div className="page-desc">{t('跨模組彙整的整體營運數據總覽', lang)}</div></div></div>
      {canSeeFinance && (
        <>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ marginBottom: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            {canSeeBonus && <div className="card"><div style={{ fontSize: 24, fontWeight: 700 }}>{bonusTotal.toLocaleString()}</div><div className="muted">{t('本月內部獎金試算', lang)}</div></div>}
            {canSeeBilling && <div className="card"><div style={{ fontSize: 24, fontWeight: 700 }}>{billingTotal.toLocaleString()}</div><div className="muted">{t('本月客戶請款試算', lang)}</div></div>}
            <div className="card"><div style={{ fontSize: 24, fontWeight: 700 }}>{docsComplete}</div><div className="muted">{t('文件已齊全學生', lang)}</div></div>
            <div className="card"><div style={{ fontSize: 24, fontWeight: 700 }}>{docsPending}</div><div className="muted">{t('文件待補件學生', lang)}</div></div>
          </div>
        </>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t('學生狀態分佈', lang)}</h3>
          {statusRows.length ? statusRows.map((r) => <BarRow key={r.label} {...r} max={maxStatus} />) : <p className="muted">{t('尚無學生資料', lang)}</p>}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t('住宿狀態分佈', lang)}</h3>
          <BarRow label={t('未安排', lang)} count={unarranged} max={maxHousing} />
          <BarRow label={t('住宿中', lang)} count={active} max={maxHousing} />
          <BarRow label={t('已離宿', lang)} count={departed} max={maxHousing} />
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t('國籍分佈', lang)}</h3>
          {nationalityRows.length ? nationalityRows.map((r) => <BarRow key={r.label} {...r} max={maxNationality} />) : <p className="muted">{t('尚無學生資料', lang)}</p>}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t('學生人數前 8 大客戶', lang)}</h3>
          {topClients.length ? topClients.map((r) => <BarRow key={r.label} {...r} max={maxClient} />) : <p className="muted">{t('尚無媒合資料', lang)}</p>}
        </div>
      </div>
    </div>
  );
}
