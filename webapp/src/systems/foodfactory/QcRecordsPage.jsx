import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCollection } from '../../lib/useCollection';
import { canEdit as computeCanEdit } from '../../lib/permissions';
import { evalQcItemPass } from '../../lib/qc';
import { exportEntityCSV } from '../../lib/csv';
import { useAuth } from '../../auth/AuthContext';
import { logChange, nowIso } from '../../lib/changeLog';

const CSV_FIELDS = [
  { key: 'date', label: '日期' }, { key: 'templateName', label: '範本' }, { key: 'refType', label: '關聯類型' },
  { key: 'refBatchNo', label: '關聯批號' }, { key: 'inspector', label: '檢驗人' }, { key: 'result', label: '總結果' },
  { key: 'updatedAt', label: '最後修改時間' },
];

export default function QcRecordsPage() {
  const { system, role, overrides } = useOutletContext();
  const { user } = useAuth();
  const canEditPage = computeCanEdit(system, 'qc', role, overrides);
  const { rows: records, loading, update, remove } = useCollection('foodfactory_qcRecords', { order: ['date', 'desc'] });
  const { rows: recordItems } = useCollection('foodfactory_qcRecordItems');
  const { rows: templates } = useCollection('foodfactory_qcTemplates');
  const { rows: templateItems } = useCollection('foodfactory_qcTemplateItems');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');

  const templateName = (id) => templates.find((t) => t.id === id)?.name || '(未知)';
  const searchQuery = q.trim().toLowerCase();
  const filteredRecords = records.filter((r) => !searchQuery || `${templateName(r.templateId)} ${r.refType || ''} ${r.refBatchNo || ''} ${r.inspector || ''}`.toLowerCase().includes(searchQuery));

  function handleDownload() {
    exportEntityCSV(records.map((r) => ({ ...r, templateName: templateName(r.templateId) })), CSV_FIELDS, '檢驗紀錄');
  }

  async function handleEditSave(data) {
    const { id, ...rest } = data;
    const updatedAt = nowIso();
    await update(id, { date: rest.date, refType: rest.refType, refBatchNo: rest.refBatchNo, inspector: rest.inspector, updatedAt });
    await logChange('檢驗紀錄', '編輯', `${templateName(rest.templateId)} ${rest.refBatchNo || ''}`, user?.email);
    setEditing(null);
  }

  async function handleDelete(record) {
    await remove(record.id);
    await logChange('檢驗紀錄', '刪除', `${templateName(record.templateId)} ${record.refBatchNo || ''}`, user?.email);
  }

  // 每個檢驗項目依範本的資料型態/標準值判定合不合格，全部合格記錄的總結果才是「合格」，
  // 跟原本 addQcRecord() 一致。
  async function handleCreate(record, items) {
    const evaluated = items.map((it) => {
      const tpl = templateItems.find((t) => t.id === it.templateItemId);
      return { ...it, pass: tpl ? evalQcItemPass(tpl.dataType, tpl.spec, it.value) : false };
    });
    const allPass = evaluated.every((it) => it.pass);
    const updatedAt = nowIso();
    const recordRef = await addDoc(collection(db, 'foodfactory_qcRecords'), { ...record, result: allPass ? '合格' : '不合格', updatedAt });
    await Promise.all(evaluated.map((it) =>
      addDoc(collection(db, 'foodfactory_qcRecordItems'), { recordId: recordRef.id, templateItemId: it.templateItemId, value: it.value, pass: it.pass })
    ));
    await logChange('檢驗紀錄', '新增', `${templateName(record.templateId)} ${record.refBatchNo || ''}`, user?.email);
    setCreating(false);
  }

  return (
    <div className="content">
      <div className="page-header">
        <h2>品質/食安 · 檢驗紀錄</h2>
        <div className="row-actions">
          {canEditPage && <button className="primary" onClick={() => setCreating(true)}>新增檢驗紀錄</button>}
          <button onClick={handleDownload}>下載完整資料</button>
        </div>
      </div>
      <div className="card">
        <input placeholder="搜尋範本/關聯類型/批號/檢驗人" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 260 }} />
        {loading ? <p className="muted">載入中…</p> : (
          <table>
            <thead><tr><th>日期</th><th>範本</th><th>關聯批號</th><th>檢驗人</th><th>總結果</th><th>最後修改時間</th>{canEditPage && <th></th>}</tr></thead>
            <tbody>
              {filteredRecords.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{templateName(r.templateId)}</td>
                  <td>{r.refType} {r.refBatchNo}</td>
                  <td>{r.inspector || '—'}</td>
                  <td>{r.result}</td>
                  <td>{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '—'}</td>
                  {canEditPage && (
                    <td className="row-actions">
                      <button onClick={() => setEditing(r)}>編輯</button>
                      <button className="danger" onClick={() => handleDelete(r)}>刪除</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredRecords.length === 0 && <tr><td colSpan={7} className="muted">沒有資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {creating && (
        <QcRecordFormModal templates={templates} templateItems={templateItems} recordItems={recordItems} onCancel={() => setCreating(false)} onSave={handleCreate} />
      )}
      {editing && <QcRecordEditModal initial={editing} onCancel={() => setEditing(null)} onSave={handleEditSave} />}
    </div>
  );
}

function QcRecordFormModal({ templates, templateItems, onCancel, onSave }) {
  const [record, setRecord] = useState({ date: new Date().toISOString().slice(0, 10) });
  const [values, setValues] = useState({});
  const items = templateItems.filter((it) => it.templateId === record.templateId);

  function submit(e) {
    e.preventDefault();
    const payload = items.map((it) => ({ templateItemId: it.id, value: values[it.id] || '' }));
    onSave(record, payload);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>新增檢驗紀錄</h3>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              範本
              <select required value={record.templateId || ''} onChange={(e) => setRecord({ ...record, templateId: e.target.value })}>
                <option value="" disabled>請選擇</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label>日期<input type="date" required value={record.date} onChange={(e) => setRecord({ ...record, date: e.target.value })} /></label>
            <label>關聯類型<input value={record.refType || ''} onChange={(e) => setRecord({ ...record, refType: e.target.value })} placeholder="例如 進貨/生產批次" /></label>
            <label>關聯批號<input value={record.refBatchNo || ''} onChange={(e) => setRecord({ ...record, refBatchNo: e.target.value })} /></label>
            <label>檢驗人<input value={record.inspector || ''} onChange={(e) => setRecord({ ...record, inspector: e.target.value })} /></label>
          </div>
          {items.length > 0 && (
            <>
              <h4>檢驗項目</h4>
              <div className="form-grid">
                {items.map((it) => (
                  <label key={it.id}>
                    {it.itemName} {it.spec && <span className="muted">（{it.spec}）</span>}
                    <input value={values[it.id] || ''} onChange={(e) => setValues({ ...values, [it.id]: e.target.value })} />
                  </label>
                ))}
              </div>
            </>
          )}
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function QcRecordEditModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>編輯檢驗紀錄</h3>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <label>日期<input type="date" required value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label>關聯類型<input value={form.refType || ''} onChange={(e) => setForm({ ...form, refType: e.target.value })} /></label>
            <label>關聯批號<input value={form.refBatchNo || ''} onChange={(e) => setForm({ ...form, refBatchNo: e.target.value })} /></label>
            <label>檢驗人<input value={form.inspector || ''} onChange={(e) => setForm({ ...form, inspector: e.target.value })} /></label>
          </div>
          <p className="muted">範本與檢驗項目數值請刪除重建，避免跟合格判定結果對不起來。</p>
          <div className="row-actions">
            <button type="submit" className="primary">儲存</button>
            <button type="button" onClick={onCancel}>取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}
