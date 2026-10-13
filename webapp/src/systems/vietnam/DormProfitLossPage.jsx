import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { computeDormProfitLossForYear, sumDormProfitLossGroups, currentYear } from '../../lib/bonus';
import { exportEntityCSV } from '../../lib/csv';
import { t } from '../../lib/i18n';

const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

const LINE_ITEMS = [
  { key: 'housingIncome', label: '住宿費收入' },
  { key: 'dormManageFeeIncome', label: '宿管費收入' },
  { key: 'dormItemIncome', label: '宿舍設備收入(日常支出申請)' },
  { key: 'income', label: '收入合計', bold: true },
  { key: 'rentCost', label: '租金' },
  { key: 'agentFeeCost', label: '房仲費' },
  { key: 'depositLossCost', label: '押金損失(押金-退還押金)' },
  { key: 'waterCost', label: '水費' },
  { key: 'electricityCost', label: '電費' },
  { key: 'gasCost', label: '瓦斯費' },
  { key: 'otherUtilityCost', label: '其他費用' },
  { key: 'dormItemCost', label: '宿舍設備支出(日常支出申請)' },
  { key: 'cost', label: '成本合計', bold: true },
  { key: 'profit', label: '利潤', bold: true, signed: true },
  { key: 'bonus', label: '分紅(利潤×20%)', bold: true, signed: true },
];

function fmt(n) {
  return (n || 0).toLocaleString();
}

function availableYears(ctx) {
  const years = new Set([currentYear()]);
  const addYearFromDate = (dateStr) => {
    const y = parseInt((dateStr || '').slice(0, 4), 10);
    if (y) years.add(y);
  };
  (ctx.housingRecords || []).forEach((h) => { addYearFromDate(h.checkIn); addYearFromDate(h.checkOut); });
  (ctx.dormitoryUtilities || []).forEach((u) => { addYearFromDate(u.month); });
  (ctx.dailyExpenseApplications || []).forEach((app) => { addYearFromDate(app.date); });
  (ctx.dormitories || []).forEach((d) => { addYearFromDate(d.leaseStart); addYearFromDate(d.depositRefundDate); });
  return Array.from(years).sort((a, b) => b - a);
}

function PnlTable({ monthly, yearTotal, lang }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>{t('損益細項', lang)}</th>{MONTH_LABELS.map((l) => <th key={l}>{l}</th>)}<th>{t('合計', lang)}</th></tr>
        </thead>
        <tbody>
          {LINE_ITEMS.map((item) => (
            <tr key={item.key}>
              <td style={{ fontWeight: item.bold ? 600 : 400 }}>{t(item.label, lang)}</td>
              {monthly.map((m) => (
                <td key={m.month} style={{ fontWeight: item.bold ? 600 : 400, color: item.signed && m[item.key] < 0 ? 'var(--danger)' : undefined }}>
                  {fmt(m[item.key])}
                </td>
              ))}
              <td style={{ fontWeight: 600, color: item.signed && yearTotal[item.key] < 0 ? 'var(--danger)' : undefined }}>{fmt(yearTotal[item.key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 複製自 systems/tsaipei/DormProfitLossPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function DormProfitLossPage() {
  const { lang } = useOutletContext();
  const { rows: dormitories, loading: loadingDorms } = useCollection('vietnam_dormitories');
  const { rows: housingRecords, loading: loadingHousing } = useCollection('vietnam_housingRecords');
  const { rows: dormitoryUtilities, loading: loadingUtilities } = useCollection('vietnam_dormitoryUtilities');
  const { rows: dailyExpenseApplications, loading: loadingApps } = useCollection('vietnam_dailyExpenseApplications');
  const { rows: students } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: positions } = useCollection('vietnam_positions');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: clientFeeSetupRecords } = useCollection('vietnam_clientFeeSetup');
  const [year, setYear] = useState(currentYear());

  const ctx = {
    dormitories, housingRecords, dormitoryUtilities, dailyExpenseApplications,
    students, matches, positions, admittedList, clientFeeSetupRecords,
  };
  const years = availableYears(ctx);
  const managerGroups = computeDormProfitLossForYear(year, ctx);
  const { grandMonthly, grandTotal } = sumDormProfitLossGroups(managerGroups);
  const loading = loadingDorms || loadingHousing || loadingUtilities || loadingApps;

  function handleDownload() {
    const csvFields = [
      { key: 'manager1', label: '宿管1' }, { key: 'dorm', label: '宿舍' }, { key: 'item', label: '損益細項' },
      ...MONTH_LABELS.map((l, i) => ({ key: `m${i + 1}`, label: l })),
      { key: 'total', label: '合計' },
    ];
    function rowsFor(manager1, dorm, monthly, yearTotal) {
      return LINE_ITEMS.map((item) => {
        const row = { manager1, dorm, item: item.label, total: yearTotal[item.key] || 0 };
        monthly.forEach((m, i) => { row[`m${i + 1}`] = m[item.key] || 0; });
        return row;
      });
    }
    const rows = [
      ...rowsFor('全部宿舍', '全部宿舍', grandMonthly, grandTotal),
      ...managerGroups.flatMap((g) => [
        ...rowsFor(g.manager1, '(小計)', g.managerMonthly, g.managerYearTotal),
        ...g.dorms.flatMap((d) => rowsFor(g.manager1, d.dormName, d.monthly, d.yearTotal)),
      ]),
    ];
    exportEntityCSV(rows, csvFields, `宿舍損益_${year}`);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('宿舍損益', lang)}</h2>
          <div className="page-desc">{t('收入＝住宿費收入(學生自付用住宿紀錄租金；廠商代付改用客戶費用建檔的宿舍費費率，即實際收到的錢)＋宿管費收入(廠商代付住戶依客戶費用建檔的宿管費費率)＋日常支出申請(宿舍設備收入)；成本＝租金(依租約當月生效天數比例計算)/房仲費/押金損失/水費/電費/瓦斯費/其他費用＋日常支出申請(宿舍設備支出)；利潤＝收入－成本；分紅＝利潤×20%；依宿舍管理設定的宿管1分類', lang)}</div>
        </div>
        <div className="row-actions">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}{t('年', lang)}</option>)}
          </select>
          <button onClick={handleDownload}>{t('下載報表', lang)}</button>
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        managerGroups.length === 0 ? <p className="muted">{t('目前沒有資料。', lang)}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="card" style={{ overflowX: 'auto' }}>
              <h3 style={{ marginTop: 0 }}>
                {t('全部宿舍總計', lang)}
                <span className="muted" style={{ fontWeight: 400, fontSize: 13, marginLeft: 10 }}>
                  {year}{t('年合計', lang)} {t('利潤', lang)} {fmt(grandTotal.profit)}／{t('分紅', lang)} {fmt(grandTotal.bonus)}
                </span>
              </h3>
              <PnlTable monthly={grandMonthly} yearTotal={grandTotal} lang={lang} />
            </div>
            {managerGroups.map((g) => (
              <div key={g.manager1}>
                <h3 style={{ margin: '0 0 12px' }}>
                  {t('宿管1', lang)}：{g.manager1}
                  <span className="muted" style={{ fontWeight: 400, fontSize: 13, marginLeft: 10 }}>
                    {year}{t('年合計', lang)} {t('利潤', lang)} {fmt(g.managerYearTotal.profit)}／{t('分紅', lang)} {fmt(g.managerYearTotal.bonus)}
                  </span>
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {g.dorms.map((d) => (
                    <div className="card" key={d.dormId} style={{ overflowX: 'auto' }}>
                      <h4 style={{ marginTop: 0 }}>{d.dormName} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{t('年合計', lang)} {t('利潤', lang)} {fmt(d.yearTotal.profit)}／{t('分紅', lang)} {fmt(d.yearTotal.bonus)}</span></h4>
                      <PnlTable monthly={d.monthly} yearTotal={d.yearTotal} lang={lang} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
