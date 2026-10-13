import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { exportEntityCSV } from '../../lib/csv';
import { ALLOWED_SOURCE_SUPPLIERS, studentFullLabel, studentCompanyLabel, groupByLabel } from '../../lib/tsaipeiSourceFilter';
import { t } from '../../lib/i18n';

const ARRIVAL_EXTRA_FIELDS = [
  { key: 'healthCheckDate', label: '體檢日期' },
  { key: 'healthCheckCompany', label: '體檢公司' },
  { key: 'dispatchLocation', label: '體檢公司送達地' },
  { key: 'dispatchDate', label: '送工日期' },
  { key: 'workDispatchLocation', label: '送工地點' },
];

const DEPARTURE_EXTRA_FIELDS = [
  { key: 'airline', label: '航空公司' },
  { key: 'flightNumber', label: '航班編號' },
  { key: 'terminal', label: '航廈' },
  { key: 'flightTime', label: '班機時間' },
  { key: 'ticketFee', label: '機票費用' },
  { key: 'payer', label: '付款人' },
];

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function daysBetween(dateStr, today) {
  return Math.abs((new Date(dateStr) - new Date(today)) / 86400000);
}

// 唯讀：改成顯示境外生實習系統（tsaipei_inTaiwanVisa）的資料，只篩選學生
// 來源(國外供應商)是 ALLOWED_SOURCE_SUPPLIERS 這幾個的紀錄；這個分頁在
// 元凱系統不能編輯，實際編輯請到境外生實習系統的「預計入台/離台」或
// 「在台簽證追蹤」頁面。依客戶（學生所媒合的實習單位）分組顯示。
export default function ExpectedArrivalPage() {
  const { lang } = useOutletContext();
  const { rows: students, loading: loadingStudents } = useCollection('tsaipei_students');
  const { rows: matches, loading: loadingMatches } = useCollection('tsaipei_matches');
  const { rows: admittedList, loading: loadingAdmitted } = useCollection('tsaipei_admittedList');
  const { rows: positions, loading: loadingPositions } = useCollection('tsaipei_positions');
  const { rows: visaRecords, loading: loadingVisa } = useCollection('tsaipei_inTaiwanVisa');
  const loading = loadingStudents || loadingMatches || loadingAdmitted || loadingPositions || loadingVisa;
  const [reportMonth, setReportMonth] = useState(currentMonthStr());

  const ctx = { matches, admittedList, positions };
  const studentById = (id) => students.find((s) => s.id === id);
  const today = new Date().toISOString().slice(0, 10);

  const allowedVisaRecords = visaRecords.filter((v) => ALLOWED_SOURCE_SUPPLIERS.includes(studentById(v.studentId)?.sourceSupplier));

  const arrivals = [];
  const departures = [];
  allowedVisaRecords.forEach((v) => {
    if (v.firstEntryDate && daysBetween(v.firstEntryDate, today) <= 30) arrivals.push({ v, date: v.firstEntryDate, label: t('第一次入境', lang) });
    if (v.secondEntryDate && daysBetween(v.secondEntryDate, today) <= 30) arrivals.push({ v, date: v.secondEntryDate, label: t('第二次入境', lang) });
    if (v.firstExitDate && daysBetween(v.firstExitDate, today) <= 30) departures.push({ v, date: v.firstExitDate, label: t('第一次離境', lang) });
    if (v.secondExitDate && daysBetween(v.secondExitDate, today) <= 30) departures.push({ v, date: v.secondExitDate, label: t('第二次離境', lang) });
  });
  arrivals.sort((a, b) => a.date.localeCompare(b.date));
  departures.sort((a, b) => a.date.localeCompare(b.date));

  const arrivalGroups = groupByLabel(arrivals, (x) => studentCompanyLabel(x.v.studentId, ctx));
  const departureGroups = groupByLabel(departures, (x) => studentCompanyLabel(x.v.studentId, ctx));

  function handleDownload() {
    const monthArrivals = [];
    const monthDepartures = [];
    allowedVisaRecords.forEach((v) => {
      if (v.firstEntryDate?.startsWith(reportMonth)) monthArrivals.push({ v, date: v.firstEntryDate, label: '第一次入境' });
      if (v.secondEntryDate?.startsWith(reportMonth)) monthArrivals.push({ v, date: v.secondEntryDate, label: '第二次入境' });
      if (v.firstExitDate?.startsWith(reportMonth)) monthDepartures.push({ v, date: v.firstExitDate, label: '第一次離境' });
      if (v.secondExitDate?.startsWith(reportMonth)) monthDepartures.push({ v, date: v.secondExitDate, label: '第二次離境' });
    });
    const combined = [...monthArrivals.map((x) => ({ ...x, type: '入台' })), ...monthDepartures.map((x) => ({ ...x, type: '離台' }))]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(({ v, date, label, type }) => ({
        studentName: studentFullLabel(studentById(v.studentId)),
        company: studentCompanyLabel(v.studentId, ctx),
        type,
        date,
        item: label,
      }));
    exportEntityCSV(
      combined,
      [
        { key: 'studentName', label: '學生' },
        { key: 'company', label: '客戶' },
        { key: 'type', label: '入台/離台' },
        { key: 'date', label: '日期' },
        { key: 'item', label: '項目' },
      ],
      `預計入台離台_${reportMonth}`
    );
  }

  function ListTable({ items, dateLabel, showArrivalExtras = false, showDepartureExtras = false }) {
    const extraFields = showArrivalExtras ? ARRIVAL_EXTRA_FIELDS : showDepartureExtras ? DEPARTURE_EXTRA_FIELDS : [];
    const colCount = 3 + extraFields.length + (showArrivalExtras ? 2 : 0);
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('學生', lang)}</th><th>{t(dateLabel, lang)}</th><th>{t('項目', lang)}</th>
              {extraFields.map((f) => <th key={f.key}>{t(f.label, lang)}</th>)}
              {showArrivalExtras && <><th>{t('已體檢', lang)}</th><th>{t('已送工', lang)}</th></>}
            </tr>
          </thead>
          <tbody>
            {items.map(({ v, date, label }, i) => (
              <tr key={`${v.id}-${label}-${i}`}>
                <td style={{ fontWeight: 600 }}>{studentFullLabel(studentById(v.studentId))}</td>
                <td>{date}</td>
                <td>{label}</td>
                {extraFields.map((f) => <td key={f.key}>{v[f.key] || '—'}</td>)}
                {showArrivalExtras && (
                  <>
                    <td>{v.healthCheckDone ? t('是', lang) : t('否', lang)}</td>
                    <td>{v.dispatchDone ? t('是', lang) : t('否', lang)}</td>
                  </>
                )}
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={colCount} className="muted">{t('目前沒有資料。', lang)}</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  function GroupList({ groups, dateLabel, showArrivalExtras, showDepartureExtras }) {
    if (groups.length === 0) return <p className="muted">{t('目前沒有資料。', lang)}</p>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {groups.map((g) => (
          <div className="card" key={g.label} style={{ overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>{g.label} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{g.rows.length} {t('位學生', lang)}</span></h3>
            <ListTable items={g.rows} dateLabel={dateLabel} showArrivalExtras={showArrivalExtras} showDepartureExtras={showDepartureExtras} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('預計入台/離台', lang)}</h2>
          <div className="page-desc">
            {t('在台簽證追蹤裡填有入境或離境時間（第一次／第二次皆可）且落在今天前後一個月內的學生，超過一個月自動從清單移除', lang)}
            {t('資料來源：境外生實習系統，僅顯示學生來源(國外供應商)為阮氏芳草、阿草、阿草（鳳仙）的紀錄，唯讀顯示，編輯請到境外生實習系統操作', lang)}
          </div>
        </div>
        <div className="row-actions">
          <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
          <button onClick={handleDownload}>{t('下載此月份報表', lang)}</button>
        </div>
      </div>
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>{t('入台', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{t('共', lang)} {arrivals.length} {t('筆', lang)}</span></h3>
            <GroupList groups={arrivalGroups} dateLabel="入境日期" showArrivalExtras />
          </div>
          <div>
            <h3 style={{ margin: '0 0 12px' }}>{t('離台', lang)} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{t('共', lang)} {departures.length} {t('筆', lang)}</span></h3>
            <GroupList groups={departureGroups} dateLabel="日期" showDepartureExtras />
          </div>
        </div>
      )}
    </div>
  );
}
