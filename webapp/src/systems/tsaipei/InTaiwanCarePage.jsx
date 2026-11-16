import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import Tag from '../../components/Tag';
import { CARE_TAG } from '../../lib/tags';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import {
  VISIT_METHODS, WORK_ITEMS, WORK_RATING_OPTIONS, LIFE_ITEMS, LIFE_RATING_OPTIONS,
  RESULT_OPTIONS, blankRatings, blankNotes, downloadMonthlyVisitRecord, visitRecordDocId,
} from '../../lib/monthlyVisitRecord';
import {
  AGENCY_OPTIONS, certificateLangFor, guessApprovalAgency, totalInternshipDays,
  TEMPLATE_FILE_BY_LANG, LANG_LABEL, downloadInternshipCertificate,
} from '../../lib/internshipCertificate';

const STATUSES = ['良好', '待關心', '預計離台'];
const CSV_FIELDS = [
  { key: 'id', label: 'ID' }, { key: 'studentId', label: '學生ID' }, { key: 'careDate', label: '關懷時間' },
  { key: 'content', label: '內容' }, { key: 'status', label: '狀態' }, { key: 'confirmedDeparture', label: '確認離台' },
];

// Ported from studentProjectCompanyKey/matchPositionLabel in apps-script/Index.html.
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
  return [p.projectCode, p.company, m.venue].filter(Boolean).join(' ') || '未指定客戶';
}

// 每月訪視紀錄表／實習證明書要用到的「實習企業/部門」「實習分店」，跟
// studentCompanyLabel 同一套比對邏輯，只是回傳完整物件/match。
function studentPosition(studentId, { matches, admittedList, positions }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  if (!m) return null;
  return positions.find((pp) => pp.id === m.positionId) || null;
}
function studentMatch(studentId, { matches, admittedList }) {
  const admitted = admittedList.find((a) => {
    const m = matches.find((mm) => mm.id === a.matchId);
    return m && m.studentId === studentId;
  });
  let m = admitted ? matches.find((mm) => mm.id === admitted.matchId) : null;
  if (!m) m = matches.find((x) => x.studentId === studentId);
  return m || null;
}

// 跟 DashboardPage 同一套「有第二次入台/離台就用第二次，否則用第一次」
// 判斷，實習證明書預設帶入這個區間。
function effectiveEntryDate(s) {
  return s?.secondEntryDate || s?.firstEntryDate || '';
}
function effectiveExitDate(s) {
  return s?.secondExitDate || s?.firstExitDate || '';
}

export default function InTaiwanCarePage() {
  const { system, role, overrides } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'inTaiwanCare', role, overrides);
  const { rows, loading, update, remove } = useCollection('tsaipei_inTaiwanCare');
  const { rows: students } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { rows: visitRecords, remove: removeVisit } = useCollection('tsaipei_monthlyVisitRecords');
  const { rows: applicationProgress } = useCollection('tsaipei_applicationProgress');
  const [editing, setEditing] = useState(null);
  const [visiting, setVisiting] = useState(null); // studentId managing monthly visit records for, or null
  const [generatingCert, setGeneratingCert] = useState(null); // studentId generating a certificate for, or null
  const [showDeparted, setShowDeparted] = useState(false);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('tsaipei_inTaiwanCare', CSV_FIELDS, { entityLabel: '在台關懷紀錄', requiredKeys: ['studentId'], canEdit: canEditPage });

  const ctx = { matches, admittedList, positions };
  const studentName = (id) => { const s = students.find((x) => x.id === id); return s?.chineseName || s?.originalName || '(未知)'; };
  const searchQuery = q.trim().toLowerCase();
  const visible = rows.filter((r) => (showDeparted || r.confirmedDeparture !== true) && (!searchQuery || `${studentName(r.studentId)} ${studentCompanyLabel(r.studentId, ctx)}`.toLowerCase().includes(searchQuery)));

  // 依專案編號＋客戶分類，跟原本 renderInTaiwanCare 一致。
  const byCompany = {};
  visible.forEach((r) => {
    const company = studentCompanyLabel(r.studentId, ctx);
    (byCompany[company] ||= []).push(r);
  });
  const companies = Object.keys(byCompany).sort((a, b) => a.localeCompare(b));

  async function handleSave(data) {
    const { id, ...rest } = data;
    await update(id, rest);
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>在台關懷紀錄</h2>
          <div className="page-desc">依專案編號＋客戶分類，記錄學生在台期間的關懷追蹤（在台簽證追蹤建立後自動加入；確認離台後自動移除）；每位學生另有「每月訪視紀錄」可按月填寫訪視內容並下載紀錄表、「產生證明書」可下載實習證明書{!canEditPage && '（唯讀）'}</div>
        </div>
        <div className="row-actions">
          <label className="muted"><input type="checkbox" checked={showDeparted} onChange={(e) => setShowDeparted(e.target.checked)} /> 顯示已確認離台</label>
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯（保留「學生ID」欄位）；上傳後會完全取代目前所有在台關懷紀錄，請先下載備份再匯入。</p>}
      <input placeholder="搜尋學生或客戶" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">載入中…</p> : (
        companies.length === 0 ? <p className="muted">尚無在台關懷紀錄。</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {companies.map((company) => (
              <div className="card" key={company}>
                <h3 style={{ marginTop: 0 }}>{company} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{byCompany[company].length} 筆紀錄</span></h3>
                <div className="table-wrap sticky-header">
                  <table>
                    <thead><tr><th>學生</th><th>關懷時間</th><th>內容</th><th>狀態</th><th>確認離台</th>{canEditPage && <th></th>}</tr></thead>
                    <tbody>
                      {byCompany[company].map((r) => (
                        <tr key={r.id}>
                          <td>{studentName(r.studentId)}</td>
                          <td>{r.careDate || '—'}</td>
                          <td>{r.content || '—'}</td>
                          <td><Tag value={r.status} map={CARE_TAG} /></td>
                          <td>
                            {canEditPage ? (
                              <input type="checkbox" checked={!!r.confirmedDeparture} onChange={(e) => update(r.id, { confirmedDeparture: e.target.checked })} />
                            ) : (r.confirmedDeparture ? '是' : '否')}
                          </td>
                          {canEditPage && (
                            <td>
                              <div className="row-actions">
                                <button onClick={() => setEditing(r)}>編輯</button>
                                <button onClick={() => setVisiting(r.studentId)}>每月訪視紀錄</button>
                                <button onClick={() => setGeneratingCert(r.studentId)}>產生證明書</button>
                                <button className="danger" onClick={() => remove(r.id)}>刪除</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
      )}
      {editing && <CareFormModal initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
      {visiting && (
        <MonthlyVisitModal
          student={students.find((s) => s.id === visiting)}
          studentLabel={studentName(visiting)}
          position={studentPosition(visiting, ctx)}
          match={studentMatch(visiting, ctx)}
          records={visitRecords.filter((r) => r.studentId === visiting)}
          onRemove={removeVisit}
          onClose={() => setVisiting(null)}
        />
      )}
      {generatingCert && (
        <CertificateGeneratorModal
          student={students.find((s) => s.id === generatingCert)}
          studentLabel={studentName(generatingCert)}
          position={studentPosition(generatingCert, ctx)}
          progress={applicationProgress.find((r) => r.studentId === generatingCert) || null}
          onClose={() => setGeneratingCert(null)}
        />
      )}
    </div>
  );
}

function CareFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>編輯在台關懷紀錄</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>
              關懷時間
              <input type="date" value={form.careDate || ''} onChange={(e) => setForm({ ...form, careDate: e.target.value })} />
            </label>
            <label>
              狀態
              <select value={form.status || '良好'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              內容
              <input value={form.content || ''} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            </label>
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
function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function blankVisitForm() {
  return {
    visitDate: '', visitMethod: '', visitPersonnel: '',
    workRatings: blankRatings(WORK_ITEMS), workNotes: blankNotes(WORK_ITEMS),
    lifeRatings: blankRatings(LIFE_ITEMS), lifeNotes: blankNotes(LIFE_ITEMS),
    managerComment: '', studentComment: '',
    monthlyWorkDone: '', monthlyLearning: '', difficulties: '', nextMonthGoals: '',
    result: [], resultOther: '',
  };
}

function RatingTable({ title, items, options, group, notesGroup, values, notes, onRate, onNote }) {
  return (
    <div className="table-wrap" style={{ marginBottom: 12 }}>
      <table>
        <thead><tr><th>{title}</th>{options.map((o) => <th key={o}>{o}</th>)}<th>備註</th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item}>
              <td>{item}</td>
              {options.map((o) => (
                <td key={o}>
                  <input type="radio" name={`${group}-${item}`} checked={values[item] === o} onChange={() => onRate(group, item, o)} />
                </td>
              ))}
              <td><input value={notes[item] || ''} onChange={(e) => onNote(notesGroup, item, e.target.value)} style={{ width: 140 }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 每月訪視紀錄表：學生姓名/護照號碼/國籍/實習企業/分店/部門這些「跟月份
// 無關」的基本資料每次都直接讀目前的學生/實習單位資料（不逐月存一份），
// 切換月份只影響訪視內容本身；該月已經存過紀錄就帶入既有內容，沒有就是
// 空白表單，訪視日期預設今天。
function MonthlyVisitModal({ student, studentLabel, position, match, records, onRemove, onClose }) {
  const header = {
    studentName: studentLabel,
    passportNumber: student?.passportNumber || '',
    nationality: student?.nationality || '',
    company: position?.company || '',
    venue: match?.venue || '',
    department: position?.title || '',
  };
  const existingMonths = records.map((r) => r.month).sort().reverse();

  const [month, setMonth] = useState(currentMonthStr());
  const [form, setForm] = useState(() => records.find((r) => r.month === month) || { ...blankVisitForm(), visitDate: new Date().toISOString().slice(0, 10) });
  const [loadedMonth, setLoadedMonth] = useState(month);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [gettingLinks, setGettingLinks] = useState(false);
  const [copyHint, setCopyHint] = useState('');

  if (month !== loadedMonth) {
    const existing = records.find((r) => r.month === month);
    setForm(existing || { ...blankVisitForm(), visitDate: new Date().toISOString().slice(0, 10) });
    setLoadedMonth(month);
  }

  const existing = records.find((r) => r.month === month);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setRating(group, item, value) {
    setForm((f) => ({ ...f, [group]: { ...f[group], [item]: value } }));
  }
  function setNote(group, item, value) {
    setForm((f) => ({ ...f, [group]: { ...f[group], [item]: value } }));
  }
  function toggleResult(option) {
    setForm((f) => ({ ...f, result: f.result.includes(option) ? f.result.filter((o) => o !== option) : [...f.result, option] }));
  }

  // 文件 ID 固定是「學生ID_月份」（見 lib/monthlyVisitRecord.js 的
  // visitRecordDocId），不用亂數 ID，讓學生/企業主管的線上填寫連結可以
  // 只靠這兩個資訊直接存取到對應那一筆。每次儲存都一併帶入目前的學生/
  // 實習單位基本資料快照，公開填寫頁面才不用另外查 tsaipei_students/
  // tsaipei_positions（這兩個集合不開放公開讀取）。
  async function handleSave() {
    setSaving(true);
    try {
      const { id: _id, studentId: _studentId, ...rest } = form;
      await setDoc(doc(db, 'tsaipei_monthlyVisitRecords', visitRecordDocId(student.id, month)), { studentId: student.id, month, ...header, ...rest }, { merge: true });
    } catch (err) {
      alert(`儲存失敗：${err.message || err}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadMonthlyVisitRecord(`${studentLabel}_${month}_每月訪視紀錄表.docx`, { ...header, ...form });
    } catch (err) {
      alert(`產生失敗：${err.message || err}`);
    } finally {
      setDownloading(false);
    }
  }

  async function handleRemove() {
    if (!existing) return;
    if (!window.confirm(`確定要刪除 ${month} 這筆訪視紀錄嗎？`)) return;
    await onRemove(existing.id);
    setForm({ ...blankVisitForm(), visitDate: new Date().toISOString().slice(0, 10) });
  }

  // 連結需要先確保這個月的紀錄已經存在（公開填寫頁面只能「更新」既有
  // 文件，不能自己新建，避免開放公開新增文件），所以按「取得填寫連結」
  // 會先存檔一次目前畫面上的內容，再組出連結。
  async function handleGetLinks() {
    setGettingLinks(true);
    try {
      await handleSave();
    } finally {
      setGettingLinks(false);
    }
  }

  async function handleCopy(url, label) {
    try {
      await navigator.clipboard.writeText(url);
      setCopyHint(`已複製${label}連結`);
    } catch {
      setCopyHint(`複製失敗，請手動選取上面的連結文字`);
    }
  }

  const studentLink = `${window.location.origin}/apply/visitRecord/${student?.id}/${month}/student`;
  const managerLink = `${window.location.origin}/apply/visitRecord/${student?.id}/${month}/manager`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 760 }}>
        <h3 style={{ marginTop: 0 }}>{studentLabel} · 每月訪視紀錄</h3>
        <p className="muted">國籍/護照號碼/實習企業/分店/部門直接讀取目前的學生與實習單位資料，自動帶入；已有紀錄的月份：{existingMonths.length ? existingMonths.join('、') : '（無）'}</p>
        <div className="row-actions" style={{ marginBottom: 12 }}>
          <label>
            月份
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          {existing && <span className="tag tag-blue">這個月已有紀錄</span>}
        </div>
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <label>學生姓名<input value={header.studentName} disabled /></label>
          <label>護照號碼<input value={header.passportNumber} disabled /></label>
          <label>國籍<input value={header.nationality} disabled /></label>
          <label>實習企業<input value={header.company} disabled /></label>
          <label>實習分店<input value={header.venue} disabled /></label>
          <label>實習部門<input value={header.department} disabled /></label>
          <label>
            訪視日期
            <input type="date" value={form.visitDate} onChange={(e) => setField('visitDate', e.target.value)} />
          </label>
          <label>
            訪視方式
            <select value={form.visitMethod} onChange={(e) => setField('visitMethod', e.target.value)}>
              <option value="">（未選擇）</option>
              {VISIT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label>
            訪視人員
            <input value={form.visitPersonnel} onChange={(e) => setField('visitPersonnel', e.target.value)} />
          </label>
        </div>

        <h4>實習狀況</h4>
        <RatingTable title="訪視項目" items={WORK_ITEMS} options={WORK_RATING_OPTIONS} group="workRatings" notesGroup="workNotes" values={form.workRatings} notes={form.workNotes} onRate={setRating} onNote={setNote} />
        <label>企業主管意見<textarea rows={2} value={form.managerComment} onChange={(e) => setField('managerComment', e.target.value)} style={{ width: '100%' }} /></label>

        <h4>生活適應情況</h4>
        <RatingTable title="訪視項目" items={LIFE_ITEMS} options={LIFE_RATING_OPTIONS} group="lifeRatings" notesGroup="lifeNotes" values={form.lifeRatings} notes={form.lifeNotes} onRate={setRating} onNote={setNote} />
        <label>學生意見<textarea rows={2} value={form.studentComment} onChange={(e) => setField('studentComment', e.target.value)} style={{ width: '100%' }} /></label>

        <h4>本月學習成果</h4>
        <div className="form-grid">
          <label style={{ gridColumn: '1 / -1' }}>本月完成之工作內容<textarea rows={2} value={form.monthlyWorkDone} onChange={(e) => setField('monthlyWorkDone', e.target.value)} style={{ width: '100%' }} /></label>
          <label style={{ gridColumn: '1 / -1' }}>本月學習收穫<textarea rows={2} value={form.monthlyLearning} onChange={(e) => setField('monthlyLearning', e.target.value)} style={{ width: '100%' }} /></label>
          <label style={{ gridColumn: '1 / -1' }}>遇到之困難<textarea rows={2} value={form.difficulties} onChange={(e) => setField('difficulties', e.target.value)} style={{ width: '100%' }} /></label>
          <label style={{ gridColumn: '1 / -1' }}>下月學習目標<textarea rows={2} value={form.nextMonthGoals} onChange={(e) => setField('nextMonthGoals', e.target.value)} style={{ width: '100%' }} /></label>
        </div>

        <h4>訪視結果</h4>
        <div style={{ marginBottom: 12 }}>
          {RESULT_OPTIONS.map((o) => (
            <label key={o} style={{ display: 'block' }}>
              <input type="checkbox" checked={form.result.includes(o)} onChange={() => toggleResult(o)} /> {o}
              {o === '其他' && form.result.includes('其他') && (
                <input value={form.resultOther} onChange={(e) => setField('resultOther', e.target.value)} style={{ marginLeft: 8, width: 240 }} />
              )}
            </label>
          ))}
        </div>

        <h4>線上填寫連結</h4>
        <p className="muted">按下去會先存檔目前畫面上的內容，才能讓對方打開連結看得到資料；學生只能改「生活適應情況」評核表跟自己的意見，企業主管只能改「實習狀況」評核表跟主管意見，其餘欄位對方改不了。連結不用登入，知道連結的人就看得到這份紀錄的全部內容，請透過私訊/email 等方式一對一傳送，不要公開張貼。</p>
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <label>
            學生填寫連結
            <div className="row-actions">
              <input readOnly value={studentLink} onFocus={(e) => e.target.select()} style={{ flex: 1 }} />
              <button type="button" onClick={() => handleCopy(studentLink, '學生')}>複製</button>
            </div>
          </label>
          <label>
            企業主管填寫連結
            <div className="row-actions">
              <input readOnly value={managerLink} onFocus={(e) => e.target.select()} style={{ flex: 1 }} />
              <button type="button" onClick={() => handleCopy(managerLink, '企業主管')}>複製</button>
            </div>
          </label>
        </div>
        <div className="row-actions" style={{ marginBottom: 12 }}>
          <button type="button" onClick={handleGetLinks} disabled={gettingLinks}>{gettingLinks ? '存檔中…' : existing ? '更新連結內容' : '儲存並啟用連結'}</button>
          {copyHint && <span className="muted">{copyHint}</span>}
        </div>

        <div className="row-actions" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <div className="row-actions">
            {existing && <button className="danger" onClick={handleRemove}>刪除這個月的紀錄</button>}
          </div>
          <div className="row-actions">
            <button className="primary" onClick={handleSave} disabled={saving}>{saving ? '儲存中…' : '儲存'}</button>
            <button onClick={handleDownload} disabled={downloading}>{downloading ? '產生中…' : '下載本月紀錄表'}</button>
            <button onClick={onClose}>關閉</button>
          </div>
        </div>
      </div>
    </div>
  );
}


// 實習證明書產生器：國籍決定要用哪個語言版本（越南/印尼各自有專屬範本，
// 其餘國籍統一用英文版），其餘欄位從學生資料/實習單位/申辦進度追蹤自動
// 帶入，沒有資料的欄位留空，產生出來的證明書會用底線標示方便補填。
function CertificateGeneratorModal({ student, studentLabel, position, progress, onClose }) {
  const [form, setForm] = useState(() => ({
    nationality: student?.nationality || '',
    studentNameEn: student?.originalName || '',
    passportNumber: student?.passportNumber || '',
    agency: guessApprovalAgency(position?.industry),
    approvalDate: progress?.ministryReviewDate || '',
    letterNo: position?.letterNo || '',
    startDate: effectiveEntryDate(student),
    endDate: effectiveExitDate(student),
    hotelName: position?.company || '',
    department: position?.title || '',
    issuingAuthority: position?.company || '',
  }));
  const [lang, setLang] = useState(certificateLangFor(student?.nationality));
  const [downloading, setDownloading] = useState(false);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const totalDays = totalInternshipDays(form.startDate, form.endDate);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadInternshipCertificate(`${studentLabel}_實習證明書_${LANG_LABEL[lang]}.docx`, lang, { ...form, totalDays });
    } catch (err) {
      alert(`產生失敗：${err.message || err}`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 640 }}>
        <h3 style={{ marginTop: 0 }}>{studentLabel} · 產生實習證明書</h3>
        <p className="muted">欄位已盡量從學生資料/實習單位/申辦進度追蹤自動帶入，請核對後再下載；核准函日期/文號若還沒登記，要自己補上。</p>
        <div className="form-grid">
          <label>
            證明書語言版本
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              {Object.keys(LANG_LABEL).map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
            </select>
          </label>
          <label>
            國籍
            <input value={form.nationality} onChange={(e) => setField('nationality', e.target.value)} />
          </label>
          <label>
            英文姓名(護照姓名)
            <input value={form.studentNameEn} onChange={(e) => setField('studentNameEn', e.target.value)} />
          </label>
          <label>
            護照號碼
            <input value={form.passportNumber} onChange={(e) => setField('passportNumber', e.target.value)} />
          </label>
          <label>
            核准機關
            <select value={form.agency} onChange={(e) => setField('agency', e.target.value)}>
              {AGENCY_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label>
            核准函日期
            <input type="date" value={form.approvalDate} onChange={(e) => setField('approvalDate', e.target.value)} />
          </label>
          <label>
            核准函文號
            <input value={form.letterNo} onChange={(e) => setField('letterNo', e.target.value)} />
          </label>
          <label>
            實習起日
            <input type="date" value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} />
          </label>
          <label>
            實習迄日
            <input type="date" value={form.endDate} onChange={(e) => setField('endDate', e.target.value)} />
          </label>
          <label>
            旅館/公司名稱
            <input value={form.hotelName} onChange={(e) => setField('hotelName', e.target.value)} />
          </label>
          <label>
            部門/職務
            <input value={form.department} onChange={(e) => setField('department', e.target.value)} />
          </label>
          <label>
            發證單位
            <input value={form.issuingAuthority} onChange={(e) => setField('issuingAuthority', e.target.value)} />
          </label>
        </div>
        <p className="muted">共計 {totalDays != null ? `${totalDays} 天` : '—(請填實習起訖日)'}</p>
        <div className="row-actions" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <a href={TEMPLATE_FILE_BY_LANG[lang]} target="_blank" rel="noreferrer">下載空白範例範本（{LANG_LABEL[lang]}）</a>
          <div className="row-actions">
            <button className="primary" onClick={handleDownload} disabled={downloading}>{downloading ? '產生中…' : '下載已帶入資料的證明書'}</button>
            <button onClick={onClose}>關閉</button>
          </div>
        </div>
      </div>
    </div>
  );
}
