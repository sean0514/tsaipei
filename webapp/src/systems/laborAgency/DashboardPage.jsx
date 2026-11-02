import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { t } from '../../lib/i18n';
import { STAGE_KEYS, stageIndex, daysToExpiry, PERMIT_TIMELINE, VISA_TIMELINE } from './constants';

export default function DashboardPage() {
  const { lang } = useOutletContext();
  const { rows: workers, loading } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');

  const active = workers.filter((w) => stageIndex(w.stage) < 6).length;
  const placed = workers.filter((w) => stageIndex(w.stage) === 6).length;
  const gap = employers.reduce((n, e) => n + Math.max(0, (+e.demand || 0) - workers.filter((w) => w.employerId === e.id).length), 0);
  const expiring = workers.filter((w) => { const d = daysToExpiry(w.passportExpiry); return d !== null && d <= 180; }).length;

  return (
    <div className="content">
      <div className="page-header">
        <div><h2>{t('儀表板', lang)}</h2><div className="page-desc">{t('越南外勞仲介引進案件整體狀況總覽', lang)}</div></div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
          {[
            ['辦理中案件', active], ['在職追蹤中', placed], ['雇主缺工名額', gap], ['證件須處理', expiring],
          ].map(([label, num]) => (
            <div className="card" key={label}>
              <div style={{ fontFamily: 'var(--heading-font)', fontSize: 28, fontWeight: 700 }}>{num}</div>
              <div className="muted">{t(label, lang)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          {t('案件進度共', lang)} {STAGE_KEYS.length} {t('個階段：', lang)}{STAGE_KEYS.map((k) => t(k, lang)).join(' → ')}{t('。基本工人資料在「移工名冊」，詳細案件進度請到「移工管理」查看，雇主缺工狀況在「雇主需求單」，護照效期/停滯案件在「效期提醒」，文件收集進度在「文件追蹤」。', lang)}
        </p>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('「申請許可」送件流程', lang)}</h3>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {PERMIT_TIMELINE.map((step) => <li key={step} style={{ marginBottom: 4 }}>{t(step, lang)}</li>)}
        </ol>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('「簽證辦理」送簽時程', lang)}</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>{t('地區', lang)}</th><th>{t('送件時間', lang)}</th><th>{t('一般簽', lang)}</th><th>{t('快件', lang)}</th></tr></thead>
          <tbody>
            {VISA_TIMELINE.map((v) => (
              <tr key={v.region}>
                <td style={{ fontWeight: 600 }}>{t(v.region, lang)}</td>
                <td>{t(v.schedule, lang)}</td>
                <td>{t(v.normal, lang)}</td>
                <td>{t(v.express, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
