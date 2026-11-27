import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  WORK_ITEMS, WORK_RATING_OPTIONS, LIFE_ITEMS, LIFE_RATING_OPTIONS,
  blankRatings, blankNotes, visitRecordDocId,
} from '../lib/monthlyVisitRecord';
import SignaturePad from '../components/SignaturePad';

// 公開的「每月訪視紀錄」線上填寫頁面（/apply/visitRecord/:studentId/:month/:role），
// 不需要登入，從在台關懷紀錄頁面的「取得填寫連結」按鈕產生。role=student
// 只能填「生活適應情況」評核表、學生意見、本月學習成果(本月完成之工作
// 內容/本月學習收穫/遇到之困難/下月學習目標，這是學生自己這個月的狀況，
// 由學生自己填才準確)跟簽名，role=manager 只能填「實習狀況」評核表、
// 企業主管意見跟簽名，跟 firestore.rules 的 tsIsPublicVisitFieldUpdate()
// 是同一套範圍——即使有人改網址想動別的欄位，規則也會擋掉。
// 連結只用文件 ID（學生ID_月份）直接 get，不會查詢/列出其他學生的紀錄，
// 但知道連結的人看得到這份紀錄的全部內容（企業主管意見、學生意見都在
// 同一份文件裡，Firestore 規則沒辦法做到「只給看自己負責那一半欄位」），
// 所以連結要一對一傳送，不要公開張貼。
const ROLE_LABELS = { student: '學生', manager: '企業主管' };

function RatingSection({ items, options, values, notes, onRate, onNote }) {
  return (
    <div className="table-wrap" style={{ marginBottom: 12 }}>
      <table>
        <thead><tr><th>項目</th>{options.map((o) => <th key={o}>{o}</th>)}<th>備註</th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item}>
              <td>{item}</td>
              {options.map((o) => (
                <td key={o}>
                  <input type="radio" name={`rating-${item}`} checked={values[item] === o} onChange={() => onRate(item, o)} />
                </td>
              ))}
              <td><input value={notes[item] || ''} onChange={(e) => onNote(item, e.target.value)} style={{ width: 140 }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MonthlyVisitFormPage() {
  const { studentId, month, role } = useParams();
  const [record, setRecord] = useState(undefined); // undefined=載入中, null=找不到
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState('');

  const validRole = role === 'student' || role === 'manager';

  useEffect(() => {
    if (!validRole) return;
    let cancelled = false;
    getDoc(doc(db, 'tsaipei_monthlyVisitRecords', visitRecordDocId(studentId, month))).then((snap) => {
      if (cancelled) return;
      if (!snap.exists()) { setRecord(null); return; }
      const data = snap.data();
      setRecord(data);
      if (role === 'student') {
        setForm({
          studentComment: data.studentComment || '',
          lifeRatings: { ...blankRatings(LIFE_ITEMS), ...(data.lifeRatings || {}) },
          lifeNotes: { ...blankNotes(LIFE_ITEMS), ...(data.lifeNotes || {}) },
          studentSignature: data.studentSignature || '',
          monthlyWorkDone: data.monthlyWorkDone || '',
          monthlyLearning: data.monthlyLearning || '',
          difficulties: data.difficulties || '',
          nextMonthGoals: data.nextMonthGoals || '',
        });
      } else {
        setForm({
          managerComment: data.managerComment || '',
          workRatings: { ...blankRatings(WORK_ITEMS), ...(data.workRatings || {}) },
          workNotes: { ...blankNotes(WORK_ITEMS), ...(data.workNotes || {}) },
          managerSignature: data.managerSignature || '',
        });
      }
    }).catch(() => { if (!cancelled) setLoadError('讀取失敗，請稍後再試一次，或聯絡窗口重新取得連結。'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, month, role, validRole]);

  if (!validRole) return <div className="content"><p>連結無效，請跟窗口確認連結是否正確。</p></div>;
  if (loadError) return <div className="content"><p>{loadError}</p></div>;
  if (record === undefined) return <div className="content"><p className="muted">載入中…</p></div>;
  if (record === null) return <div className="content"><p>找不到這份訪視紀錄，請確認連結正確，或聯絡窗口重新取得連結。</p></div>;

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setRating(group, item, value) {
    setForm((f) => ({ ...f, [group]: { ...f[group], [item]: value } }));
  }
  function setNote(group, item, value) {
    setForm((f) => ({ ...f, [group]: { ...f[group], [item]: value } }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, 'tsaipei_monthlyVisitRecords', visitRecordDocId(studentId, month)), form);
      setSaved(true);
    } catch (err) {
      setLoadError(`送出失敗：${err.message || err}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h2>每月訪視紀錄 · {ROLE_LABELS[role]}填寫</h2>
          <div className="page-desc">{record.studentName || '—'}　{month}</div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <label>學生姓名<input value={record.studentName || ''} disabled /></label>
          <label>國籍<input value={record.nationality || ''} disabled /></label>
          <label>實習企業<input value={record.company || ''} disabled /></label>
          <label>實習分店<input value={record.venue || ''} disabled /></label>
          <label>實習部門<input value={record.department || ''} disabled /></label>
        </div>
      </div>
      {saved ? (
        <p>已送出，謝謝您的填寫！如果還要修改，直接重新整理這個頁面再填一次送出即可。</p>
      ) : (
        <form onSubmit={handleSubmit}>
          {role === 'student' ? (
            <>
              <h3>生活適應情況</h3>
              <RatingSection
                items={LIFE_ITEMS}
                options={LIFE_RATING_OPTIONS}
                values={form.lifeRatings}
                notes={form.lifeNotes}
                onRate={(item, v) => setRating('lifeRatings', item, v)}
                onNote={(item, v) => setNote('lifeNotes', item, v)}
              />
              <label>學生意見<textarea rows={3} value={form.studentComment} onChange={(e) => setField('studentComment', e.target.value)} style={{ width: '100%' }} /></label>
              <h3>本月學習成果</h3>
              <label>本月完成之工作內容<textarea rows={2} value={form.monthlyWorkDone} onChange={(e) => setField('monthlyWorkDone', e.target.value)} style={{ width: '100%' }} /></label>
              <label>本月學習收穫<textarea rows={2} value={form.monthlyLearning} onChange={(e) => setField('monthlyLearning', e.target.value)} style={{ width: '100%' }} /></label>
              <label>遇到之困難<textarea rows={2} value={form.difficulties} onChange={(e) => setField('difficulties', e.target.value)} style={{ width: '100%' }} /></label>
              <label>下月學習目標<textarea rows={2} value={form.nextMonthGoals} onChange={(e) => setField('nextMonthGoals', e.target.value)} style={{ width: '100%' }} /></label>
              <div style={{ marginBottom: 4 }}>簽名</div><SignaturePad value={form.studentSignature} onChange={(v) => setField('studentSignature', v)} />
            </>
          ) : (
            <>
              <h3>實習狀況</h3>
              <RatingSection
                items={WORK_ITEMS}
                options={WORK_RATING_OPTIONS}
                values={form.workRatings}
                notes={form.workNotes}
                onRate={(item, v) => setRating('workRatings', item, v)}
                onNote={(item, v) => setNote('workNotes', item, v)}
              />
              <label>企業主管意見<textarea rows={3} value={form.managerComment} onChange={(e) => setField('managerComment', e.target.value)} style={{ width: '100%' }} /></label>
              <div style={{ marginBottom: 4 }}>簽名</div><SignaturePad value={form.managerSignature} onChange={(v) => setField('managerSignature', v)} />
            </>
          )}
          {loadError && <p style={{ color: 'var(--danger)' }}>{loadError}</p>}
          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="submit" className="primary" disabled={saving}>{saving ? '送出中…' : '送出'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
