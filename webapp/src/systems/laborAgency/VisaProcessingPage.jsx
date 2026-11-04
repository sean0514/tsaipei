import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { t } from '../../lib/i18n';
import { employerLabel, workerEmployerIds, getPairFlag, withPairFlag } from './constants';

const UNSET_AGENCY = '__unset_agency__';
const UNMATCHED_EMPLOYER = '__unmatched__';

// 簽證文號、台灣電話號碼這兩個欄位原本每打一個字就立刻非同步寫一次
// Firestore；打字速度一快，好幾個 updateDoc 同時在飛，網路上完成的
// 先後順序不保證跟打字順序一樣，較舊那次（字數較少）的寫入如果比較晚
// 完成，就會把 Firestore 上較新、字數較多的值蓋回去，連帶透過
// onSnapshot 把畫面也蓋回去——看起來像「只能輸入一個數字」或打到一半
// 被清空。改成：畫面永遠顯示本地狀態（打字當下就看得到，不等外部
// 資料），輸入框還在聚焦時不接受外部資料覆蓋本地值；真正寫回 Firestore
// 則是停止輸入 400ms 後才寫一次（debounce），失焦時立刻把還沒寫出去的
// 值補寫一次——同一個欄位同時間只會有一次寫入在飛，不會互相搶跑蓋掉。
function DigitsInput({ value, onChange, style }) {
  const [local, setLocal] = useState(value || '');
  const [focused, setFocused] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!focused) setLocal(value || '');
  }, [value, focused]);

  function commit(digits) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(digits), 400);
  }

  function handleChange(e) {
    const digits = e.target.value.replace(/\D/g, '');
    setLocal(digits);
    commit(digits);
  }

  function handleBlur() {
    setFocused(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      onChange(local);
    }
  }

  return (
    <input
      inputMode="numeric"
      value={local}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      onChange={handleChange}
      style={style}
    />
  );
}

// 這個表格原本是定義在 VisaProcessingPage 函式「裡面」的巢狀元件，每次
// 父元件重新 render（包括 DigitsInput 自己 debounce 寫入 Firestore後
// onSnapshot 觸發的那次 render）就會產生一個全新的函式物件，React 會
// 把它當成「不同的元件類型」整個卸載重掛，連帶把 DigitsInput 的本地
// 輸入狀態也一起清空——這才是輸入框一直打不進去、卡住的真正原因（跟
// debounce 本身無關）。改成定義在元件外層（module 層級），元件身分
// 穩定不會每次 render 都換掉，才不會一直被重新掛載。
function EmployerTable({
  employerId, rows, employers, lang, canEditPage, onField, onComplete, onBack, onRemove,
}) {
  const group = rows.filter((r) => (r.employerId || UNMATCHED_EMPLOYER) === employerId);
  if (group.length === 0) return null;
  const sorted = [...group].sort((a, b) => (a.worker.name || '').localeCompare(b.worker.name || ''));
  return (
    <div key={employerId} style={{ marginBottom: 16 }}>
      <h4 style={{ marginBottom: 8 }}>
        {employerId === UNMATCHED_EMPLOYER ? t('尚未配對', lang) : employerLabel(employers, employerId, lang)}
        <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>（{group.length}）</span>
      </h4>
      <div className="card" style={{ overflowX: 'auto' }}>
        <div className="table-wrap"><table>
          <thead>
            <tr>
              <th>{t('姓名', lang)}</th><th>{t('越文姓名', lang)}</th><th>{t('性別', lang)}</th>
              <th>{t('省份', lang)}</th><th>{t('簽證辦理日期', lang)}</th><th>{t('簽證領取日期', lang)}</th><th>{t('簽證文號', lang)}</th>
              <th>{t('台灣電話號碼', lang)}</th>{canEditPage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ worker: w }) => (
              <tr key={w.id}>
                <td style={{ fontWeight: 600 }}>{w.name}</td>
                <td>{w.vietnameseName || '—'}</td>
                <td>{t(w.gender, lang) || '—'}</td>
                <td>{w.province || '—'}</td>
                <td>
                  {canEditPage ? (
                    <input type="date" value={w.visaProcessDate || ''} onChange={(e) => onField(w, 'visaProcessDate', e.target.value)} />
                  ) : (w.visaProcessDate || '—')}
                </td>
                <td>
                  {canEditPage ? (
                    <input type="date" value={w.visaPickupDate || ''} onChange={(e) => onField(w, 'visaPickupDate', e.target.value)} />
                  ) : (w.visaPickupDate || '—')}
                </td>
                <td>
                  {canEditPage ? (
                    <DigitsInput value={w.visaDocNumber} onChange={(v) => onField(w, 'visaDocNumber', v)} style={{ width: 120 }} />
                  ) : (w.visaDocNumber || '—')}
                </td>
                <td>
                  {canEditPage ? (
                    <DigitsInput value={w.taiwanPhone} onChange={(v) => onField(w, 'taiwanPhone', v)} style={{ width: 120 }} />
                  ) : (w.taiwanPhone || '—')}
                </td>
                {canEditPage && (
                  <td className="row-actions">
                    <button className="primary" disabled={!w.visaDocNumber} title={!w.visaDocNumber ? t('需先填入簽證文號才能按完成', lang) : ''} onClick={() => onComplete(w, employerId)}>{t('完成', lang)}</button>
                    <button onClick={() => onBack(w, employerId)}>{t('返回', lang)}</button>
                    <button className="danger" onClick={() => onRemove(w, employerId)}>{t('刪除', lang)}</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

// 名單來源：某一筆配對（移工×雇主）在文件追蹤標記「完成」
// (docsCompletedMap) 的，自動出現在這裡辦簽證；填好辦理/領取日期後按
// 「完成」(visaCompletedMap)，那一筆會從這份名單消失，接著自動出現在
// 「出境辦理」頁面——完成/刪除都只影響那一筆配對，同一個移工配對多個
// 雇主時不會互相連動。先依仲介分組，仲介底下再依雇主分組（未配對的
// 歸一組，排最後），跟移工管理的分組邏輯一致；同一移工配對多個雇主就
// 依雇主各自顯示一行。
export default function VisaProcessingPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'visaProcessing', role, overrides);
  const { rows: workers, loading, update } = useCollection('laborAgency_workers');
  const { rows: employers } = useCollection('laborAgency_employers');

  const employerOf = (id) => employers.find((e) => e.id === id);
  const rows = workers
    .flatMap((w) => {
      const ids = workerEmployerIds(w);
      return ids.length ? ids.map((employerId) => ({ worker: w, employerId })) : [{ worker: w, employerId: null }];
    })
    .filter((r) => getPairFlag(r.worker, 'docsCompletedMap', r.employerId)
      && !getPairFlag(r.worker, 'visaCompletedMap', r.employerId)
      && !getPairFlag(r.worker, 'visaListRemovedMap', r.employerId));

  const sortedEmployerIds = [...new Set(rows.map((r) => r.employerId).filter(Boolean))]
    .sort((a, b) => {
      const ea = employerOf(a); const eb = employerOf(b);
      return (ea?.agencyName || '').localeCompare(eb?.agencyName || '') || employerLabel(employers, a, lang).localeCompare(employerLabel(employers, b, lang));
    });
  const employerGroupKeys = [...sortedEmployerIds, UNMATCHED_EMPLOYER];

  const agencyOrder = [];
  employerGroupKeys.forEach((employerId) => {
    const agencyKey = employerId === UNMATCHED_EMPLOYER ? UNSET_AGENCY : (employerOf(employerId)?.agencyName || UNSET_AGENCY);
    if (!agencyOrder.includes(agencyKey)) agencyOrder.push(agencyKey);
  });

  async function handleField(w, key, value) {
    await update(w.id, { [key]: value });
  }
  // 完成：要求先填入簽證文號才能按——沒有簽證文號代表簽證還沒真的辦
  // 下來，不該進入下一關「出境辦理」。
  async function handleComplete(w, employerId) {
    if (!w.visaDocNumber) return;
    await update(w.id, { visaCompletedMap: withPairFlag(w, 'visaCompletedMap', employerId, true) });
  }
  // 刪除：只從「辦理簽證」這份名單移除那一筆配對，不影響移工本身的
  // 資料，也不影響其他頁面——用 visaListRemovedMap 這個頁面專屬、依
  // 配對獨立的隱藏旗標。
  async function handleRemove(w, employerId) {
    await update(w.id, { visaListRemovedMap: withPairFlag(w, 'visaListRemovedMap', employerId, true) });
  }
  // 返回：取消「文件追蹤」對那一筆配對標記的已完成，讓它從這份名單消失、
  // 重新出現在「文件追蹤」頁面——只影響那一筆配對。
  async function handleBack(w, employerId) {
    await update(w.id, { docsCompletedMap: withPairFlag(w, 'docsCompletedMap', employerId, false) });
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('辦理簽證', lang)}</h2>
          <div className="page-desc">{t('自動列出文件已收齊完成的移工，填寫簽證辦理日期、領取日期；完成後進入下一關「出境辦理」', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        rows.length === 0 ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>{t('目前沒有待辦理簽證的名單', lang)}</p></div>
        ) : agencyOrder.map((agencyKey) => {
          const employerIdsInAgency = employerGroupKeys.filter((employerId) => {
            const key = employerId === UNMATCHED_EMPLOYER ? UNSET_AGENCY : (employerOf(employerId)?.agencyName || UNSET_AGENCY);
            return key === agencyKey;
          });
          const count = rows.filter((r) => employerIdsInAgency.includes(r.employerId || UNMATCHED_EMPLOYER)).length;
          if (count === 0) return null;
          return (
            <div key={agencyKey} style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 10 }}>
                {agencyKey === UNSET_AGENCY ? t('未填仲介名稱', lang) : agencyKey}
                <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>（{count}）</span>
              </h3>
              {employerIdsInAgency.map((employerId) => (
                <EmployerTable
                  key={employerId}
                  employerId={employerId}
                  rows={rows}
                  employers={employers}
                  lang={lang}
                  canEditPage={canEditPage}
                  onField={handleField}
                  onComplete={handleComplete}
                  onBack={handleBack}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
