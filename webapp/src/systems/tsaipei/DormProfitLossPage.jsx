import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { computeDormProfitLossForYear, currentYear } from '../../lib/bonus';

const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

function fmt(n) {
  return (n || 0).toLocaleString();
}

// 宿舍損益：收入=住宿費收入(不分付款方式)+日常支出申請(宿舍設備收入)；
// 成本=租金/房仲費/水電瓦斯/其他費用+日常支出申請(宿舍設備支出)；
// 利潤=收入-成本；最後依宿舍管理設定的宿管1分類顯示 1-12 月。
export default function DormProfitLossPage() {
  useOutletContext();
  const { rows: dormitories, loading: loadingDorms } = useCollection('tsaipei_dormitories');
  const { rows: housingRecords, loading: loadingHousing } = useCollection('tsaipei_housingRecords');
  const { rows: dormitoryUtilities, loading: loadingUtilities } = useCollection('tsaipei_dormitoryUtilities');
  const { rows: dailyExpenseApplications, loading: loadingApps } = useCollection('tsaipei_dailyExpenseApplications');
  const [year, setYear] = useState(currentYear());

  const ctx = { dormitories, housingRecords, dormitoryUtilities, dailyExpenseApplications };
  const managerGroups = computeDormProfitLossForYear(year, ctx);
  const loading = loadingDorms || loadingHousing || loadingUtilities || loadingApps;

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>宿舍損益</h2>
          <div className="page-desc">收入＝住宿費收入(不分付款方式)＋日常支出申請(宿舍設備收入)；成本＝租金/房仲費/水電瓦斯/其他費用＋日常支出申請(宿舍設備支出)；利潤＝收入－成本；依宿舍管理設定的宿管1分類</div>
        </div>
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || currentYear())} style={{ width: 100 }} />
      </div>
      {loading ? <p className="muted">載入中…</p> : (
        managerGroups.length === 0 ? <p className="muted">目前沒有資料。</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {managerGroups.map((g) => (
              <div key={g.manager1}>
                <h3 style={{ margin: '0 0 12px' }}>
                  宿管1：{g.manager1}
                  <span className="muted" style={{ fontWeight: 400, fontSize: 13, marginLeft: 10 }}>
                    {year}年合計 收入 {fmt(g.managerYearTotal.income)}／成本 {fmt(g.managerYearTotal.cost)}／利潤 {fmt(g.managerYearTotal.profit)}
                  </span>
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {g.dorms.map((d) => (
                    <div className="card" key={d.dormId} style={{ overflowX: 'auto' }}>
                      <h4 style={{ marginTop: 0 }}>{d.dormName} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>年合計 收入 {fmt(d.yearTotal.income)}／成本 {fmt(d.yearTotal.cost)}／利潤 {fmt(d.yearTotal.profit)}</span></h4>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr><th></th>{MONTH_LABELS.map((l) => <th key={l}>{l}</th>)}<th>合計</th></tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td style={{ fontWeight: 600 }}>收入</td>
                              {d.monthly.map((m) => <td key={m.month}>{fmt(m.income)}</td>)}
                              <td style={{ fontWeight: 600 }}>{fmt(d.yearTotal.income)}</td>
                            </tr>
                            <tr>
                              <td style={{ fontWeight: 600 }}>成本</td>
                              {d.monthly.map((m) => <td key={m.month}>{fmt(m.cost)}</td>)}
                              <td style={{ fontWeight: 600 }}>{fmt(d.yearTotal.cost)}</td>
                            </tr>
                            <tr>
                              <td style={{ fontWeight: 600 }}>利潤</td>
                              {d.monthly.map((m) => <td key={m.month} style={{ color: m.profit < 0 ? 'var(--danger)' : undefined }}>{fmt(m.profit)}</td>)}
                              <td style={{ fontWeight: 600, color: d.yearTotal.profit < 0 ? 'var(--danger)' : undefined }}>{fmt(d.yearTotal.profit)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
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
