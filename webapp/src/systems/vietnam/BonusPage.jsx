import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { currentMonthStr } from '../../lib/bonus';
import {
  VN_RATE_ROLE_KEYS, VN_RATE_ROLE_LABELS,
  computeVietnamInternalBonusForMonth, computeVietnamInternalBonusByPersonForMonth,
  computeVietnamSchoolRepBonusForMonth, computeDormManagerBonusForMonth,
} from '../../lib/vietnamBonus';
import { t } from '../../lib/i18n';

// 跟境外生實習系統（tsaipei）的 BonusPage.jsx 不同：角色清單改用越南
// 系統專用的 6 個角色（lib/vietnamBonus.js），不是共用的 lib/bonus.js
// 舊角色清單。
export default function BonusPage() {
  const { lang } = useOutletContext();
  const { rows: students } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: positions } = useCollection('vietnam_positions');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: inTaiwanVisaRecords } = useCollection('vietnam_inTaiwanVisa');
  const { rows: internalFeeSetupRecords } = useCollection('vietnam_internalFeeSetup');
  const { rows: schools } = useCollection('vietnam_schoolSetup');
  const { rows: dormitories } = useCollection('vietnam_dormitories');
  const { rows: housingRecords } = useCollection('vietnam_housingRecords');
  const [month, setMonth] = useState(currentMonthStr());
  const [q, setQ] = useState('');

  const ctx = { students, matches, positions, admittedList, inTaiwanVisaRecords, internalFeeSetupRecords, schools, dormitories, housingRecords };
  const rows = computeVietnamInternalBonusForMonth(month, ctx).filter((r) =>
    !q || (r.client || '').toLowerCase().includes(q.toLowerCase()) || (r.projectCode || '').toLowerCase().includes(q.toLowerCase())
  );
  const byPerson = computeVietnamInternalBonusByPersonForMonth(month, ctx);
  const schoolRows = computeVietnamSchoolRepBonusForMonth(month, ctx).filter((s) =>
    !q || (s.schoolName || '').toLowerCase().includes(q.toLowerCase())
  );
  const dormRows = computeDormManagerBonusForMonth(month, ctx).filter((d) =>
    !q || (d.dormName || '').toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="content">
      <div className="page-header"><div><h2>{t('內部獎金計算', lang)}</h2><div className="page-desc">{t('依月份自動試算：內部費用建檔金額 ÷ 當月天數 × 學生當月在台天數，以實習單位（專案＋客戶）加總', lang)}</div></div></div>
      <p className="muted">{t('依月份自動試算：內部費用建檔金額 ÷ 當月天數 × 學生當月在台天數，以實習單位（專案＋客戶）加總。', lang)}</p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <input placeholder={t('搜尋客戶或專案編號', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
      </div>
      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <div className="table-wrap"><table>
          <thead><tr><th>{t('客戶', lang)}</th>{VN_RATE_ROLE_LABELS.map((l) => <th key={l}>{t(l, lang)}</th>)}<th>{t('在台總天數', lang)}</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><strong>{r.client || '—'}</strong><div className="muted">{r.projectCode}</div></td>
                {VN_RATE_ROLE_KEYS.map((k) => (
                  <td key={k}>
                    {r.roles[k] && <div style={{ fontWeight: 600 }}>{r.roles[k]}</div>}
                    <div className="muted">{(r.amounts[k] || 0).toLocaleString()} {t('元', lang)}</div>
                  </td>
                ))}
                <td>{r.totalDays} {t('天', lang)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={VN_RATE_ROLE_KEYS.length + 2} className="muted">{t('沒有資料', lang)}</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('學校代表獎金', lang)}</h3>
        <p className="muted" style={{ marginTop: 0 }}>{t('依學校資料建檔設定的學校代表＋月費率計算：該校每位學生這個月在台天數 ÷ 當月天數 × 月費率，加總到對應的學校代表身上。', lang)}</p>
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

      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('宿管人員獎金', lang)}</h3>
        <p className="muted" style={{ marginTop: 0 }}>{t('依宿舍管理設定的宿管1/宿管2計算：這個月實際住在這間宿舍的學生天數 ÷ 30 × 該學生實習單位的內部費用建檔「宿管人員1/宿管人員2」金額，加總到對應的宿管身上。', lang)}</p>
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

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('依人員加總', lang)}</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>{t('姓名', lang)}</th><th>{t('總額', lang)}</th><th>{t('明細', lang)}</th></tr></thead>
          <tbody>
            {byPerson.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td>{p.total.toLocaleString()} {t('元', lang)}</td>
                <td className="muted">{p.breakdown.map((b) => `${b.client}(${b.role}) ${b.amount.toLocaleString()}`).join('、')}</td>
              </tr>
            ))}
            {byPerson.length === 0 && <tr><td colSpan={3} className="muted">{t('沒有資料', lang)}</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
