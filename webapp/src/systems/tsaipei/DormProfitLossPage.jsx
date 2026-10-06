import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { computeDormProfitLossForYear, sumDormProfitLossGroups, currentYear } from '../../lib/bonus';
import { exportEntityCSV } from '../../lib/csv';

const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

const LINE_ITEMS = [
  { key: 'housingIncome', label: '住宿費收入' },
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

function PnlTable({ monthly, yearTotal }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>損益細項</th>{MONTH_LABELS.map((l) => <th key={l}>{l}</th>)}<th>合計</th></tr>
        </thead>
        <tbody>
          {LINE_ITEMS.map((item) => (
            <tr key={item.key}>
              <td style={{ fontWeight: item.bold ? 600 : 400 }}>{item.label}</td>
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

// 宿舍損益：收入=住宿費收入(不分付款方式)+日常支出申請(宿舍設備收入)；
// 成本=租金/房仲費/水費/電費/瓦斯費/其他費用+日常支出申請(宿舍設備支出)；
// 利潤=收入-成本；分紅=利潤×20%；最後依宿舍管理設定的宿管1分類顯示 1-12 月。
export default function DormProfitLossPage() {
  useOutletContext();
  const { rows: dormitories, loading: loadingDorms } = useCollection('tsaipei_dormitories');
  const { rows: housingRecords, loading: loadingHousing } = useCollection('tsaipei_housingRecords');
  const { rows: dormitoryUtilities, loading: loadingUtilities } = useCollection('tsaipei_dormitoryUtilities');
  const { rows: dailyExpenseApplications, loading: loadingApps } = useCollection('tsaipei_dailyExpenseApplications');
  const [year, setYear] = useState(currentYear());

  const ctx = { dormitories, housingRecords, dormitoryUtilities, dailyExpenseApplications };
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
          <h2>宿舍損益</h2>
          <div className="page-desc">收入＝住宿費收入(不分付款方式)＋日常支出申請(宿舍設備收入)；成本＝租金/房仲費/押金損失/水費/電費/瓦斯費/其他費用＋日常支出申請(宿舍設備支出)；利潤＝收入－成本；分紅＝利潤×20%；依宿舍管理設定的宿管1分類</div>
        </div>
        <div className="row-actions">
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || currentYear())} style={{ width: 100 }} />
          <button onClick={handleDownload}>下載報表</button>
        </div>
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        managerGroups.length === 0 ? <p className="muted">目前沒有資料。</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="card" style={{ overflowX: 'auto' }}>
              <h3 style={{ marginTop: 0 }}>
                全部宿舍總計
                <span className="muted" style={{ fontWeight: 400, fontSize: 13, marginLeft: 10 }}>
                  {year}年合計 利潤 {fmt(grandTotal.profit)}／分紅 {fmt(grandTotal.bonus)}
                </span>
              </h3>
              <PnlTable monthly={grandMonthly} yearTotal={grandTotal} />
            </div>
            {managerGroups.map((g) => (
              <div key={g.manager1}>
                <h3 style={{ margin: '0 0 12px' }}>
                  宿管1：{g.manager1}
                  <span className="muted" style={{ fontWeight: 400, fontSize: 13, marginLeft: 10 }}>
                    {year}年合計 利潤 {fmt(g.managerYearTotal.profit)}／分紅 {fmt(g.managerYearTotal.bonus)}
                  </span>
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {g.dorms.map((d) => (
                    <div className="card" key={d.dormId} style={{ overflowX: 'auto' }}>
                      <h4 style={{ marginTop: 0 }}>{d.dormName} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>年合計 利潤 {fmt(d.yearTotal.profit)}／分紅 {fmt(d.yearTotal.bonus)}</span></h4>
                      <PnlTable monthly={d.monthly} yearTotal={d.yearTotal} />
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
