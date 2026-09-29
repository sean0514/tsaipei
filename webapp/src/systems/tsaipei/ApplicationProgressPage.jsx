import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { hasActiveHousingRecord } from '../../lib/housingRecords';

async function existsForStudent(collectionName, studentId) {
  const snap = await getDocs(query(collection(db, collectionName), where('studentId', '==', studentId)));
  return !snap.empty;
}

// 比照聿見國際申辦進度追蹤系統的模式：原本只有單一「目前進度」下拉選單，
// 改成每個關卡都各自有一個日期欄位（填了日期代表這關已完成）＋備註，跟
// 進度圖示一起顯示，才看得出每個關卡實際完成的時間點。
export const MILESTONES = [
  { key: 'admittedDate', label: '學生錄取' },
  { key: 'mouSchoolDate', label: 'MOU簽署-學校端用印' },
  { key: 'mouCompanyDate', label: 'MOU簽署-企業端用印' },
  { key: 'studentDocsDate', label: '收集學生資料' },
  { key: 'companyDocsDate', label: '收集企業資料' },
  { key: 'proposalDate', label: '撰寫計劃書' },
  { key: 'companySealDate', label: '企業用印' },
  { key: 'ministryReviewDate', label: '經濟部/交通部審核' },
  { key: 'sentAbroadDate', label: '發函後寄國外' },
  { key: 'visaDate', label: '辦理簽證' },
  { key: 'housingArrangedDate', label: '住宿安排' },
  { key: 'healthCheckDate', label: '預約體檢公司' },
  { key: 'arrivalDate', label: '入台' },
];

export function milestoneNoteKey(key) {
  return `${key}Note`;
}

// 依日期回推「目前進度」：抓最後一個已經到期（日期 <= 今天）的關卡；還沒有
// 任何關卡完成就回傳 null。跟 ProgressPipeline 用同一套判斷，未來/預約日期
// 不算已完成。
export function lastCompletedMilestone(r) {
  const today = new Date().toISOString().slice(0, 10);
  let last = null;
  MILESTONES.forEach((m) => { if (r?.[m.key] && r[m.key] <= today) last = m; });
  return last;
}

const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' },
  ...MILESTONES.flatMap((m) => [m, { key: milestoneNoteKey(m.key), label: `${m.label}備註` }]),
  { key: 'notes', label: '備註' }, { key: 'confirmedClosed', label: '結案' },
];

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}

// Ported from studentCompanyName/matchPositionLabel in apps-script/Index.html —
// used both as the group header and each row's position sub-label.
function studentCompanyLabel(studentId, { matches, admittedList, positions }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  if (!m) return '未指定客戶';
  const p = positions.find((pp) => pp.id === m.positionId);
  if (!p) return '未指定客戶';
  const parts = [p.projectCode, p.company, m.venue].filter(Boolean);
  return parts.join(' ') || '未指定客戶';
}

// 進度圖示：只保留「最近完成的一步」到「入台」之間的步驟；都還沒開始就整條
// 鏈完整顯示。如果先把日期填成未來的時間（預約/預計日期），時間還沒到之前
// 不算「已完成」，不會影響進度顯示。
export function ProgressPipeline({ p }) {
  const today = new Date().toISOString().slice(0, 10);
  let lastDoneIdx = -1;
  MILESTONES.forEach((m, i) => { if (p?.[m.key] && p[m.key] <= today) lastDoneIdx = i; });
  const visible = lastDoneIdx === -1 ? MILESTONES : MILESTONES.slice(lastDoneIdx);
  return (
    <div className="pipeline">
      {visible.map((m, i) => (
        <span key={m.key} className={`pip-step${lastDoneIdx !== -1 && i === 0 ? ' done' : ''}`}>{m.label}</span>
      ))}
    </div>
  );
}

export default function ApplicationProgressPage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'applicationProgress', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('tsaipei_applicationProgress');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_applicationProgress', CSV_FIELDS, { entityLabel: '申辦進度追蹤', requiredKeys: ['studentId'], canEdit: canEditPage });
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [checkingHousing, setCheckingHousing] = useState(false);

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);
  const searchQuery = q.trim().toLowerCase();

  // 按過「結案」的紀錄從清單消失（資料還在，下載完整資料時仍會包含）。
  const filteredRows = rows
    .filter((r) => !r.confirmedClosed)
    .filter((r) => !searchQuery || `${studentFullLabel(studentById(r.studentId))} ${studentCompanyLabel(r.studentId, ctx)}`.toLowerCase().includes(searchQuery));
  // 先分成已入台／未入台兩大類，再各自依客戶/專案分組（跟原本一致）；入台
  // 日期如果先填成未來的日期，時間還沒到之前仍算「未入台」。
  const today = new Date().toISOString().slice(0, 10);
  const arrived = filteredRows.filter((r) => r.arrivalDate && r.arrivalDate <= today);
  const notArrived = filteredRows.filter((r) => !(r.arrivalDate && r.arrivalDate <= today));

  function groupByCompany(items) {
    const byCompany = {};
    items.forEach((r) => {
      const company = studentCompanyLabel(r.studentId, ctx);
      (byCompany[company] ||= []).push(r);
    });
    return Object.keys(byCompany).sort((a, b) => a.localeCompare(b)).map((company) => ({
      company,
      items: byCompany[company].slice().sort((a, b) =>
        studentFullLabel(studentById(a.studentId)).localeCompare(studentFullLabel(studentById(b.studentId)))
      ),
    }));
  }

  // 「學生錄取」日期異動時，同步回寫到對應的錄取名單（tsaipei_admittedList）
  // 的「錄取日期」，兩邊看到的日期才會一致（透過媒合紀錄關聯，跟
  // studentCompanyLabel 找客戶資料同一套關聯方式）。
  async function syncAdmittedDate(studentId, admittedDate) {
    const match = matches.find((m) => m.studentId === studentId);
    if (!match) return;
    const admitted = admittedList.find((a) => a.matchId === match.id);
    if (!admitted || admitted.admitDate === admittedDate) return;
    await updateDoc(doc(db, 'tsaipei_admittedList', admitted.id), { admitDate: admittedDate });
  }

  // 「辦理簽證」日期第一次填入時就先建立住宿安排空白紀錄（未安排），讓宿舍
  // 安排提早準備，不用等到學生實際入台；「入台」日期第一次填入時自動建立
  // 在台簽證追蹤、在台關懷紀錄空白紀錄，跟原本 Apps Script 版的
  // ensureInTaiwanVisaForStudent 一致。住宿安排另外也會在「新增/更新在台簽證
  // 追蹤」那一步補建一次（見 InTaiwanVisaPage.jsx 的 afterVisaSave），兩處都用
  // existsForStudent/hasActiveHousingRecord 檢查避免重複建立。
  // 每個連動步驟各自包一層 try/catch：任何一步失敗（例如權限、網路問題）都
  // 只在主控台記錄、彈窗提醒，不會讓後面幾個獨立的連動步驟被跳過——之前
  // 寫成一串沒有隔開的 await，只要住宿安排那步丟出例外，後面在台簽證追蹤
  // 的建立就整個不會執行，畫面上完全看不出來（沒有任何錯誤訊息），跟「編輯
  // 進度紀錄存檔後，在台簽證追蹤卻沒有顯示」的回報症狀吻合。
  async function runCascadeStep(label, fn) {
    try {
      await fn();
    } catch (err) {
      console.error(`申辦進度追蹤：${label}失敗`, err);
      alert(`${label}失敗：${err.message || err}（其他項目仍會繼續處理，請稍後手動確認或使用「核對辦理簽證學生的住宿安排/簽證追蹤」按鈕補救）`);
    }
  }

  async function handleSave(data) {
    const prevVisaDate = editing?.visaDate || '';
    const prevArrivalDate = editing?.arrivalDate || '';
    const prevAdmittedDate = editing?.admittedDate || '';
    try {
      if (data.id) {
        const { id, ...rest } = data;
        await update(id, rest);
      } else {
        await add(data);
      }
    } catch (err) {
      alert(`存檔失敗：${err.message || err}`);
      return;
    }
    if ((data.admittedDate || '') !== prevAdmittedDate) {
      await runCascadeStep('同步錄取名單的錄取日期', () => syncAdmittedDate(data.studentId, data.admittedDate || ''));
    }
    if (data.visaDate && !prevVisaDate) {
      await runCascadeStep('建立住宿安排紀錄', async () => {
        if (!(await hasActiveHousingRecord(data.studentId))) {
          await addDoc(collection(db, 'tsaipei_housingRecords'), { studentId: data.studentId });
        }
      });
      // 進度到「辦理簽證」就先建立在台簽證追蹤空白紀錄，不用等到實際入台，
      // 讓在台簽證追蹤頁面提早看得到這位學生（見 InTaiwanVisaPage.jsx）。
      await runCascadeStep('建立在台簽證追蹤紀錄', async () => {
        if (!(await existsForStudent('tsaipei_inTaiwanVisa', data.studentId))) {
          await addDoc(collection(db, 'tsaipei_inTaiwanVisa'), { studentId: data.studentId });
        }
      });
    }
    if (data.arrivalDate && !prevArrivalDate) {
      await runCascadeStep('建立在台簽證追蹤紀錄', async () => {
        if (!(await existsForStudent('tsaipei_inTaiwanVisa', data.studentId))) {
          await addDoc(collection(db, 'tsaipei_inTaiwanVisa'), { studentId: data.studentId });
        }
      });
      await runCascadeStep('建立在台關懷紀錄', async () => {
        if (!(await existsForStudent('tsaipei_inTaiwanCare', data.studentId))) {
          await addDoc(collection(db, 'tsaipei_inTaiwanCare'), { studentId: data.studentId, status: '良好' });
        }
      });
    }
    setEditing(null);
  }

  // 補救用：把目前所有「辦理簽證」日期已填的學生都檢查一次，缺住宿安排紀錄、
  // 缺在台簽證追蹤紀錄的都補上。用來修正這兩個自動連動邏輯修好之前，就已經
  // 卡在辦理簽證但沒被補到的學生（例如當時該學生已有一筆「已完成」的舊住宿
  // 紀錄被誤判為已處理）。
  async function reconcileHousingForVisaStage() {
    setCheckingHousing(true);
    try {
      const visaRows = rows.filter((r) => r.visaDate);
      let housingFixed = 0;
      let visaTrackingFixed = 0;
      // 每位學生兩個檢查各自獨立 try/catch，其中一項失敗（例如某筆資料
      // 異常）不會連累其他學生或另一項檢查被中途跳過。
      for (const r of visaRows) {
        try {
          if (!(await hasActiveHousingRecord(r.studentId))) {
            await addDoc(collection(db, 'tsaipei_housingRecords'), { studentId: r.studentId });
            housingFixed++;
          }
        } catch (err) {
          console.error('核對住宿安排失敗:', r.studentId, err);
        }
        try {
          if (!(await existsForStudent('tsaipei_inTaiwanVisa', r.studentId))) {
            await addDoc(collection(db, 'tsaipei_inTaiwanVisa'), { studentId: r.studentId });
            visaTrackingFixed++;
          }
        } catch (err) {
          console.error('核對在台簽證追蹤失敗:', r.studentId, err);
        }
      }
      alert(`檢查完成：目前共 ${visaRows.length} 位學生已填入「辦理簽證」日期，其中補上了 ${housingFixed} 筆缺少的住宿安排紀錄、${visaTrackingFixed} 筆缺少的在台簽證追蹤紀錄。`);
    } finally {
      setCheckingHousing(false);
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>申辦進度追蹤</h2>
          <div className="page-desc">依客戶分類，追蹤每位學生從錄取到入台的整體申辦流程{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ 新增進度紀錄</button>}
          {canEditPage && (
            <button onClick={reconcileHousingForVisaStage} disabled={checkingHousing}>
              {checkingHousing ? '檢查中…' : '核對辦理簽證學生的住宿安排/簽證追蹤'}
            </button>
          )}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「學生ID」欄位）；上傳後會完全取代目前所有進度紀錄，請先下載備份再匯入。</p>}
      <input placeholder="搜尋學生或客戶" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        filteredRows.length === 0 ? <p className="muted">尚無進度紀錄。學生「確認錄取」後會自動建立，也可以點選「新增進度紀錄」手動加入。</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <ArrivalSection
              title="未入台"
              groups={groupByCompany(notArrived)}
              canEditPage={canEditPage}
              ctx={ctx}
              studentById={studentById}
              onEdit={setEditing}
              onRemove={remove}
              onClose={(id) => update(id, { confirmedClosed: true })}
            />
            <ArrivalSection
              title="已入台"
              groups={groupByCompany(arrived)}
              canEditPage={canEditPage}
              ctx={ctx}
              studentById={studentById}
              onEdit={setEditing}
              onRemove={remove}
              onClose={(id) => update(id, { confirmedClosed: true })}
            />
          </div>
        )
      )}
      {editing && (
        <ProgressFormModal
          initial={editing}
          students={students}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function ArrivalSection({ title, groups, canEditPage, ctx, studentById, onEdit, onRemove, onClose }) {
  const total = groups.reduce((sum, g) => sum + g.items.length, 0);
  return (
    <div>
      <h3 style={{ margin: '0 0 12px' }}>{title} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>共 {total} 位學生</span></h3>
      {groups.length === 0 ? (
        <p className="muted">目前沒有符合的學生。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groups.map(({ company, items }) => (
            <div className="card" key={company}>
              <h4 style={{ marginTop: 0 }}>{company} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{items.length} 位學生</span></h4>
              {items.map((r) => (
                <div key={r.id} className="progress-row">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{studentFullLabel(studentById(r.studentId))}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{studentCompanyLabel(r.studentId, ctx)}</div>
                    </div>
                    {canEditPage && (
                      <div className="row-actions">
                        <button onClick={() => onEdit(r)}>編輯</button>
                        <button className="danger" onClick={() => onRemove(r.id)}>刪除</button>
                        <button onClick={() => onClose(r.id)}>結案</button>
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <ProgressPipeline p={r} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressFormModal({ initial, students, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? '編輯進度紀錄' : '新增進度紀錄'}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <label>
            學生
            <select required disabled={!!initial.id} value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })} style={{ marginBottom: 16 }}>
              <option value="" disabled>請選擇學生</option>
              {students.map((s) => <option key={s.id} value={s.id}>{studentFullLabel(s)}</option>)}
            </select>
          </label>

          <h4 style={{ marginTop: 0 }}>申辦流程</h4>
          <div className="form-grid">
            {MILESTONES.map((m) => (
              <div key={m.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label>
                  {m.label}
                  <input type="date" value={form[m.key] || ''} onChange={(e) => setForm({ ...form, [m.key]: e.target.value })} />
                </label>
                <input placeholder="備註" value={form[milestoneNoteKey(m.key)] || ''} onChange={(e) => setForm({ ...form, [milestoneNoteKey(m.key)]: e.target.value })} />
              </div>
            ))}
          </div>

          <h4 style={{ marginTop: 20 }}>進度圖示</h4>
          <ProgressPipeline p={form} />

          <label>
            備註
            <textarea rows={3} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ marginTop: 16, marginBottom: 16 }} />
          </label>
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
