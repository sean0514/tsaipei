import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import {
  PROJECT_CLIENT_BONUS_ROLE_KEYS, PROJECT_CLIENT_BONUS_ROLE_LABELS, BONUS_ROLE_KEYS, BONUS_ROLE_LABELS,
  computeInternalBonusForMonth, computeDormManagerBonusForMonth, currentMonthStr,
} from '../../lib/bonus';

function parseJson(json, fallback) {
  try { return json ? JSON.parse(json) : fallback; } catch { return fallback; }
}

// 依人員加總：跟 lib/bonus.js 的 computeInternalBonusByPersonForMonth 同一套
// 聚合邏輯，但吃目前實際顯示的 rows/dormRows（可能是封存當下的固定數字，
// 也可能是即時試算），這樣封存後「依人員加總」才會跟著封存的客戶/宿管
// 明細一致，不會自己重新即時計算。
function bonusByPerson(rows, dormRows) {
  const personTotals = {};
  rows.forEach((r) => {
    PROJECT_CLIENT_BONUS_ROLE_KEYS.forEach((k) => {
      const name = r.roles[k];
      const amt = r.amounts[k];
      if (!name || !amt) return;
      const entry = (personTotals[name] ||= { name, total: 0, breakdown: [] });
      entry.total += amt;
      entry.breakdown.push({ client: r.client, projectCode: r.projectCode, role: BONUS_ROLE_LABELS[BONUS_ROLE_KEYS.indexOf(k)], amount: amt });
    });
  });
  dormRows.forEach((d) => {
    [[d.manager1, d.manager1Amount, '宿管人員1'], [d.manager2, d.manager2Amount, '宿管人員2']].forEach(([name, amt, roleLabel]) => {
      if (!name || !amt) return;
      const entry = (personTotals[name] ||= { name, total: 0, breakdown: [] });
      entry.total += amt;
      entry.breakdown.push({ client: d.dormName, projectCode: '', role: roleLabel, amount: amt });
    });
  });
  return Object.values(personTotals).sort((a, b) => b.total - a.total);
}

export default function BonusPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'bonus', role, overrides);
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: inTaiwanVisaRecords } = useCollection('tsaipei_inTaiwanVisa');
  const { rows: internalFeeSetupRecords } = useCollection('tsaipei_internalFeeSetup');
  const { rows: dormitories } = useCollection('tsaipei_dormitories');
  const { rows: housingRecords } = useCollection('tsaipei_housingRecords');
  const { rows: archives, add: addArchive, update: updateArchive, remove: removeArchive } = useCollection('tsaipei_bonusArchives');
  const [month, setMonth] = useState(currentMonthStr());
  const [q, setQ] = useState('');
  const [editKey, setEditKey] = useState(null);
  const [editValues, setEditValues] = useState(null);
  const [editDormKey, setEditDormKey] = useState(null);
  const [editDormValues, setEditDormValues] = useState(null);

  const ctx = { students, matches, positions, admittedList, inTaiwanVisaRecords, internalFeeSetupRecords, dormitories, housingRecords };

  // 封存：把當月算出來的客戶/宿管獎金明細固定下來，之後內部費用建檔、
  // 在台簽證、住宿安排等原始資料再怎麼改，這個月的獎金數字都維持封存
  // 當下的樣子，直到按「取消封存」解除——避免薪資已經發放後，原始資料
  // 事後修正又讓歷史月份的獎金數字變動。
  const archive = archives.find((a) => a.month === month) || null;
  const allRows = archive ? parseJson(archive.rows, []) : computeInternalBonusForMonth(month, ctx);
  const allDormRows = archive ? parseJson(archive.dormRows, []) : computeDormManagerBonusForMonth(month, ctx);
  const rows = allRows.filter((r) =>
    !q || (r.client || '').toLowerCase().includes(q.toLowerCase()) || (r.projectCode || '').toLowerCase().includes(q.toLowerCase())
  );
  const dormRows = allDormRows.filter((d) => !q || (d.dormName || '').toLowerCase().includes(q.toLowerCase()));
  const byPerson = bonusByPerson(allRows, allDormRows);

  async function handleConfirmArchive() {
    const liveRows = computeInternalBonusForMonth(month, ctx);
    const liveDormRows = computeDormManagerBonusForMonth(month, ctx);
    if (!liveRows.length && !liveDormRows.length) { alert('這個月沒有可計算的獎金資料，無法封存。'); return; }
    try {
      await addArchive({ month, rows: JSON.stringify(liveRows), dormRows: JSON.stringify(liveDormRows), lockedAt: new Date().toISOString() });
    } catch (err) {
      alert(`封存失敗：${err.message || err}`);
    }
  }

  async function handleUnlockArchive() {
    if (!window.confirm(`確定要取消封存 ${month} 的內部獎金計算嗎？取消後會改回即時重算的數字。`)) return;
    try {
      await removeArchive(archive.id);
    } catch (err) {
      alert(`取消封存失敗：${err.message || err}`);
    }
  }

  function handleStartEdit(row) {
    setEditKey(`${row.projectCode}||${row.client}`);
    const values = { totalDays: row.totalDays };
    PROJECT_CLIENT_BONUS_ROLE_KEYS.forEach((k) => { values[k] = row.amounts[k] || 0; });
    setEditValues(values);
  }

  function handleCancelEdit() {
    setEditKey(null);
    setEditValues(null);
  }

  // 手動修改：跟「封存本月」同一套機制，把改好的數字存進
  // tsaipei_bonusArchives，這個月份還沒封存過的話順便連同其他列當下即時算
  // 出來的數字一起封存，避免只存這一列、其他列卻之後又被重算覆蓋掉。
  async function handleSaveEdit(row) {
    const v = editValues;
    const amounts = { ...row.amounts };
    PROJECT_CLIENT_BONUS_ROLE_KEYS.forEach((k) => { amounts[k] = Number(v[k]) || 0; });
    const updatedRow = { ...row, amounts, totalDays: Number(v.totalDays) || 0 };
    const newRows = allRows.map((r) => (r === row ? updatedRow : r));
    try {
      if (archive) {
        await updateArchive(archive.id, { rows: JSON.stringify(newRows) });
      } else {
        await addArchive({ month, rows: JSON.stringify(newRows), dormRows: JSON.stringify(allDormRows), lockedAt: new Date().toISOString() });
      }
      setEditKey(null);
      setEditValues(null);
    } catch (err) {
      alert(`儲存失敗：${err.message || err}`);
    }
  }

  function handleStartEditDorm(d) {
    setEditDormKey(d.dormId);
    setEditDormValues({
      manager1Amount: d.manager1Amount, manager2Amount: d.manager2Amount, totalResidentDays: d.totalResidentDays,
    });
  }

  function handleCancelEditDorm() {
    setEditDormKey(null);
    setEditDormValues(null);
  }

  async function handleSaveEditDorm(d) {
    const v = editDormValues;
    const updatedDorm = {
      ...d,
      manager1Amount: Number(v.manager1Amount) || 0,
      manager2Amount: Number(v.manager2Amount) || 0,
      totalResidentDays: Number(v.totalResidentDays) || 0,
    };
    const newDormRows = allDormRows.map((x) => (x === d ? updatedDorm : x));
    try {
      if (archive) {
        await updateArchive(archive.id, { dormRows: JSON.stringify(newDormRows) });
      } else {
        await addArchive({ month, rows: JSON.stringify(allRows), dormRows: JSON.stringify(newDormRows), lockedAt: new Date().toISOString() });
      }
      setEditDormKey(null);
      setEditDormValues(null);
    } catch (err) {
      alert(`儲存失敗：${err.message || err}`);
    }
  }

  return (
    <div className="content">
      <div className="page-header"><div><h2>內部獎金計算</h2><div className="page-desc">依月份自動試算：內部費用建檔金額 ÷ 當月天數 × 學生當月在台天數，以實習單位（專案＋客戶）加總</div></div></div>
      <p className="muted">依月份自動試算：內部費用建檔金額 ÷ 當月天數 × 學生當月在台天數，以實習單位（專案＋客戶）加總。</p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <input placeholder="搜尋客戶或專案編號" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        {archive ? <span className="tag tag-green">已封存</span> : <span className="muted">即時試算</span>}
        {canEditPage && (archive
          ? <button onClick={handleUnlockArchive}>取消封存</button>
          : <button className="primary" onClick={handleConfirmArchive}>封存本月</button>)}
      </div>
      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <div className="table-wrap"><table>
          <thead><tr><th>客戶</th>{PROJECT_CLIENT_BONUS_ROLE_LABELS.map((l) => <th key={l}>{l}</th>)}<th>在台總天數</th>{canEditPage && <th></th>}</tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const key = `${r.projectCode}||${r.client}`;
              const editing = editKey === key;
              if (editing) {
                const v = editValues;
                return (
                  <tr key={i}>
                    <td><strong>{r.client || '—'}</strong><div className="muted">{r.projectCode}</div></td>
                    {PROJECT_CLIENT_BONUS_ROLE_KEYS.map((k) => (
                      <td key={k}>
                        {r.roles[k] && <div style={{ fontWeight: 600 }}>{r.roles[k]}</div>}
                        <input type="number" value={v[k]} onChange={(e) => setEditValues({ ...v, [k]: e.target.value })} style={{ width: 80 }} />
                      </td>
                    ))}
                    <td><input type="number" value={v.totalDays} onChange={(e) => setEditValues({ ...v, totalDays: e.target.value })} style={{ width: 60 }} /></td>
                    <td className="row-actions">
                      <button className="primary" onClick={() => handleSaveEdit(r)}>儲存</button>
                      <button onClick={handleCancelEdit}>取消</button>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={i}>
                  <td><strong>{r.client || '—'}</strong><div className="muted">{r.projectCode}</div></td>
                  {PROJECT_CLIENT_BONUS_ROLE_KEYS.map((k) => (
                    <td key={k}>
                      {r.roles[k] && <div style={{ fontWeight: 600 }}>{r.roles[k]}</div>}
                      <div className="muted">{(r.amounts[k] || 0).toLocaleString()} 元</div>
                    </td>
                  ))}
                  <td>{r.totalDays} 天</td>
                  {canEditPage && <td><button onClick={() => handleStartEdit(r)}>編輯</button></td>}
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={12} className="muted">沒有資料</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>宿管人員獎金</h3>
        <p className="muted" style={{ marginTop: 0 }}>依宿舍管理設定的宿管1/宿管2計算：這個月實際住在這間宿舍的學生天數 ÷ 30 × 該學生實習單位的內部費用建檔「宿管人員1/宿管人員2」金額，加總到對應的宿管身上。</p>
        <div className="table-wrap"><table>
          <thead><tr><th>宿舍</th><th>宿管1</th><th>宿管1獎金</th><th>宿管2</th><th>宿管2獎金</th><th>住宿天數合計</th>{canEditPage && <th></th>}</tr></thead>
          <tbody>
            {dormRows.map((d) => {
              const editing = editDormKey === d.dormId;
              if (editing) {
                const v = editDormValues;
                return (
                  <tr key={d.dormId}>
                    <td>{d.dormName}</td>
                    <td>{d.manager1 || '—'}</td>
                    <td><input type="number" value={v.manager1Amount} onChange={(e) => setEditDormValues({ ...v, manager1Amount: e.target.value })} style={{ width: 80 }} /></td>
                    <td>{d.manager2 || '—'}</td>
                    <td><input type="number" value={v.manager2Amount} onChange={(e) => setEditDormValues({ ...v, manager2Amount: e.target.value })} style={{ width: 80 }} /></td>
                    <td><input type="number" value={v.totalResidentDays} onChange={(e) => setEditDormValues({ ...v, totalResidentDays: e.target.value })} style={{ width: 60 }} /></td>
                    <td className="row-actions">
                      <button className="primary" onClick={() => handleSaveEditDorm(d)}>儲存</button>
                      <button onClick={handleCancelEditDorm}>取消</button>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={d.dormId}>
                  <td>{d.dormName}</td>
                  <td>{d.manager1 || '—'}</td>
                  <td>{d.manager1Amount.toLocaleString()} 元</td>
                  <td>{d.manager2 || '—'}</td>
                  <td>{d.manager2Amount.toLocaleString()} 元</td>
                  <td>{d.totalResidentDays} 天</td>
                  {canEditPage && <td><button onClick={() => handleStartEditDorm(d)}>編輯</button></td>}
                </tr>
              );
            })}
            {dormRows.length === 0 && <tr><td colSpan={7} className="muted">沒有資料</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>依人員加總</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>姓名</th><th>總額</th><th>明細</th></tr></thead>
          <tbody>
            {byPerson.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td>{p.total.toLocaleString()} 元</td>
                <td className="muted">{p.breakdown.map((b) => `${b.client}(${b.role}) ${b.amount.toLocaleString()}`).join('、')}</td>
              </tr>
            ))}
            {byPerson.length === 0 && <tr><td colSpan={3} className="muted">沒有資料</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
