import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { currentMonthStr } from '../../lib/bonus';
import { computeIndonesiaInternalBonusByPerson, computeIndonesiaSchoolRepBonusForMonth } from '../../lib/indonesiaBonus';
import { t } from '../../lib/i18n';

// 金額依幣別分開加總後的物件（{幣別: 金額}）格式化成一行文字，例如
// 「50,000 新台幣、100 美金」；沒有任何金額就顯示 0。開發業務/行政主管
// 等 5 個角色、學校代表都可能各自設定不同幣別，同一個人底下可能同時有
// 不同幣別的金額，不能直接加總成一個數字。
function formatTotalsByCurrency(totalsByCurrency, lang) {
  const entries = Object.entries(totalsByCurrency || {}).filter(([, amount]) => amount);
  if (!entries.length) return '0';
  return entries.map(([currency, amount]) => `${amount.toLocaleString()} ${t(currency, lang)}`).join('、');
}

// 跟境外生實習系統（tsaipei）的 BonusPage.jsx 不同：角色清單改用印尼
// 系統專用的 5 個角色（lib/indonesiaBonus.js），不是共用的 lib/bonus.js
// 舊角色清單。開發業務/行政主管/行政招募/行政簽證/外務人員這 5 個角色＋
// 學校代表的一次性獎金改成一次性計算（見 lib/indonesiaBonus.js 的
// computeIndonesiaInternalBonusByPerson），不分月份；學校代表的月費率維持
// 原本按月比例分攤的算法。宿管人員獎金的費率來源（內部費用建檔）已經
// 移除，這裡不再顯示這個永遠是 0 的區塊。
export default function BonusPage() {
  const { lang } = useOutletContext();
  const { rows: students } = useCollection('indonesia_students');
  const { rows: matches } = useCollection('indonesia_matches');
  const { rows: positions } = useCollection('indonesia_positions');
  const { rows: admittedList } = useCollection('indonesia_admittedList');
  // 實際入境/離境日期記在境外生系統「在台簽證追蹤」，不是印尼系統自己
  // 的 indonesia_inTaiwanVisa（整個系統沒有任何地方會真的寫入這個
  // collection，一直是空的）——見 lib/indonesiaBonus.js 的
  // computeIndonesiaSchoolRepBonusForMonth。
  const { rows: inTaiwanVisaRecords } = useCollection('tsaipei_inTaiwanVisa');
  const { rows: schools } = useCollection('indonesia_schoolSetup');
  const { rows: bonusRateSetup } = useCollection('indonesia_internalBonusRateSetup');
  const { rows: departureTransport } = useCollection('indonesia_departureTransport');
  const [month, setMonth] = useState(currentMonthStr());
  const [q, setQ] = useState('');
  const [qPerson, setQPerson] = useState('');

  const ctx = { students, matches, positions, admittedList, inTaiwanVisaRecords, bonusRateSetup, departureTransport, schools };
  const personSearch = qPerson.trim().toLowerCase();
  const byMonth = computeIndonesiaInternalBonusByPerson(ctx)
    .map((g) => ({
      month: g.month,
      byPerson: g.byPerson.filter((p) =>
        !personSearch || p.name.toLowerCase().includes(personSearch) || p.breakdown.some((b) => (b.student || '').toLowerCase().includes(personSearch))
      ),
    }))
    .filter((g) => g.byPerson.length > 0);
  const schoolRows = computeIndonesiaSchoolRepBonusForMonth(month, ctx).filter((s) =>
    !q || (s.schoolName || '').toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="content">
      <div className="page-header"><div><h2>{t('內部獎金計算', lang)}</h2><div className="page-desc">{t('開發業務/行政主管/行政招募/行政簽證/外務人員：以「印尼送機行程」出現過的學生名單為準，依該學生就讀學校在「內部獎金設定」的費率一次性計算，依人員加總', lang)}</div></div></div>

      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('一次性內部獎金（依人員加總）', lang)}</h3>
        <p className="muted" style={{ marginTop: 0 }}>{t('開發業務/行政主管/行政招募/行政簽證/外務人員，以及學校費用設定的學校代表獎金（一次性）：依「印尼送機行程」實際填上的送機日期分月份顯示，只填了日期才算這個學生的案件完成、列入計算；各角色/學校代表可能各自設定不同幣別，加總時依幣別分開列出。', lang)}</p>
        <input placeholder={t('搜尋姓名或學生', lang)} value={qPerson} onChange={(e) => setQPerson(e.target.value)} style={{ width: 220, marginBottom: 12 }} />
        {byMonth.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('沒有資料', lang)}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {byMonth.map((g) => (
              <div key={g.month}>
                <h4 style={{ margin: '0 0 8px' }}>{g.month} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{g.byPerson.length} {t('位人員', lang)}</span></h4>
                <div className="table-wrap"><table>
                  <thead><tr><th>{t('姓名', lang)}</th><th>{t('總額', lang)}</th><th>{t('明細', lang)}</th></tr></thead>
                  <tbody>
                    {g.byPerson.map((p) => (
                      <tr key={p.name}>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td>{formatTotalsByCurrency(p.totalsByCurrency, lang)}</td>
                        <td className="muted">{p.breakdown.map((b) => `${b.student}・${b.client}(${t(b.role, lang)}) ${b.amount.toLocaleString()} ${t(b.currency, lang)}`).join('、')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <input placeholder={t('搜尋學校', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
      </div>

      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('學校代表獎金', lang)}</h3>
        <p className="muted" style={{ marginTop: 0 }}>{t('依學校費用設定的學校代表＋月費率計算：該校每位學生這個月在台天數 ÷ 當月天數 × 月費率，加總到對應的學校代表身上。', lang)}</p>
        <div className="table-wrap"><table>
          <thead><tr><th>{t('學校', lang)}</th><th>{t('學校代表', lang)}</th><th>{t('獎金', lang)}</th><th>{t('在台總天數', lang)}</th><th>{t('明細', lang)}</th></tr></thead>
          <tbody>
            {schoolRows.map((s) => (
              <tr key={s.schoolName}>
                <td>{s.schoolName}</td>
                <td>{s.schoolRep || '—'}</td>
                <td>{s.amount.toLocaleString()} {t(s.currency, lang)}</td>
                <td>{s.totalDays} {t('天', lang)}</td>
                <td className="muted">{s.breakdown.map((b) => `${b.student}(${b.days}${t('天', lang)}) ${b.amount.toLocaleString()} ${t(s.currency, lang)}`).join('、')}</td>
              </tr>
            ))}
            {schoolRows.length === 0 && <tr><td colSpan={5} className="muted">{t('沒有資料', lang)}</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
