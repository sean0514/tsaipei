import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import Tag from '../../components/Tag';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';

const FIELDS = [
  { key: 'projectCode', label: '專案編號', required: true },
  { key: 'company', label: '公司名稱', required: true },
  { key: 'industry', label: '產業別' },
  { key: 'title', label: '職務名稱' },
  { key: 'description', label: '職務內容' },
  { key: 'stipendAmount', label: '實習津貼金額', type: 'number' },
  { key: 'boardDeduction', label: '膳宿費扣款金額', type: 'number' },
  { key: 'otherBenefits', label: '其他福利' },
  { key: 'specialNotes', label: '特殊備註' },
];

// 內部獎金計算讀取的角色指派欄位（跟指派人員的名字綁在一起，用來對照領錢的人）——
// 跟 lib/bonus.js 的 BONUS_ROLE_KEYS/BONUS_ROLE_LABELS 保持一致。
export const ROLE_FIELDS = [
  { key: 'bizDev', label: '開發業務' },
  { key: 'serviceSupervisor', label: '服務主管' },
  { key: 'serviceSpecialist', label: '服務專員' },
  { key: 'translationSupervisor', label: '翻譯主管' },
  { key: 'translationSpecialist', label: '翻譯專員' },
  { key: 'adminSupervisor', label: '行政主管' },
  { key: 'adminSpecialist', label: '行政專員' },
  { key: 'accountant', label: '會計人員' },
  { key: 'accountantAssistant', label: '會計助理' },
  { key: 'dormManager1', label: '宿管人員1' },
  { key: 'dormManager2', label: '宿管人員2' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'locationGroups', label: '實習場域/實習地點/缺額/狀態' }, { key: 'closed', label: '已結案' }, ...ROLE_FIELDS];

const POSITION_STATUS = ['開放中', '已額滿', '已結束'];
const POSITION_TAG = { 開放中: 'tag-green', 已額滿: 'tag-amber', 已結束: 'tag-grey' };

function parseLocationGroups(json) {
  try {
    const arr = json ? JSON.parse(json) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// 依現有專案編號的規則（前綴 + 數字結尾）猜下一個編號，方便新增職缺時不用每次手動累加。
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

export default function PositionsPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'matching', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_positions', { order: ['projectCode', 'asc'] });
  const { rows: matches } = useCollection('tsaipei_matches');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_positions', CSV_FIELDS, { entityLabel: '實習單位', requiredKeys: ['projectCode', 'company'], canEdit: canEditPage });

  const open = rows.filter((r) => r.closed !== '是' && (!q || [r.projectCode, r.company, r.title].some((v) => v?.includes(q))));
  const closed = rows.filter((r) => r.closed === '是');

  // 產業類別需求：把未結案職缺依產業別加總（總缺額 - 已媒合），顯示目前還缺
  // 多少人，跟每一列自己顯示的「已媒合/總名額」算法一致。
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

  function copyAsNew(row) {
    // 只留 rest（不含 id），不要再把 id: undefined 塞回去 —— Firestore 的
    // addDoc 不接受欄位值是 undefined，之前這樣寫會讓「複製」存檔直接失敗。
    const { id, ...rest } = row;
    setEditing(rest);
  }

  function renderRows(list) {
    return list.map((r) => {
      const info = positionRowInfo(r, matches);
      return (
        <tr key={r.id}>
          <td>{r.projectCode || '—'}</td>
          <td><div style={{ fontWeight: 600 }}>{r.company}</div><div className="muted" style={{ fontSize: 12 }}>{r.industry || ''}</div></td>
          <td>{r.title || '—'}</td>
          <td>
            {info.groups.length ? info.groups.map((g, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                {g.venue ? `${g.venue} · ` : ''}{g.location || '—'} · {g.headcount || 0}名 <Tag value={g.status} map={POSITION_TAG} />
              </div>
            )) : <span className="muted">尚未設定地點</span>}
          </td>
          <td>{info.matchCount} / {info.totalHeadcount || '—'}</td>
          {canEditPage && (
            <td className="row-actions">
              <button onClick={() => setEditing(r)}>編輯</button>
              <button onClick={() => copyAsNew(r)}>複製</button>
              {r.closed === '是'
                ? <button onClick={() => update(r.id, { closed: '' })}>取消已結案</button>
                : <button onClick={() => update(r.id, { closed: '是' })}>已結案</button>}
              <button className="danger" onClick={() => remove(r.id)}>刪除</button>
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
          <h2>實習單位</h2>
          <div className="page-desc">管理合作企業釋出的實習職缺{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({ projectCode: suggestNextProjectCode(rows) })}>+ 新增職缺</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有職缺資料，請先下載備份再匯入。已結案的職缺按「已結案」後會移到下方「已結案」區塊，也可以按「取消已結案」移回上方列表。</p>}
      {industryList.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>產業類別需求 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>依產業別統計目前剩餘缺額（總缺額－已媒合）</span></h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {industryList.map(([industry, remaining]) => (
              <span key={industry} className="tag" style={{ fontSize: 13 }}>{industry} 剩餘 {remaining} 名</span>
            ))}
          </div>
        </div>
      )}
      <div className="card" style={{ overflowX: 'auto' }}>
        <input placeholder="搜尋專案編號/公司/職務" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>專案編號</th><th>公司名稱</th><th>職務名稱</th><th>實習場域/地點/缺額/狀態</th><th>已媒合/總名額</th>
                {canEditPage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {renderRows(open)}
              {open.length === 0 && <tr><td colSpan={6} className="muted">沒有資料</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>

      {closed.length > 0 && (
        <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>已結案</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>專案編號</th><th>公司名稱</th><th>職務名稱</th><th>實習場域/地點/缺額/狀態</th><th>已媒合/總名額</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>{renderRows(closed)}</tbody>
          </table></div>
        </div>
      )}

      {editing && <PositionFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

function LocationGroupsEditor({ groups, onChange }) {
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
              實習場域
              <input value={g.venue || ''} onChange={(e) => updateRow(i, { venue: e.target.value })} />
            </label>
            <label>
              實習地點
              <input value={g.location || ''} onChange={(e) => updateRow(i, { location: e.target.value })} />
            </label>
            <label>
              缺額
              <input type="number" value={g.headcount ?? 1} onChange={(e) => updateRow(i, { headcount: e.target.value })} />
            </label>
            <label>
              狀態
              <select value={g.status || '開放中'} onChange={(e) => updateRow(i, { status: e.target.value })}>
                {POSITION_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <button type="button" className="primary small" onClick={() => removeRow(i)} style={{ marginTop: 8 }}>移除</button>
        </div>
      ))}
      <button type="button" className="primary small" onClick={addRow}>新增地點</button>
    </div>
  );
}

function PositionFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  const groups = parseLocationGroups(form.locationGroups);

  // 只更新原始內容，不要在這裡就把空白列濾掉——濾掉的話「新增地點」剛加的
  // 空白列會在下一次 render 就消失，使用者根本來不及輸入（回報的「功能無法
  // 作用」）。真正要濾掉沒填地點的列，留到送出表單那一刻再做（跟原本
  // collectLocationGroups 只在送出時才過濾一樣）。
  function setGroups(next) {
    setForm({ ...form, locationGroups: JSON.stringify(next) });
  }

  function handleSubmit(e) {
    e.preventDefault();
    const cleanedGroups = parseLocationGroups(form.locationGroups).filter((g) => g.location);
    onSave({ ...form, locationGroups: JSON.stringify(cleanedGroups) });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯職缺' : '新增職缺'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
          </div>
          <h4>實習場域 / 地點 / 缺額 / 狀態</h4>
          <LocationGroupsEditor groups={groups} onChange={setGroups} />
          <h4>角色指派（內部獎金計算對照用）</h4>
          <div className="form-grid">
            {ROLE_FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
