import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canView } from '../../lib/permissions';
import { parseBenefits } from './PositionsPage';
import { t } from '../../lib/i18n';

const SOURCE_LABEL = { tsaipei: '境外生實習', vietnam: '越南實習生' };

// 複製自 systems/tsaipei/PositionBenefitsPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。境外生實習系統（tsaipei）跟越南實習生
// 系統（vietnam）的「實習單位福利」頁面連動顯示：兩邊都同時讀取
// tsaipei_positions + vietnam_positions，合併成同一份福利清單，用「來源
// 系統」欄位標示每筆資料是哪個系統的職缺（firestore.rules 已放行跨系統
// 讀取這兩個 collection）。資料本身不合併存放，各系統的職缺還是各自
// 獨立維護。
export default function PositionBenefitsPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canSee = canView(system, 'benefits', role, overrides);
  const { rows: tsaipeiPositions, loading: loadingTsaipei } = useCollection('tsaipei_positions', { order: ['projectCode', 'asc'] });
  const { rows: vietnamPositions, loading: loadingVietnam } = useCollection('vietnam_positions', { order: ['projectCode', 'asc'] });
  const loading = loadingTsaipei || loadingVietnam;
  const [q, setQ] = useState('');

  const searchQuery = q.trim().toLowerCase();
  const rows = [
    ...tsaipeiPositions.map((p) => ({ ...p, source: 'tsaipei' })),
    ...vietnamPositions.map((p) => ({ ...p, source: 'vietnam' })),
  ]
    .map((p) => ({ ...p, benefits: parseBenefits(p.otherBenefits) }))
    .filter((p) => p.benefits.length > 0)
    .filter((p) => !searchQuery || `${p.projectCode || ''} ${p.company || ''} ${p.benefits.join(' ')}`.toLowerCase().includes(searchQuery));

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('實習單位福利', lang)}</h2>
          <div className="page-desc">{t('彙整境外生實習系統＋越南實習生系統各實習單位（職缺）目前登記的其他福利項目，資料來自雙方「實習單位」的新增職缺表單', lang)}{!canSee && `（${t('唯讀', lang)}）`}</div>
        </div>
      </div>
      <input placeholder={t('搜尋專案編號、公司或福利項目', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 280 }} />
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="table-wrap"><table>
            <thead><tr><th>{t('來源系統', lang)}</th><th>{t('專案編號', lang)}</th><th>{t('公司名稱', lang)}</th><th>{t('職務名稱', lang)}</th><th>{t('實習津貼金額', lang)}</th><th>{t('膳宿費扣款金額', lang)}</th><th>{t('其他福利', lang)}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.source}-${r.id}`}>
                  <td><span className="tag" style={{ fontSize: 12 }}>{t(SOURCE_LABEL[r.source], lang)}</span></td>
                  <td>{r.projectCode || '—'}</td>
                  <td>{r.company || '—'}</td>
                  <td>{r.title || '—'}</td>
                  <td>{r.stipendAmount ? Number(r.stipendAmount).toLocaleString() : '—'}</td>
                  <td>{r.boardDeduction ? Number(r.boardDeduction).toLocaleString() : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {r.benefits.map((b, i) => <span key={i} className="tag" style={{ fontSize: 12 }}>{b}</span>)}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="muted">{t('目前沒有登記其他福利的職缺。', lang)}</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
