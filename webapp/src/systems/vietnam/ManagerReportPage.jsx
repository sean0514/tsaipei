import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canView } from '../../lib/permissions';
import { studentProjectClientPair, currentMonthStr } from '../../lib/bonus';
import {
  computeVietnamInternalBonusByPerson, computeVietnamSchoolRepBonusForMonth, computeDormManagerBonusForMonth,
} from '../../lib/vietnamBonus';
import { vietnamInTaiwanVisaShim } from '../../lib/vietnamTsaipeiStudentSync';
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
  const canSeeFinance = canSeeBonus;
  const { rows: students } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: positions } = useCollection('vietnam_positions');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  // 實際入境/離境日期記在境外生系統「在台簽證追蹤」，不是越南系統自己的
  // vietnam_inTaiwanVisa（整個系統沒有任何地方會真的寫入這個 collection，
  // 一直是空的）——見 lib/vietnamTsaipeiStudentSync.js 的 vietnamInTaiwanVisaShim。
  const { rows: tsaipeiInTaiwanVisaRaw } = useCollection('tsaipei_inTaiwanVisa');
  const { rows: schools } = useCollection('vietnam_schoolSetup');
  const { rows: housingRecords } = useCollection('vietnam_housingRecords');
  const { rows: internshipDocs } = useCollection('vietnam_internshipDocs');
  const { rows: dormitories } = useCollection('vietnam_dormitories');
  const { rows: bonusRateSetup } = useCollection('vietnam_internalBonusRateSetup');
  const { rows: departureTransport } = useCollection('vietnam_departureTransport');
  const [month, setMonth] = useState(currentMonthStr());

  // 宿管人員1/2 的費率來源（內部費用建檔）已移除，固定傳空陣列讓費率查找
  // 安全地找不到、金額算成 0，不用動共用計算邏輯本身。
  const inTaiwanVisaRecords = vietnamInTaiwanVisaShim(students, tsaipeiInTaiwanVisaRaw);
  const ctx = { students, matches, positions, admittedList, inTaiwanVisaRecords, bonusRateSetup, departureTransport, internalFeeSetupRecords: [], schools, dormitories, housingRecords };

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

  // computeVietnamInternalBonusByPerson 現在依送機月份分組回傳
  // [{month, byPerson}]，每個人底下的金額又依幣別分開存
  // （totalsByCurrency），這裡只是給主管看一個粗略總額的數字卡片，不分
  // 幣別直接全部加總（不同幣別混在一起加總本來就不精確，但這張卡片
  // 本來就只是概覽用途，不是真正的財務金額）。
  let bonusTotal = 0;
  if (canSeeBonus) {
    computeVietnamInternalBonusByPerson(ctx).forEach((g) => {
      g.byPerson.forEach((p) => {
        Object.values(p.totalsByCurrency).forEach((amt) => { bonusTotal += amt; });
      });
    });
    computeVietnamSchoolRepBonusForMonth(month, ctx).forEach((r) => { bonusTotal += r.amount || 0; });
    computeDormManagerBonusForMonth(month, ctx).forEach((d) => { bonusTotal += d.manager1Amount + d.manager2Amount; });
  }

  return (
    <div className="content">
      <div className="page-header"><div><h2>{t('主管報表', lang)}</h2><div className="page-desc">{t('跨模組彙整的整體營運數據總覽', lang)}</div></div></div>
      {canSeeFinance && (
        <>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ marginBottom: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            {canSeeBonus && <div className="card"><div style={{ fontSize: 24, fontWeight: 700 }}>{bonusTotal.toLocaleString()}</div><div className="muted">{t('內部獎金試算', lang)}</div></div>}
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
