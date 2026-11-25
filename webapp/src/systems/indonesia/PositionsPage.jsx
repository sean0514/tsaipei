import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import Tag from '../../components/Tag';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';

const FIELDS = [
  { key: 'projectCode', label: '專案編號', required: true },
  { key: 'letterNo', label: '函文編號' },
  { key: 'company', label: '公司名稱', required: true },
  { key: 'industry', label: '產業別' },
  { key: 'title', label: '職務名稱' },
  { key: 'description', label: '職務內容' },
  { key: 'stipendAmount', label: '實習津貼金額', type: 'number' },
  { key: 'boardDeduction', label: '膳宿費扣款金額', type: 'number' },
  { key: 'specialNotes', label: '特殊備註' },
];

// 內部獎金計算的角色指派——開發業務/行政主管/行政招募/行政簽證/外務人員
// 都已改成在「學生資料」頁面各自指派（見 StudentsPage.jsx 的
// assignedBizDev/assignedAdminSupervisor/assignedAdminRecruit/assignedAdminVisa/
// assignedFieldStaff），不在這裡（實習單位/專案+客戶）層級指派；學校代表
// 改成在「學校費用設定」依學生就讀學校指派。
// 宿管人員1/2 維持舊有做法：依「宿舍管理」設定的宿管1/宿管2計算，不在
// 這裡指派（見 lib/bonus.js 的 computeDormManagerBonusForMonth）。
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, ...FIELDS, { key: 'locationGroups', label: '實習場域/實習地點/缺額/狀態' },
  { key: 'otherBenefits', label: '其他福利' }, { key: 'closed', label: '已結案' },
];

const POSITION_STATUS = ['開放中', '已額滿', '已結束'];
const POSITION_TAG = { 開放中: 'tag-green', 已額滿: 'tag-amber', 已結束: 'tag-grey' };

function parseLocationGroups(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function parseBenefits(text) {
  if (!text) return [];
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) return arr;
  } catch { /* 不是 JSON，當作舊版單一文字欄位處理 */ }
  return [text];
}

function suggestNextProjectCode(rows) {
  const codes = rows.map((r) => r.projectCode).filter(Boolean);
  if (!codes.length) return '';
  const latest = codes.slice().sort().pop();
  const m = latest.match(/^(.*?)(\d+)$/);
  if (!m) return '';
  const [, prefix, digits] = m;
  const next = String(Number(digits) + 1).padStart(digits.length, '0');
  return `${prefix}${next}`;
}

function positionRowInfo(p, matches) {
  const groups = parseLocationGroups(p.locationGroups);
  const totalHeadcount = groups.reduce((sum, g) => sum + (Number(g.headcount) || 0), 0);
  const matchCount = matches.filter((m) => m.positionId === p.id && m.status !== '取消').length;
  return { groups, totalHeadcount, matchCount };
}

// 複製自 systems/tsaipei/PositionsPage.jsx，collection 字首改成 indonesia_，
// 介面文字包上 t(...)。
export default function PositionsPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'positions', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('indonesia_positions', { order: ['projectCode', 'asc'] });
  const { rows: matches } = useCollection('indonesia_matches');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('indonesia_positions', CSV_FIELDS, { entityLabel: '實習單位', requiredKeys: ['projectCode', 'company'], canEdit: canEditPage });

  // 刪除實習單位以前沒有連動清掉指向它的媒合紀錄（已經補上，見下面的
  // handleDeletePosition），導致舊資料留下一批 positionId 已經找不到對應
  // 職缺的媒合紀錄，以及綁在這些媒合紀錄上、同樣對應不到職缺的二面/錄取
  // 紀錄。這裡載入時順便清掉：媒合紀錄清空 positionId、退回「媒合中」，
  // 二面/錄取直接刪除——跟 handleDeletePosition 同一套處理方式，只是這裡
  // 一次處理所有孤兒紀錄，不是刪除單一職缺時才處理。
  const orphanCleanupDone = useRef(false);
  useEffect(() => {
    if (!canEditPage || loading || orphanCleanupDone.current) return;
    const positionIds = new Set(rows.map((r) => r.id));
    const orphanMatches = matches.filter((m) => m.positionId && !positionIds.has(m.positionId));
    if (!orphanMatches.length) return;
    orphanCleanupDone.current = true;
    (async () => {
      const matchIds = orphanMatches.map((m) => m.id);
      const dependentSnaps = await Promise.all([
        getDocs(query(collection(db, 'indonesia_secondInterviews'), where('matchId', 'in', matchIds.slice(0, 30)))),
        getDocs(query(collection(db, 'indonesia_admittedList'), where('matchId', 'in', matchIds.slice(0, 30)))),
      ]);
      const deleteRefs = dependentSnaps.flatMap((snap) => snap.docs.map((d) => d.ref));
      const batch = writeBatch(db);
      deleteRefs.forEach((ref) => batch.delete(ref));
      orphanMatches.forEach((m) => batch.update(doc(db, 'indonesia_matches', m.id), { positionId: '', status: '媒合中' }));
      await batch.commit();
    })().catch((err) => console.error('實習單位：清理孤兒媒合紀錄失敗', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, canEditPage]);

  const byCompany = (a, b) => (a.company || '').localeCompare(b.company || '');
  const open = rows.filter((r) => r.closed !== '是' && (!q || [r.projectCode, r.company, r.title].some((v) => v?.includes(q)))).sort(byCompany);
  const closed = rows.filter((r) => r.closed === '是').sort(byCompany);

  const industryDemand = {};
  rows.filter((r) => r.closed !== '是').forEach((r) => {
    const industry = r.industry || '未分類';
    const info = positionRowInfo(r, matches);
    const remaining = Math.max(info.totalHeadcount - info.matchCount, 0);
    industryDemand[industry] = (industryDemand[industry] || 0) + remaining;
  });
  const industryList = Object.entries(industryDemand).sort((a, b) => a[0].localeCompare(b[0]));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ ...data, closed: '' });
    }
    setEditing(null);
  }

  // 刪除實習單位時，原本直接 remove(r.id)，沒有清掉任何關聯資料：媒合紀錄
  // (indonesia_matches) 還留著一個指向已經不存在職缺的 positionId，二面
  // (indonesia_secondInterviews)、錄取名單 (indonesia_admittedList) 也還留著
  // 對應這個職缺的紀錄。這裡改成：媒合紀錄保留(media日期/備註等學生端
  // 歷程不是因為職缺消失就沒有意義)，只把 positionId 清空、狀態退回
  // 「媒合中」，讓學生自動重新出現在「學生尚未安排」；二面/錄取則是
  // 綁定在「這個職缺」上的結果，職缺沒了就沒有意義，直接刪除。
  async function handleDeletePosition(positionId) {
    if (!window.confirm(t('確定要刪除這個實習單位嗎？已經媒合的學生會退回「媒合中」，對應的二面/錄取紀錄會一併刪除。', lang))) return;
    const matchesSnap = await getDocs(query(collection(db, 'indonesia_matches'), where('positionId', '==', positionId)));
    const matchIds = matchesSnap.docs.map((d) => d.id);
    const dependentSnaps = await Promise.all([
      matchIds.length ? getDocs(query(collection(db, 'indonesia_secondInterviews'), where('matchId', 'in', matchIds.slice(0, 30)))) : null,
      matchIds.length ? getDocs(query(collection(db, 'indonesia_admittedList'), where('matchId', 'in', matchIds.slice(0, 30)))) : null,
    ]);
    const deleteRefs = dependentSnaps.flatMap((snap) => (snap ? snap.docs.map((d) => d.ref) : []));
    for (let i = 0; i < deleteRefs.length; i += 450) {
      const batch = writeBatch(db);
      deleteRefs.slice(i, i + 450).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    for (let i = 0; i < matchesSnap.docs.length; i += 450) {
      const batch = writeBatch(db);
      matchesSnap.docs.slice(i, i + 450).forEach((d) => batch.update(d.ref, { positionId: '', status: '媒合中' }));
      await batch.commit();
    }
    await remove(positionId);
  }

  function copyAsNew(row) {
    const { id, ...rest } = row;
    setEditing(rest);
  }

  function renderRows(list) {
    return list.map((r) => {
      const info = positionRowInfo(r, matches);
      return (
        <tr key={r.id}>
          <td>{r.projectCode || '—'}</td>
          <td>{r.letterNo || '—'}</td>
          <td><div style={{ fontWeight: 600 }}>{r.company}</div><div className="muted" style={{ fontSize: 12 }}>{r.industry || ''}</div></td>
          <td>{r.title || '—'}</td>
          <td>
            {info.groups.length ? info.groups.map((g, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                {g.venue ? `${g.venue} · ` : ''}{g.location || '—'} · {g.headcount || 0}{t('名', lang)} <Tag value={g.status} map={POSITION_TAG} lang={lang} />
              </div>
            )) : <span className="muted">{t('尚未設定地點', lang)}</span>}
          </td>
          <td>{info.matchCount} / {info.totalHeadcount || '—'}</td>
          {canEditPage && (
            <td>
              <div className="row-actions">
                <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                <button onClick={() => copyAsNew(r)}>{t('複製', lang)}</button>
                {r.closed === '是'
                  ? <button onClick={() => update(r.id, { closed: '' })}>{t('取消已結案', lang)}</button>
                  : <button onClick={() => update(r.id, { closed: '是' })}>{t('已結案', lang)}</button>}
                <button className="danger" onClick={() => handleDeletePosition(r.id)}>{t('刪除', lang)}</button>
              </div>
            </td>
          )}
        </tr>
      );
    });
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('實習單位', lang)}</h2>
          <div className="page-desc">{t('管理合作企業釋出的實習職缺', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({ projectCode: suggestNextProjectCode(rows) })}>+ {t('新增職缺', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有職缺資料，請先下載備份再匯入。已結案的職缺按「已結案」後會移到下方「已結案」區塊，也可以按「取消已結案」移回上方列表。', lang)}</p>}
      {industryList.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>{t('產業類別需求', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{t('依產業別統計目前剩餘缺額（總缺額－已媒合）', lang)}</span></h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {industryList.map(([industry, remaining]) => (
              <span key={industry} className="tag" style={{ fontSize: 13 }}>{industry} {t('剩餘', lang)} {remaining} {t('名', lang)}</span>
            ))}
          </div>
        </div>
      )}
      <div className="card" style={{ overflowX: 'auto' }}>
        <input placeholder={t('搜尋專案編號/公司/職務', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>{t('專案編號', lang)}</th><th>{t('函文編號', lang)}</th><th>{t('公司名稱', lang)}</th><th>{t('職務名稱', lang)}</th><th>{t('實習場域/地點/缺額/狀態', lang)}</th><th>{t('已媒合/總名額', lang)}</th>
                {canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {renderRows(open)}
              {open.length === 0 && <tr><td colSpan={7} className="muted">{t('沒有資料', lang)}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>

      {closed.length > 0 && (
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>{t('已結案', lang)}</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>{t('專案編號', lang)}</th><th>{t('函文編號', lang)}</th><th>{t('公司名稱', lang)}</th><th>{t('職務名稱', lang)}</th><th>{t('實習場域/地點/缺額/狀態', lang)}</th><th>{t('已媒合/總名額', lang)}</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>{renderRows(closed)}</tbody>
          </table></div>
        </div>
      )}

      {editing && <PositionFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function LocationGroupsEditor({ groups, onChange, lang }) {
  const list = groups.length ? groups : [{ venue: '', location: '', headcount: 1, status: '開放中' }];

  function updateRow(i, patch) {
    const next = list.map((g, idx) => (idx === i ? { ...g, ...patch } : g));
    onChange(next);
  }
  function removeRow(i) {
    if (list.length > 1) onChange(list.filter((_, idx) => idx !== i));
    else onChange([{ venue: '', location: '', headcount: 1, status: '開放中' }]);
  }
  function addRow() {
    onChange([...list, { venue: '', location: '', headcount: 1, status: '開放中' }]);
  }

  return (
    <div>
      {list.map((g, i) => (
        <div key={i} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
          <div className="form-grid">
            <label>
              {t('實習場域', lang)}
              <input value={g.venue || ''} onChange={(e) => updateRow(i, { venue: e.target.value })} />
            </label>
            <label>
              {t('實習地點', lang)}
              <input value={g.location || ''} onChange={(e) => updateRow(i, { location: e.target.value })} />
            </label>
            <label>
              {t('缺額', lang)}
              <input type="number" value={g.headcount ?? 1} onChange={(e) => updateRow(i, { headcount: e.target.value })} />
            </label>
            <label>
              {t('狀態', lang)}
              <select value={g.status || '開放中'} onChange={(e) => updateRow(i, { status: e.target.value })}>
                {POSITION_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <button type="button" className="primary small" onClick={() => removeRow(i)} style={{ marginTop: 8 }}>{t('移除', lang)}</button>
        </div>
      ))}
      <button type="button" className="primary small" onClick={addRow}>{t('新增地點', lang)}</button>
    </div>
  );
}

function BenefitsEditor({ benefits, onChange, lang }) {
  const [newItem, setNewItem] = useState('');

  function addItem() {
    const text = newItem.trim();
    if (!text) return;
    onChange([...benefits, text]);
    setNewItem('');
  }
  function removeItem(i) {
    onChange(benefits.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      {benefits.length > 0 && (
        <ul className="note-list">
          {benefits.map((b, i) => (
            <li key={i}>
              <div className="row-actions">
                <span style={{ flex: 1 }}>{b}</span>
                <button type="button" className="danger" onClick={() => removeItem(i)}>{t('移除', lang)}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="row-actions">
        <input
          placeholder={t('輸入福利項目', lang)}
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
          style={{ flex: 1 }}
        />
        <button type="button" onClick={addItem}>+ {t('新增福利', lang)}</button>
      </div>
    </div>
  );
}

function PositionFormModal({ initial, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  const groups = parseLocationGroups(form.locationGroups);
  const benefits = parseBenefits(form.otherBenefits);

  function setGroups(next) {
    setForm({ ...form, locationGroups: JSON.stringify(next) });
  }

  function setBenefits(next) {
    setForm({ ...form, otherBenefits: JSON.stringify(next) });
  }

  function handleSubmit(e) {
    e.preventDefault();
    const cleanedGroups = parseLocationGroups(form.locationGroups).filter((g) => g.venue || g.location);
    onSave({ ...form, locationGroups: JSON.stringify(cleanedGroups), otherBenefits: JSON.stringify(parseBenefits(form.otherBenefits)) });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯職缺', lang) : t('新增職缺', lang)}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {t(f.label, lang)}
                <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
          </div>
          <h4>{t('實習場域/地點/缺額/狀態', lang)}</h4>
          <LocationGroupsEditor groups={groups} onChange={setGroups} lang={lang} />
          <h4>{t('其他福利', lang)}</h4>
          <BenefitsEditor benefits={benefits} onChange={setBenefits} lang={lang} />
          <div className="row-actions">
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
