import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { exportEntityCSV } from '../../lib/csv';
import { studentDaysInTaiwanForMonth, studentProjectClientPair, currentMonthStr } from '../../lib/bonus';
import { vietnamInTaiwanVisaShim } from '../../lib/vietnamTsaipeiStudentSync';
import { t } from '../../lib/i18n';

function studentFullLabel(s) {
  if (!s) return '(已刪除)';
  if (s.chineseName && s.originalName) return `${s.chineseName}（${s.originalName}）`;
  return s.chineseName || s.originalName || '(未命名)';
}
// 入境/離境日期是「在台簽證追蹤」紀錄本身的欄位，不是學生資料
// (vietnam_students) 的欄位——這兩個學生資料從來沒有這兩個欄位可以讀
// （之前直接讀 s.firstEntryDate 等於永遠讀到 undefined），要傳這個學生
// 對應的簽證追蹤紀錄 v 進來，不是學生本身。
function effectiveEntryDate(v) { return v?.secondEntryDate || v?.firstEntryDate || ''; }
function effectiveExitDate(v) { return v?.secondExitDate || v?.firstExitDate || ''; }

// 複製自 systems/tsaipei/StudentMasterSheetPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function StudentMasterSheetPage() {
  const { lang } = useOutletContext();
  const { rows: students, loading } = useCollection('vietnam_students');
  const { rows: matches } = useCollection('vietnam_matches');
  const { rows: admittedList } = useCollection('vietnam_admittedList');
  const { rows: positions } = useCollection('vietnam_positions');
  // 實際入境/離境日期記在境外生系統「在台簽證追蹤」，不是越南系統自己的
  // vietnam_inTaiwanVisa（整個系統沒有任何地方會真的寫入這個 collection，
  // 一直是空的）——見 lib/vietnamTsaipeiStudentSync.js 的 vietnamInTaiwanVisaShim。
  const { rows: tsaipeiInTaiwanVisaRaw } = useCollection('tsaipei_inTaiwanVisa');
  const [month, setMonth] = useState(currentMonthStr());
  const [q, setQ] = useState('');

  const inTaiwanVisaRecords = vietnamInTaiwanVisaShim(students, tsaipeiInTaiwanVisaRaw);
  const ctx = { matches, admittedList, positions };
  const rows = students.map((s) => {
    const pair = studentProjectClientPair(s.id, ctx);
    return {
      student: s,
      visa: inTaiwanVisaRecords.find((v) => v.studentId === s.id),
      client: pair ? pair.client : '',
      projectCode: pair ? pair.projectCode : '',
      workDays: studentDaysInTaiwanForMonth(s.id, month, inTaiwanVisaRecords),
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
      gender: r.student.gender || '', entryDate: effectiveEntryDate(r.visa), exitDate: effectiveExitDate(r.visa),
      workDays: r.workDays,
    }));
    exportEntityCSV(exportRows, [
      { key: 'client', label: '廠商' }, { key: 'projectCode', label: '專案類別' }, { key: 'name', label: '姓名' },
      { key: 'passportNumber', label: '護照' }, { key: 'gender', label: '性別' }, { key: 'entryDate', label: '入境日' },
      { key: 'exitDate', label: '離境日' }, { key: 'workDays', label: '當月在職天數' },
    ], `學生資料總檔_${month}`);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('學生資料總檔', lang)}</h2>
          <div className="page-desc">{t('依月份彙整所有學生的廠商、專案與證件資訊', lang)}</div>
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
                <th>{t('當月在職天數', lang)}</th>
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
                  <td>{effectiveEntryDate(r.visa) || '—'}</td>
                  <td>{effectiveExitDate(r.visa) || '—'}</td>
                  <td>{r.workDays}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="muted">{query ? t('沒有符合搜尋條件的學生。', lang) : t('目前沒有學生資料。', lang)}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
