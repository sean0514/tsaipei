import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import ImportExportButtons from '../../components/ImportExportButtons';
import { useCsvOverwrite } from '../../lib/useCsvOverwrite';
import { t } from '../../lib/i18n';

const CURRENCIES = ['台幣', '美金'];

const FIELDS = [
  { key: 'paymentDate', label: '付款時間', type: 'date' },
  { key: 'company', label: '單位名稱', required: true },
  { key: 'studentId', label: '學生', type: 'student' },
  { key: 'currency', label: '幣別', type: 'currency' },
  { key: 'amount', label: '金額', type: 'number' },
  { key: 'twdAmount', label: '台幣金額(美金時填，公司損益需要台幣金額才能算進去)', type: 'number' },
  { key: 'foreignRefund1', label: '國外回款1', type: 'number' },
  { key: 'foreignRefund1Date', label: '國外回款1日期', type: 'date' },
  { key: 'foreignRefund2', label: '國外回款2', type: 'number' },
  { key: 'foreignRefund2Date', label: '國外回款2日期', type: 'date' },
  { key: 'foreignRefund3', label: '國外回款3', type: 'number' },
  { key: 'foreignRefund3Date', label: '國外回款3日期', type: 'date' },
  { key: 'notes', label: '備註' },
];

const CSV_FIELDS = [{ key: 'id', label: 'ID' }, ...FIELDS, { key: 'paid', label: '是否已付款' }, { key: 'confirmedClosed', label: '結案' }];

// 複製自 systems/tsaipei/ForeignPaymentPage.jsx，collection 字首改成
// vietnam_，介面文字包上 t(...)。
export default function ForeignPaymentPage() {
  const { system, role, overrides, lang } = useOutletContext();
  const canEditPage = computeCanEdit(system, 'foreignPayment', role, overrides);
  const { rows, loading, add, update, remove } = useCollection('vietnam_foreignPayments');
  const { rows: students } = useCollection('vietnam_students');
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { handleExport, handleImport } = useCsvOverwrite('vietnam_foreignPayments', CSV_FIELDS, { entityLabel: '國外付款紀錄', requiredKeys: ['company'], canEdit: canEditPage });

  const studentName = (id) => { const s = students.find((x) => x.id === id); return s?.chineseName || s?.originalName || ''; };

  const searchQuery = q.trim().toLowerCase();
  const filtered = rows
    .filter((r) => !r.confirmedClosed)
    .filter((r) => !searchQuery || `${r.company || ''} ${studentName(r.studentId)}`.toLowerCase().includes(searchQuery));

  const byCompany = {};
  filtered.forEach((r) => { (byCompany[r.company || '未指定單位'] ||= []).push(r); });
  const companies = Object.keys(byCompany).sort((a, b) => a.localeCompare(b));
  companies.forEach((c) => byCompany[c].sort((a, b) => {
    const aPaid = a.paid === '是' ? 1 : 0;
    const bPaid = b.paid === '是' ? 1 : 0;
    return aPaid !== bPaid ? aPaid - bPaid : (b.paymentDate || '').localeCompare(a.paymentDate || '');
  }));

  async function handleSave(data) {
    if (data.id) {
      const { id, ...rest } = data;
      await update(id, rest);
    } else {
      await add({ currency: '台幣', ...data });
    }
    setEditing(null);
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h2>{t('國外付款紀錄', lang)}</h2>
          <div className="page-desc">{t('依供應商（單位名稱）分類；「國外補助申請」核准後會自動帶入一筆待付款紀錄', lang)}{!canEditPage && `（${t('唯讀', lang)}）`}</div>
        </div>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setEditing({})}>+ {t('新增紀錄', lang)}</button>}
          <ImportExportButtons rows={rows} onExport={handleExport} onImport={handleImport} canEdit={canEditPage} />
        </div>
      </div>
      {canEditPage && <p className="split-note">{t('「匯入資料」需使用「下載完整資料」產生的 CSV 檔案編輯；上傳後會完全取代目前所有國外付款紀錄，請先下載備份再匯入。', lang)}</p>}
      <input placeholder={t('搜尋單位名稱或學生', lang)} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16, width: 260 }} />
      {loading ? <p className="muted">{t('載入中…', lang)}</p> : (
        companies.length === 0 ? <p className="muted">{searchQuery ? t('沒有符合搜尋條件的紀錄。', lang) : t('目前沒有國外付款紀錄。', lang)}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {companies.map((company) => (
              <div className="card" key={company}>
                <h3 style={{ marginTop: 0 }}>{company} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{byCompany[company].length} {t('筆', lang)}</span></h3>
                <div className="table-wrap"><table>
                  <thead><tr><th>{t('付款時間', lang)}</th><th>{t('學生', lang)}</th><th>{t('金額', lang)}</th><th>{t('是否已付款', lang)}</th><th>{t('國外回款1', lang)}</th><th>{t('國外回款2', lang)}</th><th>{t('國外回款3', lang)}</th><th>{t('備註', lang)}</th>{canEditPage && <th></th>}</tr></thead>
                  <tbody>
                    {byCompany[company].map((r) => (
                      <tr key={r.id}>
                        <td>{r.paymentDate || '—'}</td>
                        <td>{studentName(r.studentId) || '—'}</td>
                        <td>
                          {r.amount ? `${r.currency || '台幣'} ${Number(r.amount).toLocaleString()}` : '—'}
                          {r.currency === '美金' && r.twdAmount ? `（台幣 ${Number(r.twdAmount).toLocaleString()}）` : ''}
                        </td>
                        <td>{r.paid === '是' ? t('已付款', lang) : t('未付款', lang)}</td>
                        <td>{r.foreignRefund1 ? `${Number(r.foreignRefund1).toLocaleString()}${r.foreignRefund1Date ? `（${r.foreignRefund1Date}）` : ''}` : '—'}</td>
                        <td>{r.foreignRefund2 ? `${Number(r.foreignRefund2).toLocaleString()}${r.foreignRefund2Date ? `（${r.foreignRefund2Date}）` : ''}` : '—'}</td>
                        <td>{r.foreignRefund3 ? `${Number(r.foreignRefund3).toLocaleString()}${r.foreignRefund3Date ? `（${r.foreignRefund3Date}）` : ''}` : '—'}</td>
                        <td>{r.notes || '—'}</td>
                        {canEditPage && (
                          <td className="row-actions">
                            <button onClick={() => update(r.id, { paid: r.paid === '是' ? '否' : '是' })}>{r.paid === '是' ? t('取消已付款', lang) : t('標記已付款', lang)}</button>
                            <button onClick={() => setEditing(r)}>{t('編輯', lang)}</button>
                            <button onClick={() => update(r.id, { confirmedClosed: true })}>{t('結案', lang)}</button>
                            <button className="danger" onClick={() => remove(r.id)}>{t('刪除', lang)}</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            ))}
          </div>
        )
      )}
      {editing && <ForeignPaymentFormModal initial={editing} students={students} onCancel={() => setEditing(null)} onSave={handleSave} lang={lang} />}
    </div>
  );
}

function ForeignPaymentFormModal({ initial, students, onCancel, onSave, lang }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.id ? t('編輯付款紀錄', lang) : t('新增付款紀錄', lang)}</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            {FIELDS.map((f) => {
              if (f.key === 'twdAmount' && form.currency !== '美金') return null;
              if (f.key === 'studentId') {
                return (
                  <label key={f.key}>
                    {t('學生', lang)}
                    <select value={form.studentId || ''} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                      <option value="">{t('（未指定）', lang)}</option>
                      {students.map((s) => <option key={s.id} value={s.id}>{s.chineseName || s.originalName}</option>)}
                    </select>
                  </label>
                );
              }
              if (f.type === 'currency') {
                return (
                  <label key={f.key}>
                    {t(f.label, lang)}
                    <select value={form.currency || '台幣'} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                );
              }
              return (
                <label key={f.key}>
                  {t(f.label, lang)}
                  <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                </label>
              );
            })}
            <label>
              {t('是否已付款', lang)}
              <select value={form.paid === '是' ? '是' : '否'} onChange={(e) => setForm({ ...form, paid: e.target.value })}>
                <option value="否">{t('否', lang)}</option>
                <option value="是">{t('是', lang)}</option>
              </select>
            </label>
          </div>
          <div className="row-actions">
            <button type="submit" className="primary">{t('儲存', lang)}</button>
            <button type="button" onClick={onCancel}>{t('取消', lang)}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
