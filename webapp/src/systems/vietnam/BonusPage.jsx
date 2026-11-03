import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { currentMonthStr } from '../../lib/bonus';
import {
  computeVietnamInternalBonusByPerson,
  computeVietnamSchoolRepBonusForMonth, computeDormManagerBonusForMonth,
} from '../../lib/vietnamBonus';
import { t } from '../../lib/i18n';

// 跟境外生實習系統（tsaipei）的 BonusPage.jsx 不同：角色清單改用越南
// 系統專用的 6 個角色（lib/vietnamBonus.js），不是共用的 lib/bonus.js
// 舊角色清單。開發業務/行政主管/行政招募/行政簽證/外務人員這 5 個角色改成
// 一次性計算（見 lib/vietnamBonus.js 的 computeVietnamInternalBonusByPerson），
// 不分月份；學校代表/宿管人員維持原本按月比例分攤的算法。
export default function BonusPage() {
  const { lang } = useOutletContext();
  const { rows: students } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: positions } = useCollection('vietnam_positions');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: inTaiwanVisaRecords } = useCollection('vietnam_inTaiwanVisa');
  const { rows: schools } = useCollection('vietnam_schoolSetup');
  const { rows: dormitories } = useCollection('vietnam_dormitories');
  const { rows: housingRecords } = useCollection('vietnam_housingRecords');
  const { rows: bonusRateSetup } = useCollection('vietnam_internalBonusRateSetup');
  const { rows: departureTransport } = useCollection('vietnam_departureTransport');
  const [month, setMonth] = useState(currentMonthStr());
  const [q, setQ] = useState('');
  const [qPerson, setQPerson] = useState('');

  // 宿管人員1/2 的費率來源（內部費用建檔）已移除，固定傳空陣列讓
  // lib/bonus.js 的 computeDormManagerBonusForMonth 安全地找不到費率、
  // 金額算成 0，不用動共用計算邏輯本身。
  const ctx = { students, matches, positions, admittedList, inTaiwanVisaRecords, bonusRateSetup, departureTransport, internalFeeSetupRecords: [], schools, dormitories, housingRecords };
  const byPerson = computeVietnamInternalBonusByPerson(ctx).filter((p) =>
    !qPerson || p.name.toLowerCase().includes(qPerson.toLowerCase()) || p.breakdown.some((b) => (b.student || '').toLowerCase().includes(qPerson.toLowerCase()))
  );
  const schoolRows = computeVietnamSchoolRepBonusForMonth(month, ctx).filter((s) =>
    !q || (s.schoolName || '').toLowerCase().includes(q.toLowerCase())
  );
  const dormRows = computeDormManagerBonusForMonth(month, ctx).filter((d) =>
    !q || (d.dormName || '').toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="content">
      <div className="page-header"><div><h2>{t('內部獎金計算', lang)}</h2><div className="page-desc">{t('開發業務/行政主管/行政招募/行政簽證/外務人員：以「越南送機行程」出現過的學生名單為準，依該學生就讀學校在「內部獎金設定」的費率一次性計算，依人員加總', lang)}</div></div></div>

      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('一次性內部獎金（依人員加總）', lang)}</h3>
        <p className="muted" style={{ marginTop: 0 }}>{t('開發業務/行政主管/行政招募/行政簽證/外務人員：學生安排送機後才算一次，不分月份、不按在台天數比例分攤。', lang)}</p>
        <input placeholder={t('搜尋姓名或學生', lang)} value={qPerson} onChange={(e) => setQPerson(e.target.value)} style={{ width: 220, marginBottom: 12 }} />
        <div className="table-wrap"><table>
          <thead><tr><th>{t('姓名', lang)}</th><th>{t('總額', lang)}</th><th>{t('明細', lang)}</th></tr></thead>
          <tbody>
            {byPerson.map((p) => (
              <tr key={p.name}>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td>{p.total.toLocaleString()} {t('元', lang)}</td>
                <td className="muted">{p.breakdown.map((b) => `${b.student}・${b.client}(${t(b.role, lang)}) ${b.amount.toLocaleString()}`).join('、')}</td>
              </tr>
            ))}
            {byPerson.length === 0 && <tr><td colSpan={3} className="muted">{t('沒有資料', lang)}</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <input placeholder={t('搜尋學校或宿舍', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
      </div>

      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('學校代表獎金', lang)}</h3>
        <p className="muted" style={{ marginTop: 0 }}>{t('依學校費用設定的學校代表＋月費率計算：該校每位學生這個月在台天數 ÷ 當月天數 × 月費率，加總到對應的學校代表身上。', lang)}</p>
        <div className="table-wrap"><table>
          <thead><tr><th>{t('學校', lang)}</th><th>{t('學校代表', lang)}</th><th>{t('獎金', lang)}</th><th>{t('在台總天數', lang)}</th></tr></thead>
          <tbody>
            {schoolRows.map((s) => (
              <tr key={s.schoolName}>
                <td>{s.schoolName}</td>
                <td>{s.schoolRep || '—'}</td>
                <td>{s.amount.toLocaleString()} {t('元', lang)}</td>
                <td>{s.totalDays} {t('天', lang)}</td>
              </tr>
            ))}
            {schoolRows.length === 0 && <tr><td colSpan={4} className="muted">{t('沒有資料', lang)}</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>{t('宿管人員獎金', lang)}</h3>
        <p className="muted" style={{ marginTop: 0 }}>{t('依宿舍管理設定的宿管1/宿管2計算，費率來源（內部費用建檔）已移除，金額顯示為 0。', lang)}</p>
        <div className="table-wrap"><table>
          <thead><tr><th>{t('宿舍', lang)}</th><th>{t('宿管1', lang)}</th><th>{t('宿管1獎金', lang)}</th><th>{t('宿管2', lang)}</th><th>{t('宿管2獎金', lang)}</th><th>{t('住宿天數合計', lang)}</th></tr></thead>
          <tbody>
            {dormRows.map((d) => (
              <tr key={d.dormId}>
                <td>{d.dormName}</td>
                <td>{d.manager1 || '—'}</td>
                <td>{d.manager1Amount.toLocaleString()} {t('元', lang)}</td>
                <td>{d.manager2 || '—'}</td>
                <td>{d.manager2Amount.toLocaleString()} {t('元', lang)}</td>
                <td>{d.totalResidentDays} {t('天', lang)}</td>
              </tr>
            ))}
            {dormRows.length === 0 && <tr><td colSpan={6} className="muted">{t('沒有資料', lang)}</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
