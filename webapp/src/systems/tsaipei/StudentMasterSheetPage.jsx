import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { exportEntityCSV } from '../../lib/csv';
import { studentDaysInTaiwanForMonth, studentProjectClientPair, currentMonthStr } from '../../lib/bonus';

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}
function effectiveEntryDate(s) { return s.secondEntryDate || s.firstEntryDate || ''; }
function effectiveExitDate(s) { return s.secondExitDate || s.firstExitDate || ''; }

// Ported from buildStudentMasterRows/renderStudentMasterSheet in
// apps-script/Index.html — a month-based rollup of every student's
// client/project/passport/gender/entry-exit/billing info.
export default function StudentMasterSheetPage() {
  useOutletContext();
  const { rows: students, loading } = useCollection('tsaipei_students');
  const { rows: matches } = useCollection('tsaipei_matches');
  const { rows: admittedList } = useCollection('tsaipei_admittedList');
  const { rows: positions } = useCollection('tsaipei_positions');
  const { rows: inTaiwanVisaRecords } = useCollection('tsaipei_inTaiwanVisa');
  const { rows: clientFeeSetupRecords } = useCollection('tsaipei_clientFeeSetup');
  const [month, setMonth] = useState(currentMonthStr());
  const [q, setQ] = useState('');

  const ctx = { matches, admittedList, positions };
  const rows = students.map((s) => {
    const pair = studentProjectClientPair(s.id, ctx);
    const rate = pair ? clientFeeSetupRecords.find((r) => (r.projectCode || '') === pair.projectCode && r.client === pair.client) : null;
    return {
      student: s,
      client: pair ? pair.client : '',
      projectCode: pair ? pair.projectCode : '',
      workDays: studentDaysInTaiwanForMonth(s.id, month, inTaiwanVisaRecords),
      billingStartDate: rate ? (rate.billingStartDate || '') : '',
      billingSettleDay: rate ? (rate.billingSettleDay || '') : '',
      billDormFee: rate ? (rate.billDormFee !== '否' ? '是' : '否') : '',
    };
  });

  const query = q.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (!query) return true;
    const text = `${studentFullLabel(r.student)} ${r.client} ${r.projectCode}`.toLowerCase();
    return text.includes(query);
  });

  function handleDownload() {
    const exportRows = filtered.map((r) => ({
      client: r.client, projectCode: r.projectCode, name: studentFullLabel(r.student), passportNumber: r.student.passportNumber || '',
      gender: r.student.gender || '', entryDate: effectiveEntryDate(r.student), exitDate: effectiveExitDate(r.student),
      workDays: r.workDays, billingStartDate: r.billingStartDate, billingSettleDay: r.billingSettleDay, billDormFee: r.billDormFee,
    }));
    exportEntityCSV(exportRows, [
      { key: 'client', label: '廠商' }, { key: 'projectCode', label: '專案類別' }, { key: 'name', label: '姓名' },
      { key: 'passportNumber', label: '護照' }, { key: 'gender', label: '性別' }, { key: 'entryDate', label: '入境日' },
      { key: 'exitDate', label: '離境日' }, { key: 'workDays', label: '當月在職天數' }, { key: 'billingStartDate', label: '計費起算日' },
      { key: 'billingSettleDay', label: '請款結算日' }, { key: 'billDormFee', label: '是否請款住宿費' },
    ], `學生資料總檔_${month}`);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>學生資料總檔</h2>
        <button onClick={handleDownload}>下載此月份資料</button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>依月份彙整所有學生的廠商、專案、證件與計費資訊。</p>
      <div className="row-actions" style={{ marginBottom: 16 }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <input placeholder="搜尋學生、廠商或專案編號" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead>
              <tr>
                <th>廠商</th><th>專案類別</th><th>姓名</th><th>護照</th><th>性別</th><th>入境日</th><th>離境日</th>
                <th>當月在職天數</th><th>計費起算日</th><th>請款結算日</th><th>是否請款住宿費</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.student.id}>
                  <td>{r.client || '—'}</td>
                  <td>{r.projectCode || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{studentFullLabel(r.student)}</td>
                  <td>{r.student.passportNumber || '—'}</td>
                  <td>{r.student.gender || '—'}</td>
                  <td>{effectiveEntryDate(r.student) || '—'}</td>
                  <td>{effectiveExitDate(r.student) || '—'}</td>
                  <td>{r.workDays}</td>
                  <td>{r.billingStartDate || '—'}</td>
                  <td>{r.billingSettleDay || '—'}</td>
                  <td>{r.billDormFee || '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={11} className="muted">{query ? '沒有符合搜尋條件的學生。' : '目前沒有學生資料。'}</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
