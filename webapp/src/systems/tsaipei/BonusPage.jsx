import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import {
  PROJECT_CLIENT_BONUS_ROLE_KEYS, PROJECT_CLIENT_BONUS_ROLE_LABELS, BONUS_ROLE_KEYS, BONUS_ROLE_LABELS,
  computeInternalBonusForMonth, computeDormManagerBonusForMonth, computeOverseasRepBonusForMonth, currentMonthStr, currentYear,
} from '../../lib/bonus';
import { downloadXlsx, addTableSheet } from '../../lib/xlsxExport';

const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

function parseJson(json, fallback) {
  try { return json ? JSON.parse(json) : fallback; } catch { return fallback; }
}

// 可選年份＝有封存紀錄的年份 + 今年，不是讓使用者輸入任何數字卻看到空表。
function availableBonusYears(archives) {
  const years = new Set([currentYear()]);
  (archives || []).forEach((a) => {
    const y = parseInt((a.month || '').slice(0, 4), 10);
    if (y) years.add(y);
  });
  return Array.from(years).sort((a, b) => b - a);
}

// 單一月份的三組明細：有封存用封存當下的數字，沒有就即時試算——跟畫面上
// 單月檢視同一套規則，年度報表才會跟已經封存、對外發過獎金的月份數字
// 保持一致，不會自己重新即時計算蓋過去。
function monthlyRowsFor(monthStr, archives, ctx) {
  const archive = (archives || []).find((a) => a.month === monthStr) || null;
  const allRows = archive ? parseJson(archive.rows, []) : computeInternalBonusForMonth(monthStr, ctx);
  const allDormRows = archive ? parseJson(archive.dormRows, []) : computeDormManagerBonusForMonth(monthStr, ctx);
  const allOverseasRepRows = archive ? parseJson(archive.overseasRepRows, []) : computeOverseasRepBonusForMonth(monthStr, ctx);
  return { allRows, allDormRows, allOverseasRepRows };
}

// 依人員加總：跟 lib/bonus.js 的 computeInternalBonusByPersonForMonth 同一套
// 聚合邏輯，但吃目前實際顯示的 rows/dormRows（可能是封存當下的固定數字，
// 也可能是即時試算），這樣封存後「依人員加總」才會跟著封存的客戶/宿管
// 明細一致，不會自己重新即時計算。
function bonusByPerson(rows, dormRows, overseasRepRows) {
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
  (overseasRepRows || []).forEach((r) => {
    if (!r.supplier || !r.amount) return;
    const entry = (personTotals[r.supplier] ||= { name: r.supplier, total: 0, breakdown: [] });
    entry.total += r.amount;
    entry.breakdown.push({ client: r.client, projectCode: r.projectCode, role: '國外代表', amount: r.amount });
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
  const [year, setYear] = useState(currentYear());
  const [q, setQ] = useState('');
  const [editKey, setEditKey] = useState(null);
  const [editValues, setEditValues] = useState(null);
  const [editDormKey, setEditDormKey] = useState(null);
  const [editDormValues, setEditDormValues] = useState(null);
  const [editOverseasKey, setEditOverseasKey] = useState(null);
  const [editOverseasValues, setEditOverseasValues] = useState(null);

  const ctx = { students, matches, positions, admittedList, inTaiwanVisaRecords, internalFeeSetupRecords, dormitories, housingRecords };

  // 封存：把當月算出來的客戶/宿管/國外代表獎金明細固定下來，之後內部費用
  // 建檔、在台簽證、住宿安排等原始資料再怎麼改，這個月的獎金數字都維持
  // 封存當下的樣子，直到按「取消封存」解除——避免薪資已經發放後，原始
  // 資料事後修正又讓歷史月份的獎金數字變動。
  const archive = archives.find((a) => a.month === month) || null;
  const { allRows, allDormRows, allOverseasRepRows } = monthlyRowsFor(month, archives, ctx);
  const rows = allRows.filter((r) =>
    !q || (r.client || '').toLowerCase().includes(q.toLowerCase()) || (r.projectCode || '').toLowerCase().includes(q.toLowerCase())
  );
  const dormRows = allDormRows.filter((d) => !q || (d.dormName || '').toLowerCase().includes(q.toLowerCase()));
  const overseasRepRows = allOverseasRepRows.filter((r) =>
    !q || (r.client || '').toLowerCase().includes(q.toLowerCase()) || (r.supplier || '').toLowerCase().includes(q.toLowerCase())
  );
  const byPerson = bonusByPerson(allRows, allDormRows, allOverseasRepRows);
  const bonusYears = availableBonusYears(archives);

  // 年度報表：把選定年份1~12月每個月的「依人員加總」攤開成一張表，每個月
  // 份各自照上面同一套規則(封存用封存數字、沒封存即時試算)，不會互相
  // 影響；人員只要任何一個月有金額就會出現，沒有金額的月份顯示"—"。
  const yearlyPersonTotals = {};
  for (let m = 1; m <= 12; m++) {
    const monthStr = `${year}-${String(m).padStart(2, '0')}`;
    const { allRows: r, allDormRows: d, allOverseasRepRows: o } = monthlyRowsFor(monthStr, archives, ctx);
    bonusByPerson(r, d, o).forEach((p) => {
      const entry = (yearlyPersonTotals[p.name] ||= { name: p.name, monthly: Array(12).fill(0), total: 0 });
      entry.monthly[m - 1] += p.total;
      entry.total += p.total;
    });
  }
  const yearlyByPerson = Object.values(yearlyPersonTotals).sort((a, b) => b.total - a.total);

  async function handleDownloadYearly() {
    await downloadXlsx(`內部獎金_${year}年度報表.xlsx`, (workbook) => {
      addTableSheet(
        workbook, '年度合計(依人員)',
        ['姓名', ...MONTH_LABELS, '年度合計'],
        yearlyByPerson.map((p) => [p.name, ...p.monthly, p.total]),
      );
      for (let m = 1; m <= 12; m++) {
        const monthStr = `${year}-${String(m).padStart(2, '0')}`;
        const { allRows: r, allDormRows: d, allOverseasRepRows: o } = monthlyRowsFor(monthStr, archives, ctx);
        const monthDetailRows = [];
        r.forEach((row) => {
          PROJECT_CLIENT_BONUS_ROLE_KEYS.forEach((k) => {
            const amt = row.amounts[k];
            if (!amt) return;
            const roleLabel = BONUS_ROLE_LABELS[BONUS_ROLE_KEYS.indexOf(k)];
            monthDetailRows.push([row.client, row.projectCode, roleLabel, row.roles[k] || '', amt]);
          });
        });
        d.forEach((dorm) => {
          if (dorm.manager1 && dorm.manager1Amount) monthDetailRows.push([dorm.dormName, '', '宿管人員1', dorm.manager1, dorm.manager1Amount]);
          if (dorm.manager2 && dorm.manager2Amount) monthDetailRows.push([dorm.dormName, '', '宿管人員2', dorm.manager2, dorm.manager2Amount]);
        });
        o.forEach((rep) => {
          if (rep.supplier && rep.amount) monthDetailRows.push([rep.client, rep.projectCode, '國外代表', rep.supplier, rep.amount]);
        });
        addTableSheet(workbook, `${m}月`, ['客戶/宿舍', '專案編號', '角色', '人員', '金額'], monthDetailRows);
      }
    });
  }

  async function handleConfirmArchive() {
    const liveRows = computeInternalBonusForMonth(month, ctx);
    const liveDormRows = computeDormManagerBonusForMonth(month, ctx);
    const liveOverseasRepRows = computeOverseasRepBonusForMonth(month, ctx);
    if (!liveRows.length && !liveDormRows.length && !liveOverseasRepRows.length) { alert('這個月沒有可計算的獎金資料，無法封存。'); return; }
    try {
      await addArchive({
        month, rows: JSON.stringify(liveRows), dormRows: JSON.stringify(liveDormRows),
        overseasRepRows: JSON.stringify(liveOverseasRepRows), lockedAt: new Date().toISOString(),
      });
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
        await addArchive({
          month, rows: JSON.stringify(newRows), dormRows: JSON.stringify(allDormRows),
          overseasRepRows: JSON.stringify(allOverseasRepRows), lockedAt: new Date().toISOString(),
        });
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
        await addArchive({
          month, rows: JSON.stringify(allRows), dormRows: JSON.stringify(newDormRows),
          overseasRepRows: JSON.stringify(allOverseasRepRows), lockedAt: new Date().toISOString(),
        });
      }
      setEditDormKey(null);
      setEditDormValues(null);
    } catch (err) {
      alert(`儲存失敗：${err.message || err}`);
    }
  }

  function handleStartEditOverseas(r) {
    setEditOverseasKey(`${r.projectCode}||${r.client}||${r.supplier}`);
    setEditOverseasValues({ amount: r.amount, totalDays: r.totalDays });
  }

  function handleCancelEditOverseas() {
    setEditOverseasKey(null);
    setEditOverseasValues(null);
  }

  async function handleSaveEditOverseas(r) {
    const v = editOverseasValues;
    const updatedRow = { ...r, amount: Number(v.amount) || 0, totalDays: Number(v.totalDays) || 0 };
    const newOverseasRepRows = allOverseasRepRows.map((x) => (x === r ? updatedRow : x));
    try {
      if (archive) {
        await updateArchive(archive.id, { overseasRepRows: JSON.stringify(newOverseasRepRows) });
      } else {
        await addArchive({
          month, rows: JSON.stringify(allRows), dormRows: JSON.stringify(allDormRows),
          overseasRepRows: JSON.stringify(newOverseasRepRows), lockedAt: new Date().toISOString(),
        });
      }
      setEditOverseasKey(null);
      setEditOverseasValues(null);
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
        {archive ? <span className="tag tag-green">已封存</span> : <span className="muted status-text">即時試算</span>}
        {canEditPage && (archive
          ? <button onClick={handleUnlockArchive}>取消封存</button>
          : <button className="primary" onClick={handleConfirmArchive}>封存本月</button>)}
      </div>
      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <div className="table-wrap sticky-header"><table>
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
            {rows.length === 0 && <tr><td colSpan={PROJECT_CLIENT_BONUS_ROLE_KEYS.length + 2} className="muted">沒有資料</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>宿管人員獎金</h3>
        <p className="muted" style={{ marginTop: 0 }}>依宿舍管理設定的宿管1/宿管2計算：這個月實際住在這間宿舍的學生天數 ÷ 30 × 該學生實習單位的內部費用建檔「宿管人員1/宿管人員2」金額，加總到對應的宿管身上。</p>
        <div className="table-wrap sticky-header"><table>
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

      <div className="card" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>國外代表獎金</h3>
        <p className="muted" style={{ marginTop: 0 }}>依學生自己的「學生來源(國外供應商)」分別計算，不是整個實習單位只算給職缺上設定的單一國外代表：費率仍是該實習單位(專案＋客戶)在「內部費用建檔」設定的「國外代表」月費率 ÷ 當月天數 × 該供應商這個月名下所有學生的在台天數加總。學生沒填來源的歸到「(未填學生來源)」；學生來源標「TND」的不計算這筆獎金。</p>
        <div className="table-wrap sticky-header"><table>
          <thead><tr><th>學生來源(國外供應商)</th><th>客戶</th><th>獎金</th><th>在台天數合計</th>{canEditPage && <th></th>}</tr></thead>
          <tbody>
            {overseasRepRows.map((r) => {
              const key = `${r.projectCode}||${r.client}||${r.supplier}`;
              const editing = editOverseasKey === key;
              if (editing) {
                const v = editOverseasValues;
                return (
                  <tr key={key}>
                    <td>{r.supplier}</td>
                    <td><strong>{r.client || '—'}</strong><div className="muted">{r.projectCode}</div></td>
                    <td><input type="number" value={v.amount} onChange={(e) => setEditOverseasValues({ ...v, amount: e.target.value })} style={{ width: 80 }} /></td>
                    <td><input type="number" value={v.totalDays} onChange={(e) => setEditOverseasValues({ ...v, totalDays: e.target.value })} style={{ width: 60 }} /></td>
                    <td className="row-actions">
                      <button className="primary" onClick={() => handleSaveEditOverseas(r)}>儲存</button>
                      <button onClick={handleCancelEditOverseas}>取消</button>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={key}>
                  <td>{r.supplier}</td>
                  <td><strong>{r.client || '—'}</strong><div className="muted">{r.projectCode}</div></td>
                  <td>{r.amount.toLocaleString()} 元</td>
                  <td>{r.totalDays} 天</td>
                  {canEditPage && <td><button onClick={() => handleStartEditOverseas(r)}>編輯</button></td>}
                </tr>
              );
            })}
            {overseasRepRows.length === 0 && <tr><td colSpan={5} className="muted">沒有資料</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>依人員加總</h3>
        <div className="table-wrap sticky-header"><table>
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

      <div className="card" style={{ overflowX: 'auto', marginTop: 16 }}>
        <div className="page-header" style={{ marginBottom: 8 }}>
          <div>
            <h3 style={{ margin: 0 }}>年度報表</h3>
            <div className="page-desc">依人員攤開全年每個月的獎金加總(客戶/宿管/國外代表)，已封存的月份用封存數字、沒封存的月份即時試算，跟上面「依人員加總」同一套邏輯</div>
          </div>
          <div className="row-actions">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {bonusYears.map((y) => <option key={y} value={y}>{y}年</option>)}
            </select>
            <button onClick={handleDownloadYearly}>下載年度報表</button>
          </div>
        </div>
        <div className="table-wrap sticky-header"><table>
          <thead><tr><th>姓名</th>{MONTH_LABELS.map((l) => <th key={l}>{l}</th>)}<th>年度合計</th></tr></thead>
          <tbody>
            {yearlyByPerson.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                {p.monthly.map((v, i) => <td key={i}>{v ? `${v.toLocaleString()} 元` : '—'}</td>)}
                <td style={{ fontWeight: 600 }}>{p.total.toLocaleString()} 元</td>
              </tr>
            ))}
            {yearlyByPerson.length === 0 && <tr><td colSpan={14} className="muted">沒有資料</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
