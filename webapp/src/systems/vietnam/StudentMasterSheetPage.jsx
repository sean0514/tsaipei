import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { exportEntityCSV } from '../../lib/csv';
import { studentDaysInTaiwanForMonth, studentProjectClientPair, currentMonthStr } from '../../lib/bonus';
import { t } from '../../lib/i18n';

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}
function effectiveEntryDate(s) { return s.secondEntryDate || s.firstEntryDate || ''; }
function effectiveExitDate(s) { return s.secondExitDate || s.firstExitDate || ''; }

// 複製自 systems/tsaipei/StudentMasterSheetPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function StudentMasterSheetPage() {
  const { lang } = useOutletContext();
  const { rows: students, loading } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: positions } = useCollection('vietnam_positions');
  const { rows: inTaiwanVisaRecords } = useCollection('vietnam_inTaiwanVisa');
  const { rows: clientFeeSetupRecords } = useCollection('vietnam_clientFeeSetup');
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
        <div>
          <h2>{t('學生資料總檔', lang)}</h2>
          <div className="page-desc">{t('依月份彙整所有學生的廠商、專案、證件與計費資訊', lang)}</div>
        </div>
        <button onClick={handleDownload}>{t('下載此月份資料', lang)}</button>
      </div>
      <div className="row-actions" style={{ marginBottom: 16 }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <input placeholder={t('搜尋學生、廠商或專案編號', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>{t('廠商', lang)}</th><th>{t('專案類別', lang)}</th><th>{t('姓名', lang)}</th><th>{t('護照', lang)}</th><th>{t('性別', lang)}</th><th>{t('入境日', lang)}</th><th>{t('離境日', lang)}</th>
                <th>{t('當月在職天數', lang)}</th><th>{t('計費起算日', lang)}</th><th>{t('請款結算日', lang)}</th><th>{t('是否請款住宿費', lang)}</th>
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
              {filtered.length === 0 && <tr><td colSpan={11} className="muted">{query ? t('沒有符合搜尋條件的學生。', lang) : t('目前沒有學生資料。', lang)}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
